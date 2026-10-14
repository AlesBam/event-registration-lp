/**
 * Lokální mock Google Apps Script Web App pro vývoj a ruční testy.
 *
 * Spouští SKUTEČNÝ apps-script/Code.gs (doPost/doGet) ve vm kontextu
 * s jednoduchými náhradami Google služeb (Sheet v paměti, cache, zámek…).
 * Napodobuje i chování Googlu, na kterém frontend závisí:
 *   - POST/GET /exec odpoví 302 na jednorázovou „echo“ URL,
 *   - teprve echo URL vrací JSON; Access-Control-Allow-Origin: * je na 302
 *     i na echo odpovědi (prohlížeč CORS kontroluje u každého kroku redirectu),
 *   - OPTIONS (CORS preflight) NEpodporuje → kdyby frontend omylem poslal
 *     application/json, selže lokálně stejně jako proti Googlu.
 *
 * Nenahrazuje test proti skutečnému Apps Scriptu (formát buněk, apostrofy,
 * kvóty), na to je selfTest() a checklist v README.
 *
 * Použití:
 *   node scripts/mock-apps-script.mjs
 *   NEXT_PUBLIC_APPS_SCRIPT_URL=http://localhost:4000/exec npm run dev
 *
 * Proměnné:
 *   PORT=4000                 port mocku
 *   MOCK_DEADLINE=<ISO>       simuluje Script Property REGISTRATION_DEADLINE
 *   MOCK_DELAY_MS=0           umělé zpoždění odpovědi (test loading stavu / timeoutu)
 *   MOCK_FAIL=1               doGet/doPost vrací HTML chybovou stránku (jako pád skriptu)
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import vm from "node:vm";

const PORT = Number(process.env.PORT ?? 4000);
const DELAY = Number(process.env.MOCK_DELAY_MS ?? 0);

// --- Sheet v paměti ---------------------------------------------------------
const rows = [["Čas registrace", "Jméno a příjmení", "Telefon", "Kategorie", "Raketa", "Pivo/jídlo"]];
// Jako Sheets: apostrof na začátku = „ber jako text“, v zobrazení není vidět.
const display = (v) => (typeof v === "string" && v.startsWith("'") ? v.slice(1) : String(v ?? ""));

const sheet = {
  getLastRow: () => rows.length,
  getMaxRows: () => 1000,
  setFrozenRows() {},
  getRange(row, col, numRows = 1, numCols = 1) {
    return {
      setNumberFormat() {
        return this;
      },
      getDisplayValues() {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const src = rows[row - 1 + r] ?? [];
          out.push(Array.from({ length: numCols }, (_, c) => display(src[col - 1 + c])));
        }
        return out;
      },
      setValues(values) {
        values.forEach((v, r) => {
          rows[row - 1 + r] = [...v];
        });
        return this;
      },
    };
  },
};

const cacheStore = new Map();

const services = {
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({ getSheetByName: (n) => (n === "Registrace" ? sheet : null) }),
    flush() {},
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: {
    getScriptCache: () => ({
      get(k) {
        const e = cacheStore.get(k);
        return e && e.exp > Date.now() ? e.v : null;
      },
      put(k, v, s) {
        cacheStore.set(k, { v, exp: Date.now() + s * 1000 });
      },
      remove(k) {
        cacheStore.delete(k);
      },
    }),
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k === "REGISTRATION_DEADLINE" ? (process.env.MOCK_DEADLINE ?? null) : null),
    }),
  },
  Utilities: {
    formatDate: (d, tz) =>
      new Intl.DateTimeFormat("sv-SE", { timeZone: tz, dateStyle: "short", timeStyle: "medium" }).format(d),
  },
  ContentService: {
    MimeType: { JSON: "application/json" },
    createTextOutput: (content) => ({ content, setMimeType() { return this; } }),
  },
  console,
};

const ctx = vm.createContext({ ...services });
vm.runInContext(readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8"), ctx, {
  filename: "Code.gs",
});

// --- HTTP server --------------------------------------------------------------
const echoes = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    // Google na preflight neodpovídá CORS hlavičkami → prohlížeč request zablokuje.
    res.writeHead(405).end();
    return;
  }

  if (url.pathname === "/exec" && (req.method === "POST" || req.method === "GET")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (DELAY) await sleep(DELAY);

    let content;
    if (process.env.MOCK_FAIL) {
      content = null;
    } else if (req.method === "POST") {
      content = ctx.doPost({ postData: { contents: body, type: req.headers["content-type"] } }).content;
    } else {
      content = ctx.doGet({ parameter: Object.fromEntries(url.searchParams) }).content;
    }

    const id = randomUUID();
    echoes.set(id, content);
    // Jako Google: 302 na jednorázovou URL. fetch po 302 udělá GET.
    // Prohlížeč dělá CORS kontrolu u KAŽDÉ odpovědi v řetězci přesměrování,
    // takže i samotná 302 musí mít Access-Control-Allow-Origin.
    res.writeHead(302, { Location: `/echo?id=${id}`, "Access-Control-Allow-Origin": "*" }).end();
    return;
  }

  if (url.pathname === "/echo") {
    const id = url.searchParams.get("id");
    const content = echoes.get(id);
    echoes.delete(id);
    if (content == null) {
      // Pád skriptu: Google vrací HTML bez CORS hlaviček.
      res.writeHead(200, { "Content-Type": "text/html" }).end("<html><body>Error</body></html>");
      return;
    }
    res
      .writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" })
      .end(content);
    return;
  }

  if (url.pathname === "/rows") {
    // Jen pro ladění: aktuální obsah „Sheetu“ (s apostrofy, jak by byly uložené).
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(rows, null, 2));
    return;
  }

  res.writeHead(404).end();
}).listen(PORT, () => {
  console.log(`Mock Apps Script běží na http://localhost:${PORT}/exec (řádky: /rows)`);
});
