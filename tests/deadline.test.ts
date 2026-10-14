import { describe, expect, it } from "vitest";
import { isRegistrationOpen as isOpenClient, REGISTRATION_DEADLINE_ISO } from "../lib/config";
import { loadAppsScript } from "./loadAppsScript";

const gs = loadAppsScript();
const deadline = gs.parseDeadline(gs.DEFAULT_DEADLINE_ISO)!;

describe("isRegistrationOpen (Code.gs)", () => {
  it("výchozí uzávěrka je 20. 11. 2026 20:00 pražského času = 19:00 UTC", () => {
    expect(deadline.toISOString()).toBe("2026-11-20T19:00:00.000Z");
  });

  it("těsně před uzávěrkou (−1 ms) je otevřeno", () => {
    expect(gs.isRegistrationOpen(new Date(deadline.getTime() - 1), deadline)).toBe(true);
  });

  it("přesně v uzávěrce je zavřeno", () => {
    expect(gs.isRegistrationOpen(new Date(deadline.getTime()), deadline)).toBe(false);
  });

  it("těsně po uzávěrce (+1 ms) je zavřeno", () => {
    expect(gs.isRegistrationOpen(new Date(deadline.getTime() + 1), deadline)).toBe(false);
  });

  it("hluboko před uzávěrkou je otevřeno", () => {
    expect(gs.isRegistrationOpen(new Date("2026-10-14T12:00:00+02:00"), deadline)).toBe(true);
  });

  it("nevalidní vstupy → zavřeno (fail closed)", () => {
    expect(gs.isRegistrationOpen(null, deadline)).toBe(false);
    expect(gs.isRegistrationOpen(new Date(), null)).toBe(false);
    expect(gs.isRegistrationOpen(new Date("nesmysl"), deadline)).toBe(false);
  });
});

describe("parseDeadline (Code.gs)", () => {
  it("parsuje ISO s offsetem (formát pro Script Property)", () => {
    expect(gs.parseDeadline("2026-10-14T12:00:00+02:00")!.toISOString()).toBe("2026-10-14T10:00:00.000Z");
  });
  it("nevalidní nebo prázdná hodnota → null", () => {
    expect(gs.parseDeadline("zítra")).toBeNull();
    expect(gs.parseDeadline("")).toBeNull();
    expect(gs.parseDeadline(null)).toBeNull();
  });
});

describe("uzávěrka frontend vs. skript", () => {
  it("lib/config.ts má stejnou uzávěrku jako Code.gs", () => {
    expect(REGISTRATION_DEADLINE_ISO).toBe(gs.DEFAULT_DEADLINE_ISO);
  });

  it("frontend má stejnou sémantiku hranice", () => {
    const t = deadline.getTime();
    expect(isOpenClient(new Date(t - 1))).toBe(true);
    expect(isOpenClient(new Date(t))).toBe(false);
    expect(isOpenClient(new Date(t + 1))).toBe(false);
  });
});
