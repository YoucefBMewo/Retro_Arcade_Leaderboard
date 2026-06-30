# Retro Arcade Leaderboard

## AHMED AYACHI & Youcef BOUHZAM

## Démarrage rapide

Copiez le fichier d'environnement :

```bash
cp .env.example .env
```

### Développement (hot-reload)

```bash
docker compose -f compose.yml -f compose.dev.yml up --build
```

Le code source est monté en volume — toute modification `.ts` redémarre l'API automatiquement.

### Production

```bash
docker compose up --build -d
```

L'image est construite via le `Dockerfile` multi-stage. Les conteneurs redémarrent automatiquement en cas de crash.

---

## Services disponibles

| Service | URL |
|---|---|
| API | http://localhost:8000 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 |

---

## API

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/scores` | Soumet un score `{ player, game, score }` → `{ rank }` |
| `GET` | `/leaderboard/:game` | Classement d'un jeu (param `?limit=10`) |
| `GET` | `/players/:player` | Meilleurs scores d'un joueur |
| `GET` | `/games` | Liste des jeux et scores maximum |
| `GET` | `/health` | Healthcheck |
| `GET` | `/metrics` | Métriques Prometheus |

Les scores sont rejetés (`400` / `422` / `429`) si le jeu est inconnu, le score négatif ou au-dessus du maximum, ou si le même joueur soumet deux fois en moins de 2 secondes.

---

## Tests

```bash
npm test
```

16 tests Jest sur la logique métier pure (`validateScore`, `isCooldownBlocked`, `sortLeaderboard`).

---

## CI/CD

Pipeline GitHub Actions déclenché à chaque push :

- **Build / Lint / Tests** (ESLint + Jest)
- **Audit des dépendances** (npm audit)
- **SAST** (Semgrep — OWASP Top 10, secrets, Node.js)
- **Scan image Docker** (Trivy — CVE HIGH/CRITICAL)

Captures d'écran dans `images/`.

---

## Monitoring

**Prometheus** scrape `/metrics` toutes les 10 secondes.

**Grafana** — login `admin` / mot de passe dans `.env` (`GRAFANA_ADMIN_PASSWORD`)

Le dashboard est provisionné automatiquement au démarrage. Il affiche le trafic HTTP, la latence (p95), le taux d'erreur et les tentatives de triche (scores rejetés par motif).

