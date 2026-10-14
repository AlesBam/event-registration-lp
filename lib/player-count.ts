import { cacheLife } from "next/cache";
import { parseCountResponse } from "./api";
import { COUNT_TIMEOUT_MS, getAppsScriptUrl } from "./config";

/**
 * Načtení počtu přihlášených na serveru (Next.js), cache 60 s.
 *
 * PROČ "use cache: remote" a ne obyčejné "use cache":
 * Dokumentace Next.js 16 („Runtime caching considerations“): výchozí
 * in-memory cache na serverless (Vercel) mezi requesty nepřetrvává, každý
 * request může běžet na jiné instanci. "use cache: remote" ukládá výsledek
 * do sdílené cache platformy (na Vercelu je handler k dispozici automaticky),
 * takže Apps Script se zavolá zhruba jednou za 60 s, ne při každém zobrazení.
 *
 * PROČ ne fetch(url, { next: { revalidate: 60 } }):
 * S Cache Components to sice dál funguje, ale migrační průvodce doporučuje
 * přesunout cachování do "use cache" + cacheLife. Hlavně tady můžeme při
 * chybě vyhodit výjimku a ta se NEuloží. fetch cache by uložila i odpověď
 * { ok: false } nebo HTML chybovou stránku, protože Apps Script vrací vždy 200.
 *
 * cacheLife:
 *   revalidate 60 → po 60 s se při dalším requestu vrátí stará hodnota a na
 *                   pozadí se načte nová (stale-while-revalidate),
 *   expire 300    → po 5 min bez návštěv se čeká na čerstvou hodnotu,
 *   stale 60      → jak dlouho může hodnotu držet klientský router.
 * Funkce se volá jen za `await connection()` (viz PlayerCount), takže při
 * buildu se nevolá a build na dostupnosti Apps Scriptu nezávisí.
 */
async function fetchCountCached(url: string): Promise<number> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });

  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(COUNT_TIMEOUT_MS),
  });
  const parsed = parseCountResponse(await res.json());
  if (!parsed) throw new Error("Invalid count response");
  return parsed.count;
}

/** Vrací počet, nebo null při jakékoli chybě (počítadlo se pak skryje). */
export async function getPlayerCount(): Promise<number | null> {
  const url = getAppsScriptUrl();
  if (!url) return null;
  try {
    return await fetchCountCached(url);
  } catch {
    return null;
  }
}
