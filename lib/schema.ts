import { z } from "zod";

/**
 * Klientská validace registrace, JEN pro UX (okamžité hlášky u polí).
 *
 * Pravidla jsou VĚDOMĚ duplikovaná s apps-script/Code.gs (normalizePhone,
 * validateRegistration), který je jediný autoritativní: URL skriptu je
 * veřejná a kdokoli ho může volat bez tohoto formuláře.
 * Při změně pravidel uprav OBĚ místa. Shodu hlídá tests/parity.test.ts.
 */

export const CATEGORY_VALUES = ["casual", "tryhard"] as const;
export const RACKET_VALUES = ["own", "borrow"] as const;
export const AFTER_PARTY_VALUES = ["yes", "no", "maybe"] as const;

export const MESSAGES = {
  nameRequired: "Vyplň jméno a příjmení.",
  nameLength: "Jméno a příjmení musí mít 2 až 100 znaků.",
  nameInvalid: "Jméno obsahuje nepovolené znaky.",
  phoneRequired: "Vyplň telefonní číslo.",
  phoneInvalid: "Zadej české mobilní číslo (9 číslic, začíná 6 nebo 7), např. 777 123 456.",
  categoryRequired: "Vyber kategorii.",
  optionInvalid: "Neplatná volba.",
} as const;

/** Kopie normalizePhone z Code.gs. Viz komentář tam. */
export function normalizePhone(input: string): string | null {
  if (input.length > 40) return null;
  let s = input.replace(/[\s  -​ ().\-‐-―]/g, "");
  if (s.startsWith("+420")) s = s.slice(4);
  else if (s.startsWith("00420")) s = s.slice(5);
  else if (/^420\d{9}$/.test(s)) s = s.slice(3);
  if (!/^[67]\d{8}$/.test(s)) return null;
  return `+420${s}`;
}

/** Délka v Unicode kódových bodech (emoji = 1), stejně jako Array.from v Code.gs. */
const codePointLength = (s: string) => Array.from(s).length;

/** Prázdný string z nevybraného radia → undefined, aby volitelné pole prošlo. */
const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const registrationSchema = z.object({
  name: z
    .string({ error: MESSAGES.nameRequired })
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, MESSAGES.nameRequired)
        .refine((s) => codePointLength(s) >= 2 && codePointLength(s) <= 100, MESSAGES.nameLength)
        .refine((s) => !/[\u0000-\u001f\u007f-\u009f]/.test(s), MESSAGES.nameInvalid),
    ),
  phone: z
    .string({ error: MESSAGES.phoneRequired })
    .trim()
    .min(1, MESSAGES.phoneRequired)
    .refine((s) => normalizePhone(s) !== null, MESSAGES.phoneInvalid),
  category: z.enum(CATEGORY_VALUES, { error: MESSAGES.categoryRequired }),
  racket: z.preprocess(emptyToUndefined, z.enum(RACKET_VALUES, { error: MESSAGES.optionInvalid }).optional()),
  afterParty: z.preprocess(
    emptyToUndefined,
    z.enum(AFTER_PARTY_VALUES, { error: MESSAGES.optionInvalid }).optional(),
  ),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type RegistrationField = keyof RegistrationInput;

export const REGISTRATION_FIELDS: readonly RegistrationField[] = [
  "name",
  "phone",
  "category",
  "racket",
  "afterParty",
];
