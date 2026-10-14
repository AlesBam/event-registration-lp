import { describe, expect, it } from "vitest";
import { MESSAGES, normalizePhone as normalizeClient, registrationSchema } from "../lib/schema";
import { loadAppsScript } from "./loadAppsScript";

/**
 * Validace je vědomě duplikovaná (Code.gs autoritativně, lib/schema.ts pro UX).
 * Tento test hlídá, že se obě kopie nerozešly: klient nesmí odmítnout něco,
 * co skript přijme (člověk by se nemohl registrovat), a neměl by přijmout
 * něco, co skript odmítne (chybu by dostal až ze serveru).
 */
const gs = loadAppsScript();

const PHONES = [
  "777123456", "777 123 456", "+420 777 123 456", "+420777123456", "00420777123456",
  "420777123456", "777-123-456", "(+420) 777 123 456", "777 123 456",
  "", "77712345", "7771234567", "222123456", "+421777123456", "0777123456",
  "777123abc", "420123456", "+420+420777123456", "=1+1", "603 123 456",
];

const NAMES = ["Jan Novák", "J", "  Jo  ", "a".repeat(100), "a".repeat(101), "   ", "=1+1", "Jan\u0000N", "😀😀", "😀".repeat(100)];

const base = { name: "Jan Novák", phone: "777123456", category: "casual", racket: "", afterParty: "" };

describe("parita klient (Zod) × skript (Code.gs)", () => {
  it.each(PHONES)("normalizePhone(%j) dává stejný výsledek", (p) => {
    expect(normalizeClient(p)).toBe(gs.normalizePhone(p));
  });

  it.each(PHONES)("validace telefonu %j se shoduje", (p) => {
    const input = { ...base, phone: p };
    expect(registrationSchema.safeParse(input).success).toBe(gs.validateRegistration(input).ok);
  });

  it.each(NAMES)("validace jména %j se shoduje", (n) => {
    const input = { ...base, name: n };
    expect(registrationSchema.safeParse(input).success).toBe(gs.validateRegistration(input).ok);
  });

  it.each([
    { category: "tryhard" }, { category: "x" }, { category: undefined },
    { racket: "own" }, { racket: "borrow" }, { racket: "x" },
    { afterParty: "yes" }, { afterParty: "no" }, { afterParty: "maybe" }, { afterParty: "x" },
  ])("validace enumů %j se shoduje", (patch) => {
    const input = { ...base, ...patch };
    expect(registrationSchema.safeParse(input).success).toBe(gs.validateRegistration(input).ok);
  });

  it("chybové hlášky jsou shodné", () => {
    for (const [key, text] of Object.entries(MESSAGES)) {
      expect(gs.MESSAGES[key]).toBe(text);
    }
  });
});
