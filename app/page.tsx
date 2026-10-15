import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { PlayerCount } from "@/components/PlayerCount";
import { RegistrationSection } from "@/components/RegistrationSection";
import { EVENT } from "@/lib/config";

/**
 * Landing page.
 *
 * Rendering (Next.js 16, Cache Components):
 * - Hero, info a kategorie nečtou request-time data, takže jsou součástí
 *   statického shellu (předrenderovaného při buildu) a načtou se okamžitě.
 * - <PlayerCount> a <RegistrationSection> volají `await connection()`, takže
 *   se vyhodnotí až při requestu. Při buildu se předrenderuje jen jejich
 *   <Suspense> fallback a obsah se dostreamuje ve stejné HTTP odpovědi.
 *   Pomalý Apps Script tak neblokuje zbytek stránky.
 */
export default function Page() {
  return (
    <main className="flex-1">
      <Hero />
      <InfoSection />
      <CategoriesSection />
      <section id="registrace" aria-labelledby="registrace-title" className="scroll-mt-4 px-4 pb-16 pt-4 sm:pb-24">
        <div className="mx-auto max-w-2xl">
          <h2 id="registrace-title" className="text-3xl font-extrabold tracking-tight text-ink">
            Registrace
          </h2>
          <p className="mt-2 mb-6 text-muted">Vyplnění zabere asi minutu.</p>
          <Suspense fallback={<FormSkeleton />}>
            <RegistrationSection />
          </Suspense>
        </div>
      </section>
      <footer className="border-t border-ice px-4 py-8 text-center text-sm text-muted">
        {EVENT.name} · {EVENT.dateLabel} · {EVENT.place}
      </footer>
    </main>
  );
}

function Hero() {
  return (
    <header className="relative overflow-hidden bg-night text-white">
      <Snowfield />
      <div className="relative mx-auto max-w-5xl px-4 pt-10 pb-14 sm:pt-16 sm:pb-20">
        <div className="flex items-center gap-3">
          <Logo className="size-11" />
          <span className="text-sm font-bold tracking-[0.2em] text-ice uppercase">{EVENT.tagline}</span>
        </div>

        <h1 className="mt-8 text-[2.6rem] leading-[1.02] font-extrabold tracking-tight uppercase sm:text-7xl">
          Vánoční
          <br />
          <span className="text-gold">Fonger</span>
          <span className="text-outline-gold">ton</span> 2026
        </h1>

        {/* Seznam (ne jeden řetězec s tečkami): na mobilu se zalamuje
            přednostně mezi položkami a čtečky ho přečtou jako výčet. */}
        <ul className="mt-6 flex max-w-3xl flex-wrap gap-x-3 gap-y-1.5 text-base font-semibold text-white sm:text-lg">
          {HIGHLIGHTS.map((item, i) => (
            <li key={item} className="flex items-baseline gap-3">
              {i > 0 && (
                <span className="text-gold" aria-hidden="true">
                  •
                </span>
              )}
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-xl text-lg text-ice sm:text-xl">
          Přijď si zahrát beďas a zapotit se, než se začneš ládovat cukrovím.
        </p>

        <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <a
            href="#registrace"
            className="inline-flex items-center justify-center rounded-xl bg-berry px-7 py-4 text-lg font-bold text-white shadow-lg shadow-black/20 transition hover:bg-berry-dark focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-gold"
          >
            Přihlásit se
          </a>
          {/* min-h drží místo, aby stránka neposkočila, až počet dorazí. */}
          <div className="min-h-10">
            <Suspense fallback={null}>
              <PlayerCount />
            </Suspense>
          </div>
        </div>
      </div>
    </header>
  );
}

const HIGHLIGHTS = [
  "Čtyřhry",
  "Náhodný los parťáka",
  "2 skill kategorie",
  "Medaile pro bednu & Cash prize pro vítěze",
];

/** Jemné vločky v pozadí hero. Statické SVG, žádná animace. */
function Snowfield() {
  const flakes = [
    [8, 18, 1], [22, 70, 0.7], [35, 30, 0.5], [48, 82, 0.9], [62, 12, 0.6],
    [74, 55, 1.2], [88, 25, 0.8], [93, 78, 0.6], [15, 45, 0.6], [55, 48, 0.5],
  ] as const;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <radialGradient id="glow" cx="85%" cy="0%" r="70%">
          <stop offset="0%" stopColor="#17305c" />
          <stop offset="100%" stopColor="#0f1e3a" stopOpacity="0" />
        </radialGradient>
        <symbol id="flake" viewBox="-10 -10 20 20">
          <g stroke="white" strokeWidth="1.2" strokeLinecap="round">
            <path d="M0 -9V9M-7.8 -4.5L7.8 4.5M-7.8 4.5L7.8 -4.5" />
          </g>
        </symbol>
      </defs>
      <rect width="100%" height="100%" fill="url(#glow)" />
      {flakes.map(([x, y, s], i) => (
        <use key={i} href="#flake" x={`${x}%`} y={`${y}%`} width={22 * s} height={22 * s} opacity={0.12} />
      ))}
    </svg>
  );
}

/** label = malý popisek nahoře, value = hlavní údaj, note = doplněk menším písmem pod ním. */
const INFO: { label: string; value: ReactNode; note?: string; icon: ReactNode }[] = [
  { label: "Datum", value: EVENT.dateLabel, icon: <IconCalendar /> },
  {
    label: "Místo",
    value: (
      <a href={EVENT.placeMapUrl} className="underline decoration-ice decoration-2 underline-offset-4 hover:decoration-berry" target="_blank" rel="noopener noreferrer">
        {EVENT.place}
      </a>
    ),
    icon: <IconPin />,
  },
  { label: "Čas", value: EVENT.timeLabel, note: EVENT.timeNote, icon: <IconClock /> },
  { label: "Formát", value: "Čtyřhry • Náhodné dvojice", icon: <IconUsers /> },
  { label: "Startovné", value: EVENT.feeAmount, note: EVENT.feeNote, icon: <IconCoin /> },
  { label: "Konec registrací", value: EVENT.deadlineLabel, icon: <IconFlag /> },
];

function InfoSection() {
  return (
    <section aria-labelledby="info-title" className="px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <h2 id="info-title" className="text-3xl font-extrabold tracking-tight text-ink">
          Podrobnosti turnaje
        </h2>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INFO.map((item) => (
            <div key={item.label} className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ice">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-night text-gold" aria-hidden="true">
                {item.icon}
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted">{item.label}</dt>
                <dd className="mt-0.5 text-base font-bold leading-snug text-ink">
                  {item.value}
                  {item.note && <span className="mt-0.5 block text-sm font-medium text-muted">{item.note}</span>}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function CategoriesSection() {
  return (
    <section aria-labelledby="kategorie-title" className="px-4 pb-14 sm:pb-20">
      <div className="mx-auto max-w-5xl">
        <h2 id="kategorie-title" className="text-3xl font-extrabold tracking-tight text-ink">
          Kategorie
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <CategoryCard
            name="Casual"
            tone="ice"
            text="Nehraju pravidelně, jdu si hlavně pinknout, hýbat se a užít si atmosféru."
          />
          <CategoryCard
            name="Tryhard"
            tone="night"
            text="Beďas hraju aktivně, tempo mi nedělá problém a jdu si pro pořádnej zápas."
          />
        </div>
      </div>
    </section>
  );
}

function CategoryCard({ name, text, tone }: { name: string; text: string; tone: "ice" | "night" }) {
  const dark = tone === "night";
  return (
    <article className={`rounded-2xl p-6 sm:p-7 ${dark ? "bg-night text-white" : "bg-white text-ink ring-1 ring-ice shadow-sm"}`}>
      <h3 className={`text-2xl font-extrabold ${dark ? "text-gold" : "text-berry"}`}>{name}</h3>
      <p className={`mt-3 text-base leading-relaxed ${dark ? "text-ice" : "text-muted"}`}>{text}</p>
    </article>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ice sm:p-8" aria-busy="true" aria-label="Načítám formulář">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-40 rounded bg-ice" />
          <div className="h-12 w-full rounded-xl bg-frost" />
        </div>
      ))}
      <div className="h-14 w-full rounded-xl bg-ice" />
    </div>
  );
}

// --- ikony (24×24, stroke) --------------------------------------------------

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
function IconCalendar() {
  return <Icon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></Icon>;
}
function IconPin() {
  return <Icon><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Icon>;
}
function IconClock() {
  return <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
}
function IconUsers() {
  return <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.5A5 5 0 0 1 21.5 19" /></Icon>;
}
function IconCoin() {
  return <Icon><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5" /></Icon>;
}
function IconFlag() {
  return <Icon><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Icon>;
}
