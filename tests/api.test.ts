import { describe, expect, it } from "vitest";
import { parseCountResponse, parseSubmitResponse } from "../lib/api";

describe("parseSubmitResponse", () => {
  it("úspěch s počtem", () => {
    expect(parseSubmitResponse({ ok: true, count: 15 })).toEqual({ ok: true, count: 15 });
  });
  it("úspěch bez počtu (honeypot)", () => {
    expect(parseSubmitResponse({ ok: true })).toEqual({ ok: true, count: null });
  });
  it("VALIDATION s polem", () => {
    expect(parseSubmitResponse({ ok: false, code: "VALIDATION", field: "phone", message: "x" })).toEqual({
      ok: false,
      code: "VALIDATION",
      field: "phone",
      message: "x",
    });
  });
  it("neznámé pole a kód → bezpečné výchozí hodnoty", () => {
    expect(parseSubmitResponse({ ok: false, code: "HACK", field: "__proto__" })).toEqual({
      ok: false,
      code: "SERVER_ERROR",
      field: null,
      message: null,
    });
  });
  it.each([null, "html", [], 42])("nevalidní tělo %j → SERVER_ERROR", (d) => {
    expect(parseSubmitResponse(d)).toMatchObject({ ok: false, code: "SERVER_ERROR" });
  });
  it.each(["DUPLICATE", "CLOSED", "SERVER_ERROR"])("kód %s projde", (code) => {
    expect(parseSubmitResponse({ ok: false, code })).toMatchObject({ ok: false, code });
  });
});

describe("parseCountResponse", () => {
  it("validní", () => {
    expect(parseCountResponse({ ok: true, count: 3, open: true })).toEqual({ ok: true, count: 3, open: true });
  });
  it.each([{ ok: false }, { ok: true, count: -1 }, { ok: true, count: 1.5 }, { ok: true, count: "3" }, null])(
    "nevalidní %j → null",
    (d) => {
      expect(parseCountResponse(d)).toBeNull();
    },
  );
});
