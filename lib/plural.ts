/**
 * České skloňování pro „hráč“:
 *   1      → hráč
 *   2–4    → hráči
 *   0, 5+  → hráčů (v češtině i 21, 22, 101 → „hráčů“, na rozdíl od polštiny/ruštiny)
 */
export function playerWord(count: number): "hráč" | "hráči" | "hráčů" {
  if (count === 1) return "hráč";
  if (Number.isInteger(count) && count >= 2 && count <= 4) return "hráči";
  return "hráčů";
}

export function formatPlayers(count: number): string {
  return `${count} ${playerWord(count)}`;
}
