"use client";

import { useLiveCountOverride } from "@/lib/count-store";
import { formatPlayers } from "@/lib/plural";

/**
 * Zobrazení počtu přihlášených. Počáteční hodnotu dodá server (PlayerCount),
 * po úspěšné registraci ji přepíše `count` z odpovědi doPost.
 * Když počet není k dispozici (chyba načtení), nevykreslí nic.
 */
export function LiveCount({ initialCount }: { initialCount: number | null }) {
  const override = useLiveCountOverride();
  const count = override ?? initialCount;
  if (count === null) return null;

  return (
    <p
      className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur"
      aria-live="polite"
    >
      <span className="size-2 rounded-full bg-gold" aria-hidden="true" />
      Přihlášeno: {formatPlayers(count)}
    </p>
  );
}
