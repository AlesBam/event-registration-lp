import { describe, expect, it } from "vitest";
import { loadAppsScript } from "./loadAppsScript";

const gs = loadAppsScript();

const valid = {
  name: "Jan Novák",
  phone: "777 123 456",
  category: "casual",
  racket: "own",
  afterParty: "maybe",
};

function expectError(input: unknown, field: string | null) {
  const r = gs.validateRegistration(input);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.field).toBe(field);
    expect(typeof r.message).toBe("string");
    expect(r.message.length).toBeGreaterThan(0);
  }
}

describe("validateRegistration (Code.gs)", () => {
  it("validní vstup normalizuje a převede enumy na labely do Sheetu", () => {
    expect(gs.validateRegistration(valid)).toEqual({
      ok: true,
      value: {
        name: "Jan Novák",
        phone: "+420777123456",
        category: "Casual",
        racket: "Mám vlastní",
        afterParty: "Ještě nevím",
      },
    });
  });

  it("volitelná pole: chybí / null / '' → prázdný string", () => {
    for (const empty of [undefined, null, ""]) {
      const r = gs.validateRegistration({ ...valid, racket: empty, afterParty: empty });
      expect(r).toMatchObject({ ok: true, value: { racket: "", afterParty: "" } });
    }
  });

  it("všechny povolené hodnoty enumů", () => {
    expect(gs.validateRegistration({ ...valid, category: "tryhard" })).toMatchObject({ value: { category: "Tryhard" } });
    expect(gs.validateRegistration({ ...valid, racket: "borrow" })).toMatchObject({ value: { racket: "Potřebuji půjčit" } });
    expect(gs.validateRegistration({ ...valid, afterParty: "yes" })).toMatchObject({ value: { afterParty: "Ano" } });
    expect(gs.validateRegistration({ ...valid, afterParty: "no" })).toMatchObject({ value: { afterParty: "Ne" } });
  });

  it("jméno: trim a sloučení mezer", () => {
    expect(gs.validateRegistration({ ...valid, name: "  Jan   Novák \n" })).toMatchObject({ value: { name: "Jan Novák" } });
  });

  it("jméno: délka 2–100 znaků (po trimu)", () => {
    expectError({ ...valid, name: "J" }, "name");
    expectError({ ...valid, name: "  J  " }, "name");
    expect(gs.validateRegistration({ ...valid, name: "Jo" }).ok).toBe(true);
    expect(gs.validateRegistration({ ...valid, name: "a".repeat(100) }).ok).toBe(true);
    expectError({ ...valid, name: "a".repeat(101) }, "name");
  });

  it("jméno: chybí, prázdné, ne-string, řídicí znaky", () => {
    expectError({ ...valid, name: undefined }, "name");
    expectError({ ...valid, name: "   " }, "name");
    expectError({ ...valid, name: 42 }, "name");
    expectError({ ...valid, name: "Jan\u0000Novák" }, "name");
  });

  it("jméno se vzorcem je validní (bezpečnost řeší zápis do Sheetu, ne validace)", () => {
    expect(gs.validateRegistration({ ...valid, name: "=1+1" })).toMatchObject({ ok: true, value: { name: "=1+1" } });
  });

  it("telefon: chybí / nevalidní", () => {
    expectError({ ...valid, phone: undefined }, "phone");
    expectError({ ...valid, phone: "" }, "phone");
    expectError({ ...valid, phone: "123" }, "phone");
    expectError({ ...valid, phone: "222123456" }, "phone");
    expectError({ ...valid, phone: 777123456 }, "phone");
  });

  it("kategorie: povinná a jen z enumu", () => {
    expectError({ ...valid, category: undefined }, "category");
    expectError({ ...valid, category: "" }, "category");
    expectError({ ...valid, category: "Casual" }, "category"); // label, ne hodnota
    expectError({ ...valid, category: "pro" }, "category");
    expectError({ ...valid, category: "toString" }, "category"); // klíč z prototypu
  });

  it("volitelná pole: jen z enumu", () => {
    expectError({ ...valid, racket: "maybe" }, "racket");
    expectError({ ...valid, racket: 1 }, "racket");
    expectError({ ...valid, afterParty: "Ano" }, "afterParty");
    expectError({ ...valid, afterParty: "__proto__" }, "afterParty");
  });

  it("nevalidní tvar vstupu", () => {
    expectError(null, null);
    expectError("text", null);
    expectError([valid], null);
  });

  it("neznámá pole navíc ignoruje (do Sheetu jdou jen známá)", () => {
    const r = gs.validateRegistration({ ...valid, admin: true, extra: "=HYPERLINK()" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value).sort()).toEqual(["afterParty", "category", "name", "phone", "racket"]);
  });
});

describe("isHoneypotFilled (Code.gs)", () => {
  it("prázdný / chybějící honeypot → false", () => {
    expect(gs.isHoneypotFilled({ ...valid })).toBe(false);
    expect(gs.isHoneypotFilled({ ...valid, website: "" })).toBe(false);
    expect(gs.isHoneypotFilled({ ...valid, website: "   " })).toBe(false);
    expect(gs.isHoneypotFilled({ ...valid, website: null })).toBe(false);
  });
  it("vyplněný honeypot → true", () => {
    expect(gs.isHoneypotFilled({ ...valid, website: "https://spam.example" })).toBe(true);
    expect(gs.isHoneypotFilled({ ...valid, website: 1 })).toBe(true);
  });
});

describe("escapeForSheet (Code.gs)", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+420777123456", "'+420777123456"],
    ["-5", "'-5"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\t=1", "'\t=1"],
  ])("escapuje %j", (input, expected) => {
    expect(gs.escapeForSheet(input)).toBe(expected);
  });

  it.each(["Jan Novák", "Casual", "", "2026-11-01 12:00:00", "Ano"])("nechá beze změny %j", (input) => {
    expect(gs.escapeForSheet(input)).toBe(input);
  });

  it("null/undefined → prázdný string", () => {
    expect(gs.escapeForSheet(null)).toBe("");
    expect(gs.escapeForSheet(undefined)).toBe("");
  });
});

describe("buildRow (Code.gs)", () => {
  it("pořadí sloupců odpovídá hlavičce", () => {
    const r = gs.validateRegistration(valid);
    if (!r.ok) throw new Error("expected ok");
    expect(gs.buildRow(r.value, "2026-11-01 12:00:00")).toEqual([
      "2026-11-01 12:00:00",
      "Jan Novák",
      "+420777123456",
      "Casual",
      "Mám vlastní",
      "Ještě nevím",
    ]);
  });
});

describe("parseBody (Code.gs)", () => {
  const e = (contents: unknown) => ({ postData: { contents } });

  it("validní JSON objekt", () => {
    expect(gs.parseBody(e(JSON.stringify(valid)))).toEqual(valid);
  });
  it.each([
    ["chybí e", undefined],
    ["chybí postData", {}],
    ["prázdné tělo", e("")],
    ["nevalidní JSON", e("{name:")],
    ["JSON pole", e("[1,2]")],
    ["JSON null", e("null")],
    ["JSON string", e('"ahoj"')],
    ["moc velké tělo", e(JSON.stringify({ name: "a".repeat(20000) }))],
  ])("%s → null", (_label, input) => {
    expect(gs.parseBody(input)).toBeNull();
  });
});

describe("isDuplicatePhone + countFilled (Code.gs)", () => {
  const cells = [["+420777123456"], ["'+420603000111"], ["777 999 888"], [""], ["  "]];

  it("pozná duplicitu i u ručně zapsaného čísla nebo doslovného apostrofu", () => {
    expect(gs.isDuplicatePhone(cells, "+420777123456")).toBe(true);
    expect(gs.isDuplicatePhone(cells, "+420603000111")).toBe(true);
    expect(gs.isDuplicatePhone(cells, "+420777999888")).toBe(true);
    expect(gs.isDuplicatePhone(cells, "+420777000000")).toBe(false);
    expect(gs.isDuplicatePhone([], "+420777123456")).toBe(false);
  });

  it("počítá jen neprázdné řádky", () => {
    expect(gs.countFilled(cells)).toBe(3);
    expect(gs.countFilled([])).toBe(0);
  });
});
