export type SUPPORTED_GAME = "pacman"|"tetris"|"snake"|"breakout"|"donkeykong";

export const max_scores: Record<SUPPORTED_GAME, number> = {
    "pacman":   999999,
    "tetris": 9999999,
    "snake":    99999,
    "breakout":   896980,
    "donkeykong": 1247700,
}