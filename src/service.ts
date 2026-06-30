import { max_scores } from "./data";
import type { SUPPORTED_GAME } from "./data";

export type RejectReason = "unknown_game" | "negative_score" | "score_too_high" | "cooldown";

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: RejectReason; status: 400 | 422 | 429 };


export function validateScore(game: string, score: number): ValidationResult {
  if (!(game in max_scores))
    return { valid: false, reason: "unknown_game", status: 400 };
  if (score < 0)
    return { valid: false, reason: "negative_score", status: 422 };
  if (score > max_scores[game as SUPPORTED_GAME])
    return { valid: false, reason: "score_too_high", status: 422 };
  return { valid: true };
}

/**
 * Vérifie si un joueur est encore en période de cooldown.
 */
export function isCooldownBlocked(lastMs: number | null, nowMs = Date.now()): boolean {
  return lastMs !== null && nowMs - lastMs < 2000;
}

/**
 * Trie un tableau d'entrées du meilleur score au moins bon.
 */
export function sortLeaderboard<T extends { score: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.score - a.score);
}
