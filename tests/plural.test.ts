import { describe, expect, it } from "vitest";
import { formatPlayers, playerWord } from "../lib/plural";

describe("skloňování hráč/hráči/hráčů", () => {
  it.each([
    [0, "0 hráčů"],
    [1, "1 hráč"],
    [2, "2 hráči"],
    [3, "3 hráči"],
    [4, "4 hráči"],
    [5, "5 hráčů"],
    [11, "11 hráčů"],
    [14, "14 hráčů"],
    [21, "21 hráčů"],
    [22, "22 hráčů"],
    [101, "101 hráčů"],
  ])("%i → %s", (n, expected) => {
    expect(formatPlayers(n)).toBe(expected);
  });

  it("neceločíselné a záporné hodnoty → hráčů", () => {
    expect(playerWord(2.5)).toBe("hráčů");
    expect(playerWord(-1)).toBe("hráčů");
  });
});
