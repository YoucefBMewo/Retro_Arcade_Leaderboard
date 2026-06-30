import express from "express";
import type { Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import Redis from "ioredis";
import "dotenv/config";
import { max_scores, type SUPPORTED_GAME } from "./data.js";
import { validateScore, isCooldownBlocked } from "./service.js";

// ── PostgreSQL ──────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env["DB_HOST"]     ?? "db",
  port:     Number(process.env["DB_PORT"]     ?? 5432),
  user:     process.env["DB_USER"],
  password: process.env["DB_PASSWORD"],
  database: process.env["DB_NAME"],
});

async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id         SERIAL      PRIMARY KEY,
      player     TEXT        NOT NULL,
      game       TEXT        NOT NULL,
      score      INTEGER     NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_game_score ON scores(game, score DESC);
    CREATE INDEX IF NOT EXISTS idx_player     ON scores(player);
  `);
}

// ── Redis (cooldown 2 s) ────────────────────────────────────────────────────
const redis = new Redis({
  host:     process.env["REDIS_HOST"]     ?? "redis",
  port:     Number(process.env["REDIS_PORT"]     ?? 6379),
  password: process.env["REDIS_PASSWORD"],
});

// ── Métriques manuelles (format Prometheus text) ────────────────────────────
type Labels = Record<string, string>;

function labelsToStr(labels: Labels): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  return parts.length ? `{${parts.join(",")}}` : "";
}

// Counters : name -> labelKey -> value
const counters = new Map<string, Map<string, number>>();

function incCounter(name: string, labels: Labels = {}): void {
  if (!counters.has(name)) counters.set(name, new Map());
  const key = labelsToStr(labels);
  const inner = counters.get(name)!;
  inner.set(key, (inner.get(key) ?? 0) + 1);
}

// Histogramme latence : labelKey -> { labels, buckets, sum, count }
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];

interface HistoEntry { labels: Labels; buckets: Map<number, number>; sum: number; count: number }
const latencyStore = new Map<string, HistoEntry>();

function observeLatency(labels: Labels, valueSec: number): void {
  const key = labelsToStr(labels);
  let h = latencyStore.get(key);
  if (!h) {
    h = { labels, buckets: new Map(BUCKETS.map(b => [b, 0])), sum: 0, count: 0 };
    latencyStore.set(key, h);
  }
  for (const b of BUCKETS) {
    if (valueSec <= b) h.buckets.set(b, h.buckets.get(b)! + 1);
  }
  h.sum += valueSec;
  h.count += 1;
}

function renderMetrics(): string {
  const lines: string[] = [];

  const counterDefs: Array<[string, string]> = [
    ["http_requests_total",           "Nombre total de requêtes HTTP"],
    ["scores_submitted_total",        "Scores soumis par jeu"],
    ["scores_rejected_total",         "Scores rejetés par jeu et motif"],
    ["leaderboard_consultations_total", "Consultations de classement"],
  ];

  for (const [name, help] of counterDefs) {
    const inner = counters.get(name);
    if (!inner?.size) continue;
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`);
    for (const [labelKey, count] of inner) lines.push(`${name}${labelKey} ${count}`);
  }

  if (latencyStore.size) {
    lines.push(
      "# HELP http_request_duration_seconds Latence des requêtes HTTP",
      "# TYPE http_request_duration_seconds histogram"
    );
    for (const h of latencyStore.values()) {
      const base = Object.entries(h.labels).map(([k, v]) => `${k}="${v}"`).join(",");
      for (const [le, cnt] of h.buckets) {
        lines.push(`http_request_duration_seconds_bucket{${base},le="${le}"} ${cnt}`);
      }
      lines.push(
        `http_request_duration_seconds_bucket{${base},le="+Inf"} ${h.count}`,
        `http_request_duration_seconds_sum{${base}} ${h.sum.toFixed(6)}`,
        `http_request_duration_seconds_count{${base}} ${h.count}`
      );
    }
  }

  return lines.join("\n") + "\n";
}

//App Express 
const app = express();
app.use(express.json());

// Middleware métriques (latence + comptage requêtes)
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = { route: req.path, method: req.method };
    observeLatency(labels, durationSec);
    incCounter("http_requests_total", { ...labels, status: String(res.statusCode) });
  });
  next();
});

// GET /health
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// GET /metrics
app.get("/metrics", (_req: Request, res: Response) => {
  res.set("Content-Type", "text/plain; version=0.0.4");
  res.end(renderMetrics());
});

// GET /games
app.get("/games", (_req: Request, res: Response) => {
  res.json(Object.entries(max_scores).map(([name, maxScore]) => ({ name, maxScore })));
});

// POST /scores
app.post("/scores", async (req: Request, res: Response) => {
  const { player, game, score } = req.body as { player?: string; game?: SUPPORTED_GAME; score?: number };

  if (!player || !game || score === undefined) {
    return res.status(400).json({ error: "player, game et score sont requis" });
  }
  const validation = validateScore(game, score);
  if (!validation.valid) {
    incCounter("scores_rejected_total", { game: game in max_scores ? game : "unknown", reason: validation.reason });
    return res.status(validation.status).json({ error: validation.reason });
  }

  // Cooldown Redis : on lit le timestamp stocké, on vérifie avec isCooldownBlocked, puis on met à jour
  const cooldownKey = `cooldown:${player}:${game}`;
  const lastRaw = await redis.get(cooldownKey);
  const lastMs = lastRaw !== null ? Number(lastRaw) : null;
  if (isCooldownBlocked(lastMs)) {
    incCounter("scores_rejected_total", { game, reason: "cooldown" });
    return res.status(429).json({ error: "Soumission trop rapide, attendez 2 secondes" });
  }
  await redis.set(cooldownKey, String(Date.now()), "EX", 2);

  await pool.query(
    "INSERT INTO scores (player, game, score) VALUES ($1, $2, $3)",
    [player, game, score]
  );
  const { rows } = await pool.query<{ rank: string }>(
    "SELECT COUNT(*) AS rank FROM scores WHERE game = $1 AND score >= $2",
    [game, score]
  );

  incCounter("scores_submitted_total", { game });
  return res.status(201).json({ rank: Number(rows[0]!.rank) });
});

// GET /leaderboard/:game?limit=10
app.get("/leaderboard/:game", async (req: Request, res: Response) => {
  const game = req.params["game"] as SUPPORTED_GAME;
  if (!(game in max_scores)) {
    return res.status(400).json({ error: "Jeu inconnu" });
  }

  const limitRaw = Number(req.query["limit"] ?? 10);
  const limit = Math.min(isNaN(limitRaw) ? 10 : limitRaw, 100);

  incCounter("leaderboard_consultations_total", { game });
  const { rows } = await pool.query(
    "SELECT player, score FROM scores WHERE game = $1 ORDER BY score DESC LIMIT $2",
    [game, limit]
  );
  return res.json(rows);
});

// GET /players/:player
app.get("/players/:player", async (req: Request, res: Response) => {
  const { player } = req.params;
  const { rows } = await pool.query(
    "SELECT game, MAX(score) AS score FROM scores WHERE player = $1 GROUP BY game ORDER BY score DESC",
    [player]
  );
  return res.json(rows);
});

//  Démarrage 
const PORT = Number(process.env["PORT"] ?? 8000);

initDb()
  .then(() => app.listen(PORT, () => console.log(`API Arcade démarrée sur le port ${PORT}`)))
  .catch((err: unknown) => {
    console.error("Erreur d'initialisation DB :", err);
    process.exit(1);
  });