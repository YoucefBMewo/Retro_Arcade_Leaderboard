import { validateScore, isCooldownBlocked, sortLeaderboard } from "../service";

// ── validateScore ─────────────────────────────────────────────────────────

describe("validateScore", () => {
  test("un score valide est accepté", () => {
    const result = validateScore("pacman", 50_000);
    expect(result.valid).toBe(true);
  });

  test("un jeu inconnu est rejeté (400)", () => {
    const result = validateScore("mario", 100);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("unknown_game");
      expect(result.status).toBe(400);
    }
  });

  test("un score négatif est rejeté (422)", () => {
    const result = validateScore("tetris", -1);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("negative_score");
      expect(result.status).toBe(422);
    }
  });

  test("un score supérieur au maximum du jeu est rejeté (422)", () => {
    const result = validateScore("pacman", 1_000_000); // max = 999 999
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("score_too_high");
      expect(result.status).toBe(422);
    }
  });

  test("le score exactement égal au maximum est accepté", () => {
    expect(validateScore("pacman", 999_999).valid).toBe(true);
    expect(validateScore("tetris", 9_999_999).valid).toBe(true);
    expect(validateScore("snake", 99_999).valid).toBe(true);
  });

  test("un score de zéro est accepté", () => {
    expect(validateScore("breakout", 0).valid).toBe(true);
  });
});

//  isCooldownBlocked 

describe("isCooldownBlocked", () => {
  const NOW = 1_000_000;

  test("bloque une soumission dans les 2 secondes (500 ms après)", () => {
    expect(isCooldownBlocked(NOW - 500, NOW)).toBe(true);
  });

  test("bloque une soumission exactement à 1999 ms", () => {
    expect(isCooldownBlocked(NOW - 1_999, NOW)).toBe(true);
  });

  test("autorise une soumission après 2 secondes exactement", () => {
    expect(isCooldownBlocked(NOW - 2_000, NOW)).toBe(false);
  });

  test("autorise une soumission bien après le cooldown (5 s)", () => {
    expect(isCooldownBlocked(NOW - 5_000, NOW)).toBe(false);
  });

  test("autorise si aucune soumission précédente (lastMs = null)", () => {
    expect(isCooldownBlocked(null, NOW)).toBe(false);
  });
});

// sortLeaderboard 

describe("sortLeaderboard", () => {
  test("trie du meilleur score au moins bon", () => {
    const input = [
      { player: "Alice", score: 100 },
      { player: "Bob",   score: 500 },
      { player: "Carol", score: 300 },
    ];
    const sorted = sortLeaderboard(input);
    expect(sorted.map(e => e.player)).toEqual(["Bob", "Carol", "Alice"]);
  });

  test("ne modifie pas le tableau d'origine", () => {
    const input = [
      { player: "A", score: 10 },
      { player: "B", score: 50 },
    ];
    sortLeaderboard(input);
    expect(input[0]!.player).toBe("A"); // ordre d'origine préservé
  });

  test("gère un tableau vide", () => {
    expect(sortLeaderboard([])).toEqual([]);
  });

  test("gère un seul élément", () => {
    const result = sortLeaderboard([{ player: "Solo", score: 42 }]);
    expect(result).toHaveLength(1);
    expect(result[0]!.player).toBe("Solo");
  });

  test("scores égaux : les deux entrées sont conservées", () => {
    const result = sortLeaderboard([
      { player: "A", score: 100 },
      { player: "B", score: 100 },
    ]);
    expect(result).toHaveLength(2);
  });
});
