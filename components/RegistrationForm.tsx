"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { submitRegistration, toPayload } from "@/lib/api";
import { CONTACT, EVENT, PRIVACY_NOTE } from "@/lib/config";
import { setLiveCount } from "@/lib/count-store";
import { REGISTRATION_FIELDS, registrationSchema, type RegistrationField } from "@/lib/schema";
import { ClosedNotice } from "./ClosedNotice";

type Status = "idle" | "submitting" | "success" | "closed";
type FieldErrors = Partial<Record<RegistrationField, string>>;
/** "invalid" = chyby v polích (souhrn), "generic" = síť / server / timeout. */
type FormError = "invalid" | "generic" | null;

const DUPLICATE_MESSAGE =
  "Na tohle číslo už registrace existuje. Pokud jsi to právě zkoušel(a) odeslat, registrace nejspíš prošla.";

function isField(v: unknown): v is RegistrationField {
  return typeof v === "string" && (REGISTRATION_FIELDS as readonly string[]).includes(v);
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

const noopSubscribe = () => () => {};

/**
 * true až po hydrataci v prohlížeči (na serveru a při SSR false).
 * PROČ: než React převezme formulář, kliknutí na „Přihlásit se“ by spustilo
 * NATIVNÍ odeslání formuláře. Ověřeno při testu: bez ochrany šel GET
 * a jméno s telefonem skončily v URL (historie, logy Vercelu). Na pomalém
 * telefonu z WhatsAppu se to reálně může stát. Proto je tlačítko do
 * hydratace disabled. Disabled výchozí tlačítko blokuje i odeslání Enterem.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function RegistrationForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormError>(null);
  const hydrated = useHydrated();

  // Ref (ne jen state) jako pojistka proti dvojímu odeslání: dva rychlé
  // kliky můžou proběhnout dřív, než React překreslí disabled tlačítko.
  const submittingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  // Fokus přesouváme až PO vykreslení chyb, aby screen reader při fokusu
  // přečetl i nově připojenou chybovou hlášku (aria-describedby).
  const pendingFocus = useRef<RegistrationField | null>(null);

  useEffect(() => {
    if (pendingFocus.current) {
      formRef.current?.querySelector<HTMLElement>(`[name="${pendingFocus.current}"]`)?.focus();
      pendingFocus.current = null;
    }
  }, [errors]);

  useEffect(() => {
    if (status === "success") successRef.current?.focus();
  }, [status]);

  function showFieldErrors(next: FieldErrors) {
    pendingFocus.current = REGISTRATION_FIELDS.find((f) => next[f]) ?? null;
    setErrors(next);
  }

  function handleChange(e: FormEvent<HTMLFormElement>) {
    const name = (e.target as HTMLInputElement).name;
    if (isField(name) && errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;

    const fd = new FormData(e.currentTarget);
    const parsed = registrationSchema.safeParse({
      name: str(fd.get("name")),
      phone: str(fd.get("phone")),
      category: fd.get("category") ?? undefined,
      racket: str(fd.get("racket")),
      afterParty: str(fd.get("afterParty")),
    });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (isField(field) && !next[field]) next[field] = issue.message;
      }
      setFormError("invalid");
      showFieldErrors(next);
      return;
    }

    setErrors({});
    setFormError(null);
    submittingRef.current = true;
    setStatus("submitting");

    const result = await submitRegistration(toPayload(parsed.data, str(fd.get("website"))));
    submittingRef.current = false;

    if (result.ok) {
      if (result.count !== null) setLiveCount(result.count);
      setStatus("success");
      return;
    }

    switch (result.code) {
      case "CLOSED":
        // Stránka byla otevřená přes uzávěrku: autoritativní skript řekl „zavřeno“.
        setStatus("closed");
        return;
      case "DUPLICATE":
        setStatus("idle");
        setFormError("invalid");
        showFieldErrors({ phone: DUPLICATE_MESSAGE });
        return;
      case "VALIDATION":
        setStatus("idle");
        if (result.field) {
          setFormError("invalid");
          showFieldErrors({ [result.field]: result.message ?? "Zkontroluj tuto položku." });
        } else {
          setFormError("generic");
        }
        return;
      default:
        // SERVER_ERROR, NETWORK, TIMEOUT
        setStatus("idle");
        setFormError("generic");
    }
  }

  if (status === "closed") return <ClosedNotice />;

  if (status === "success") {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-ice sm:p-8" role="status">
        <div className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-success/10 text-success" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h3 ref={successRef} tabIndex={-1} className="text-2xl font-extrabold text-ink outline-none">
          Hotovo, registrace proběhla!
        </h3>
        <p className="mt-4 rounded-xl bg-night px-5 py-4 text-lg leading-snug text-white">
          Sraz je v <strong className="text-gold">{EVENT.meetingTime}</strong> v areálu{" "}
          <strong className="text-gold">{EVENT.place}</strong>, {EVENT.dateLong}.
        </p>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Brzy tě přidáme do WhatsApp skupiny turnaje, kde budou případné změny a info. Startovné{" "}
          {EVENT.feeAmount} zaplatíš na místě QR kódem nebo hotově.
        </p>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={handleChange}
      // Druhá vrstva ochrany (viz useHydrated): i kdyby se formulář odeslal
      // nativně, POST nedá osobní údaje do URL jako výchozí GET.
      method="post"
      noValidate
      aria-busy={submitting}
      className="space-y-7 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ice sm:p-8"
    >
      {/* Honeypot: skrytý přes CSS (mimo obrazovku), mimo tab pořadí a čtečky.
          Člověk ho nevyplní, bot obvykle ano. Skript pak vrátí falešný úspěch. */}
      <div className="hp-field" aria-hidden="true">
        <label htmlFor="website">Web (nevyplňuj)</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      {/* Povinné je všechno, proto jedna věta místo „(povinné)“ u každého pole.
          Pro čtečky má každé pole aria-required. */}
      <p className="text-sm text-muted">Všechna pole jsou povinná.</p>

      <TextField
        name="name"
        label="Jméno a příjmení"
        autoComplete="name"
        maxLength={100}
        error={errors.name}
      />

      <TextField
        name="phone"
        label="Telefonní číslo"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={20}
        placeholder="777 123 456"
        hint={PRIVACY_NOTE}
        error={errors.phone}
      />

      <RadioGroup
        name="category"
        legend="Kategorie"
        error={errors.category}
        columns={2}
        options={[
          { value: "casual", label: "Casual", description: "Jdu si hlavně pinknout a užít si atmosféru." },
          { value: "tryhard", label: "Tryhard", description: "Hraju aktivně a jdu si pro pořádnej zápas." },
        ]}
      />

      <RadioGroup
        name="racket"
        legend="Vlastní raketa?"
        error={errors.racket}
        columns={2}
        options={[
          { value: "own", label: "Mám vlastní" },
          { value: "borrow", label: "Potřebuji půjčit" },
        ]}
      />

      <RadioGroup
        name="afterParty"
        legend="Půjdeš po turnaji na pivo/jídlo na Hamru?"
        hint="Kvůli rezervaci v restauraci."
        error={errors.afterParty}
        columns={3}
        options={[
          { value: "yes", label: "Ano" },
          { value: "no", label: "Ne" },
          { value: "maybe", label: "Ještě nevím" },
        ]}
      />

      <div className="space-y-4">
        {formError && (
          <div role="alert" className="rounded-xl border-2 border-danger/30 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">
            {formError === "invalid" ? (
              "Zkontroluj prosím zvýrazněná pole."
            ) : (
              <>
                Něco se pokazilo, zkus to prosím znovu. Pokud to nepůjde, napiš {CONTACT.nameTo}:{" "}
                <a href={CONTACT.phoneHref} className="font-bold whitespace-nowrap underline underline-offset-2">
                  {CONTACT.phoneDisplay}
                </a>
              </>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !hydrated}
          className="inline-flex w-full items-center justify-center gap-3 rounded-xl bg-berry px-6 py-4 text-lg font-bold text-white shadow-sm transition hover:bg-berry-dark focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-berry disabled:cursor-wait disabled:opacity-80"
        >
          {submitting && (
            <span className="size-5 animate-spin rounded-full border-[3px] border-white/40 border-t-white motion-reduce:animate-none" aria-hidden="true" />
          )}
          {submitting ? "Odesílám…" : "Přihlásit se"}
        </button>
        <p className="text-center text-sm text-muted">
          Startovné {EVENT.feeAmount} {EVENT.feeNote}. Registrace do {EVENT.deadlineLabel}.
        </p>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-2 flex items-start gap-1.5 text-sm font-medium text-danger">
      <span aria-hidden="true">⚠</span>
      <span>{children}</span>
    </p>
  );
}

type TextFieldProps = {
  name: RegistrationField;
  label: string;
  type?: "text" | "tel";
  inputMode?: "text" | "tel";
  autoComplete: string;
  maxLength: number;
  placeholder?: string;
  hint?: string;
  error?: string;
};

function TextField({ name, label, type = "text", inputMode, autoComplete, maxLength, placeholder, hint, error }: TextFieldProps) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={name} className="block text-base font-bold text-ink">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`mt-2 block w-full rounded-xl border-2 bg-white px-4 py-3 text-base text-ink placeholder:text-slate-400 focus:outline-none focus-visible:border-berry focus-visible:ring-4 focus-visible:ring-berry/20 ${
          error ? "border-danger" : "border-slate-300"
        }`}
      />
      <FieldError id={errorId}>{error}</FieldError>
      {hint && (
        <p id={hintId} className="mt-2 text-sm leading-relaxed text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

type RadioOption = { value: string; label: string; description?: string };

type RadioGroupProps = {
  name: RegistrationField;
  legend: string;
  options: RadioOption[];
  hint?: string;
  error?: string;
  columns: 2 | 3;
};

/**
 * Radio jako velké dlaždice (ne select): na mobilu jsou všechny volby vidět
 * najednou a mají velkou dotykovou plochu.
 * Nativní <input type="radio"> zůstává (vizuálně skrytý), takže funguje
 * klávesnice (šipky), čtečky i fieldset/legend.
 */
function RadioGroup({ name, legend, options, hint, error, columns }: RadioGroupProps) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  const grid = columns === 3 ? "grid-cols-1 min-[420px]:grid-cols-3" : "grid-cols-1 min-[420px]:grid-cols-2";

  return (
    // role=radiogroup: aria-required/aria-invalid patří na skupinu, ne na jednotlivé radio.
    <fieldset
      role="radiogroup"
      aria-required="true"
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
    >
      <legend className="text-base font-bold text-ink">{legend}</legend>
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      )}
      <div className={`mt-3 grid gap-3 ${grid}`}>
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          return (
            <div key={o.value} className="relative">
              <input
                type="radio"
                id={id}
                name={name}
                value={o.value}
                aria-describedby={error ? errorId : undefined}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={`flex h-full min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 bg-white px-4 py-3 transition hover:border-slate-400 peer-checked:border-berry peer-checked:bg-berry/5 peer-focus-visible:ring-4 peer-focus-visible:ring-berry/25 peer-checked:[&_.dot]:border-berry peer-checked:[&_.dot]:bg-berry peer-checked:[&_.dot]:shadow-[inset_0_0_0_3px_white] ${
                  error ? "border-danger" : "border-slate-300"
                }`}
              >
                <span className="dot mt-0.5 size-5 shrink-0 rounded-full border-2 border-slate-400 bg-white" aria-hidden="true" />
                <span>
                  <span className="block font-bold text-ink">{o.label}</span>
                  {o.description && <span className="mt-0.5 block text-sm leading-snug text-muted">{o.description}</span>}
                </span>
              </label>
            </div>
          );
        })}
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  );
}
