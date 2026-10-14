import { useSyncExternalStore } from "react";

/**
 * Sdílený stav počtu přihlášených mezi hero (LiveCount) a formulářem.
 *
 * PROČ: počet je v hero, formulář níž na stránce a jsou to oddělené
 * komponenty. Po úspěšné registraci má hero ukázat přesný `count`
 * z odpovědi doPost. Malý store s useSyncExternalStore je jednodušší
 * než Context, protože nemusíme obalovat celou stránku providerem.
 *
 * Drží jen „přepis“ ze serverové hodnoty: null = použij hodnotu ze serveru.
 */
let override: number | null = null;
const listeners = new Set<() => void>();

export function setLiveCount(count: number): void {
  override = count;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLiveCountOverride(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => override,
    () => null,
  );
}
