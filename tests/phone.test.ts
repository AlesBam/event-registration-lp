import { describe, expect, it } from "vitest";
import { loadAppsScript } from "./loadAppsScript";

const gs = loadAppsScript();

describe("normalizePhone (Code.gs)", () => {
  it.each([
    ["777123456", "+420777123456"],
    ["777 123 456", "+420777123456"],
    ["+420 777 123 456", "+420777123456"],
    ["+420777123456", "+420777123456"],
    ["00420777123456", "+420777123456"],
    ["00420 777 123 456", "+420777123456"],
    ["420777123456", "+420777123456"],
    ["777-123-456", "+420777123456"],
    ["(+420) 777 123 456", "+420777123456"],
    ["  603 123 456  ", "+420603123456"],
    ["777\u00a0123\u00a0456", "+420777123456"], // nezlomitelné mezery z WhatsAppu
    ["+420\u202f777\u202f123\u202f456", "+420777123456"],
  ])("přijme %j → %s", (input, expected) => {
    expect(gs.normalizePhone(input)).toBe(expected);
  });

  it.each([
    ["", "prázdné"],
    ["   ", "jen mezery"],
    ["77712345", "8 číslic"],
    ["7771234567", "10 číslic"],
    ["+42077712345", "předvolba + 8 číslic"],
    ["+4207771234567", "předvolba + 10 číslic"],
    ["222123456", "pevná linka (začíná 2)"],
    ["577123456", "začíná 5"],
    ["+421777123456", "slovenská předvolba"],
    ["+49777123456", "německá předvolba"],
    ["0777123456", "úvodní nula"],
    ["777123abc", "písmena"],
    ["777 123 45a", "písmeno na konci"],
    ["+420+420777123456", "dvojitá předvolba"],
    ["=1+1", "vzorec"],
    ["7".repeat(41), "přes 40 znaků"],
  ])("odmítne %j (%s)", (input) => {
    expect(gs.normalizePhone(input)).toBeNull();
  });

  it("9místné číslo začínající 420 neořeže (není to předvolba)", () => {
    // 420 123 456 by po ořezu měl 6 číslic; navíc nezačíná 6/7 → null, ale ne kvůli ořezu.
    expect(gs.normalizePhone("420123456")).toBeNull();
  });

  it("odmítne ne-string vstupy", () => {
    for (const v of [null, undefined, 777123456, {}, []]) {
      expect(gs.normalizePhone(v)).toBeNull();
    }
  });
});
