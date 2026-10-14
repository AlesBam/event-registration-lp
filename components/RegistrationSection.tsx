import { connection } from "next/server";
import { isRegistrationOpen } from "@/lib/config";
import { ClosedNotice } from "./ClosedNotice";
import { RegistrationForm } from "./RegistrationForm";

/**
 * Rozhodne „formulář, nebo uzavřeno“ při KAŽDÉM requestu.
 *
 * PROČ: v Next.js 16 s Cache Components se komponenty bez request-time dat
 * předrenderují při buildu. Kdybychom `new Date()` četli bez connection(),
 * Next by build zastavil s hláškou „blocking-prerender-current-time“, nebo
 * (v "use cache") by čas zamrzl na okamžiku buildu a stránka by se po
 * uzávěrce sama nezavřela.
 * `await connection()` + <Suspense> v page.tsx: předrenderuje se jen
 * fallback, rozhodnutí proběhne až při requestu. Po uzávěrce se stav
 * přepne sám, bez nového deploye.
 */
export async function RegistrationSection() {
  await connection();
  return isRegistrationOpen(new Date()) ? <RegistrationForm /> : <ClosedNotice />;
}
