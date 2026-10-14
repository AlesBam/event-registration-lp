import type { RegistrationField, RegistrationInput } from "./schema";
import { REGISTRATION_FIELDS } from "./schema";
import { SUBMIT_TIMEOUT_MS, getAppsScriptUrl } from "./config";

/**
 * Klient pro Google Apps Script Web App.
 *
 * Apps Script neumí nastavit HTTP status, vždy vrací 200. O výsledku
 * rozhoduje tělo: { ok, code }. Odpověď je z cizího systému, proto ji
 * před použitím ověříme (isRecord / parse…), ne jen přetypujeme.
 */

export type ServerErrorCode = "VALIDATION" | "DUPLICATE" | "CLOSED" | "SERVER_ERROR";

export type SubmitResult =
  /** count chybí u honeypotu (falešný úspěch) nebo když ho skript nevrátí. */
  | { ok: true; count: number | null }
  | { ok: false; code: ServerErrorCode; field: RegistrationField | null; message: string | null }
  /** Chyby na straně klienta: síť, CORS, HTML místo JSON, timeout. */
  | { ok: false; code: "NETWORK" | "TIMEOUT"; field: null; message: null };

export type CountResponse = { ok: true; count: number; open: boolean };

/** Payload, který posíláme. Honeypot `website` posíláme vždy, ať ho skript vyhodnotí. */
export type RegistrationPayload = {
  name: string;
  phone: string;
  category: string;
  racket: string;
  afterParty: string;
  website: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const SERVER_CODES: readonly string[] = ["VALIDATION", "DUPLICATE", "CLOSED", "SERVER_ERROR"];

export function parseSubmitResponse(data: unknown): SubmitResult {
  if (!isRecord(data)) return { ok: false, code: "SERVER_ERROR", field: null, message: null };

  if (data.ok === true) {
    const count = typeof data.count === "number" && Number.isFinite(data.count) ? data.count : null;
    return { ok: true, count };
  }

  const code = typeof data.code === "string" && SERVER_CODES.includes(data.code) ? (data.code as ServerErrorCode) : "SERVER_ERROR";
  const field =
    typeof data.field === "string" && (REGISTRATION_FIELDS as readonly string[]).includes(data.field)
      ? (data.field as RegistrationField)
      : null;
  const message = typeof data.message === "string" ? data.message : null;
  return { ok: false, code, field, message };
}

export function parseCountResponse(data: unknown): CountResponse | null {
  if (!isRecord(data) || data.ok !== true) return null;
  if (typeof data.count !== "number" || !Number.isInteger(data.count) || data.count < 0) return null;
  return { ok: true, count: data.count, open: data.open === true };
}

export function toPayload(input: RegistrationInput, website: string): RegistrationPayload {
  return {
    name: input.name,
    phone: input.phone,
    category: input.category,
    racket: input.racket ?? "",
    afterParty: input.afterParty ?? "",
    website,
  };
}

/**
 * Odešle registraci přímo z prohlížeče na Apps Script.
 *
 * PROČ Content-Type: text/plain a ne application/json:
 * Apps Script neodpovídá na CORS preflight (OPTIONS). application/json
 * je „nejednoduchý“ content type, takže by prohlížeč nejdřív poslal
 * preflight, ten by selhal a POST by se vůbec neodeslal. text/plain je
 * „simple request“ bez preflightu. JSON posíláme jako string v těle
 * a skript ho parsuje z e.postData.contents.
 *
 * PROČ ne mode: "no-cors": požadavek by sice prošel, ale odpověď by byla
 * „opaque“ a nešlo by z ní přečíst ok/code (duplicita, uzávěrka…).
 *
 * Apps Script odpoví 302 na jednorázovou URL na script.googleusercontent.com,
 * kde je JSON. fetch redirect sleduje sám (redirect: "follow" je výchozí,
 * uvádíme ho explicitně kvůli čitelnosti). Prohlížeč dělá CORS kontrolu
 * u KAŽDÉ odpovědi v řetězci, takže Access-Control-Allow-Origin musí mít
 * 302 i cílová odpověď. Na tom stojí široce používaný vzor „Apps Script +
 * fetch z prohlížeče“, Google to ale oficiálně NEdokumentuje. Ověř si to
 * přes `curl -i` a test v prohlížeči podle checklistu v README.
 */
export async function submitRegistration(payload: RegistrationPayload): Promise<SubmitResult> {
  const url = getAppsScriptUrl();
  if (!url) return { ok: false, code: "NETWORK", field: null, message: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      // HTML chybová stránka Googlu apod.
      return { ok: false, code: "NETWORK", field: null, message: null };
    }
    return parseSubmitResponse(data);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, code: "TIMEOUT", field: null, message: null };
    }
    return { ok: false, code: "NETWORK", field: null, message: null };
  } finally {
    clearTimeout(timer);
  }
}
