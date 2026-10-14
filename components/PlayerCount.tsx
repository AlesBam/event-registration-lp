import { connection } from "next/server";
import { getPlayerCount } from "@/lib/player-count";
import { LiveCount } from "./LiveCount";

/**
 * Serverová komponenta s počtem přihlášených. Na stránce je v <Suspense>,
 * takže pomalý Apps Script neblokuje zbytek stránky. Statický shell se pošle
 * hned a počet se dostreamuje.
 *
 * PROČ `await connection()`: v Next.js 16 s Cache Components se všechno, co
 * nečte data z requestu, předrenderuje při buildu. connection() říká
 * „počkej na skutečný request“, takže se při buildu Apps Script vůbec nevolá.
 * Build tak na skriptu nezávisí a do statického HTML se nezapíše zastaralý počet.
 */
export async function PlayerCount() {
  await connection();
  const count = await getPlayerCount();
  return <LiveCount initialCount={count} />;
}
