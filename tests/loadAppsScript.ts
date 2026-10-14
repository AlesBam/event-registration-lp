import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

/**
 * Načte apps-script/Code.gs PŘESNĚ v té podobě, v jaké se vkládá do editoru.
 *
 * PROČ node:vm a ne import: Vitest/Node neumí importovat příponu .gs.
 * Soubor spustíme ve vm kontextu, kde existuje jen `module` a `console`.
 * Google služby (SpreadsheetApp, CacheService…) tu záměrně NEJSOU: když by
 * je někdo zavolal na nejvyšší úrovni souboru, načtení spadne a test to odhalí.
 * Guard `typeof module !== "undefined"` na konci Code.gs pak vyexportuje
 * čisté funkce.
 *
 * Pozor: Date/objekty z vm kontextu jsou z jiné „realmy“, proto funkce
 * v Code.gs nepoužívají instanceof Date a testy používají toEqual (ne toStrictEqual).
 */
export type AppsScript = {
  normalizePhone(input: unknown): string | null;
  parseDeadline(iso: unknown): Date | null;
  isRegistrationOpen(now: Date | null, deadline: Date | null): boolean;
  isHoneypotFilled(body: unknown): boolean;
  validateRegistration(input: unknown):
    | { ok: true; value: { name: string; phone: string; category: string; racket: string; afterParty: string } }
    | { ok: false; field: string | null; message: string };
  escapeForSheet(value: unknown): string;
  buildRow(value: Record<string, string>, timestamp: string): string[];
  parseBody(e: unknown): Record<string, unknown> | null;
  isDuplicatePhone(cells: string[][], phone: string): boolean;
  countFilled(cells: string[][]): number;
  DEFAULT_DEADLINE_ISO: string;
  MESSAGES: Record<string, string>;
};

export const codeGsPath = fileURLToPath(new URL("../apps-script/Code.gs", import.meta.url));

export function loadAppsScript(): AppsScript {
  const source = readFileSync(codeGsPath, "utf8");
  const sandbox = { module: { exports: {} as unknown }, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "Code.gs" });
  return sandbox.module.exports as AppsScript;
}
