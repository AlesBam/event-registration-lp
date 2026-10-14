/**
 * Konfigurace turnaje a texty.
 *
 * REGISTRATION_DEADLINE MUSÍ odpovídat DEFAULT_DEADLINE_ISO v apps-script/Code.gs.
 * Autoritativní je skript: frontend uzávěrku používá jen k tomu, aby rovnou
 * ukázal „Registrace uzavřena“. Kdyby se hodnoty rozešly, rozhodne skript
 * (vrátí CLOSED a formulář se přepne do uzavřeného stavu).
 * Pozor: Script Property REGISTRATION_DEADLINE (testovací přepis) frontend nevidí.
 *
 * V listopadu platí v Praze zimní čas (CET = UTC+1), proto offset +01:00.
 */
export const REGISTRATION_DEADLINE_ISO = "2026-11-20T20:00:00+01:00";

/**
 *   = nezlomitelná mezera. Česká typografie nedovoluje rozdělit datum
 * („5. 12. 2026“), číslo a jednotku („200 Kč“) ani dvojici slov místa
 * na konec a začátek řádku. Na širokém displeji se jinak hero text zalomil
 * jako „… 5.“ / „12. 2026“.
 */
export const EVENT = {
  name: "Vánoční Fongerton 2026",
  tagline: "Badmintonový turnaj",
  dateLabel: "5. 12. 2026",
  dateLong: "sobota 5. prosince 2026",
  place: "Hamr Braník",
  placeMapUrl: "https://www.google.com/maps/search/?api=1&query=Hamr+Bran%C3%ADk",
  timeLabel: "od 16:00, cca 3–4 hodiny",
  meetingTime: "15:50",
  fee: "200 Kč, platba hotově na místě",
  deadlineLabel: "20. 11. 2026 ve 20:00",
} as const;

export const CONTACT = {
  name: "Adam Vávra",
  // Skloňované tvary pro české věty.
  nameWith: "Adamem Vávrou",
  nameTo: "Adamovi Vávrovi",
  phoneDisplay: "734 368 844",
  phoneHref: "tel:+420734368844",
} as const;

export const PRIVACY_NOTE =
  "Telefonní číslo potřebujeme jen kvůli přidání do WhatsApp skupiny turnaje, kde budou případné změny a info. Po turnaji osobní údaje smažeme.";

/** Timeout pro odeslání registrace z prohlížeče. Apps Script má občas studený start i několik sekund. */
export const SUBMIT_TIMEOUT_MS = 15_000;

/** Timeout pro načtení počtu na serveru. Počet je jen doplněk, nesmí dlouho blokovat stream. */
export const COUNT_TIMEOUT_MS = 5_000;

export function getAppsScriptUrl(): string | undefined {
  const url = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL;
  return url && url.trim() !== "" ? url.trim() : undefined;
}

/** Stejná sémantika jako isRegistrationOpen v Code.gs: otevřeno striktně před uzávěrkou. */
export function isRegistrationOpen(now: Date, deadlineIso: string = REGISTRATION_DEADLINE_ISO): boolean {
  const deadline = new Date(deadlineIso).getTime();
  const n = now.getTime();
  if (Number.isNaN(deadline) || Number.isNaN(n)) return false;
  return n < deadline;
}
