import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { EVENT } from "@/lib/config";

/**
 * OG obrázek (náhled odkazu ve WhatsAppu a jinde), 1200×630.
 * Generuje se staticky při buildu (nepoužívá request-time data).
 * Font načítáme lokálně z @fontsource/manrope (WOFF; satori neumí WOFF2),
 * protože výchozí font next/og nemusí mít českou diakritiku.
 */
export const alt = `${EVENT.name}: ${EVENT.tagline}, ${EVENT.dateLabel}, ${EVENT.place}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontDir = join(process.cwd(), "node_modules/@fontsource/manrope/files");

// Fontsource dělí font na subsety: „latin“ má základní znaky, „latin-ext“
// české č, ř, ů, ě… Dva fonty se STEJNÝM jménem a řezem Satori nespojí
// (ověřeno: „Č“ ve „VÁNOČNÍ“ se pak vykreslilo záložním fontem). Proto mají
// subsety různá jména rodin a fontFamily je uvádí jako fallback řetězec.
// Jen jeden řez (800), ať je diakritika všude stejně silná.
//
// PROČ na úrovni modulu: s Cache Components je `await readFile()` UVNITŘ
// handleru „necachovaná IO operace“ a obrázek by se generoval při každém
// requestu (build ho hlásil jako ƒ Dynamic). Dokumentace pro zdroje, které
// se mezi requesty nemění, doporučuje číst je jednou na úrovni modulu.
// Pak je obrázek statický (○), vygenerovaný jednou při buildu.
const [latin800, ext800] = await Promise.all(
  ["latin-800", "latin-ext-800"].map((f) =>
    readFile(join(fontDir, `manrope-${f}-normal.woff`)),
  ),
);

const OUTLINE_OFFSETS = [
  [3, 0], [-3, 0], [0, 3], [0, -3],
  [2, 2], [-2, 2], [2, -2], [-2, -2],
] as const;

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #17305c 0%, #0f1e3a 60%)",
          color: "white",
          fontFamily: "Manrope, ManropeExt",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="76" height="76" viewBox="0 0 64 64">
            <path d="M24 42 L12 8 H52 L40 42 Z" fill="rgba(255,255,255,0.14)" stroke="#ffffff" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M28 42 L22 8 M32 42 V8 M36 42 L42 8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            <path d="M17 22 H47" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            <path d="M32 2 V14 M26.8 5 L37.2 11 M26.8 11 L37.2 5" stroke="#e8bb4f" strokeWidth="2" strokeLinecap="round" />
            <path d="M22 42 H42 V46 A10 10 0 0 1 22 46 Z" fill="#e8bb4f" />
          </svg>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 6, color: "#dbe7f5", textTransform: "uppercase" }}>
            {EVENT.tagline}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 104, fontWeight: 800, lineHeight: 1, textTransform: "uppercase" }}>Vánoční</div>
          <div style={{ display: "flex", fontSize: 104, fontWeight: 800, lineHeight: 1.05, textTransform: "uppercase" }}>
            <span style={{ color: "#e8bb4f" }}>Fonger</span>
            {/* Obrys jako na webu. Satori (next/og) neumí ani WebkitTextStroke
                (text zmizel), ani víc textShadow najednou (vykreslil jen část).
                Proto: 8 zlatých kopií posunutých do stran + navrch kopie
                v barvě pozadí = vizuálně obrys ~3px. */}
            <span style={{ display: "flex", position: "relative" }}>
              {OUTLINE_OFFSETS.map(([x, y]) => (
                <span key={`${x},${y}`} style={{ position: "absolute", left: x, top: y, color: "#e8bb4f" }}>
                  ton
                </span>
              ))}
              <span style={{ position: "relative", color: "#11213f" }}>ton</span>
            </span>
            <span style={{ marginLeft: 28 }}>2026</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 38, fontWeight: 800, color: "#dbe7f5" }}>
            {`${EVENT.dateLabel} · ${EVENT.place} · od 16:00`}
          </div>
          <div
            style={{
              display: "flex",
              background: "#b4233c",
              borderRadius: 16,
              padding: "14px 26px",
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            Registrace do 20. 11.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Manrope", data: latin800, weight: 800, style: "normal" },
        { name: "ManropeExt", data: ext800, weight: 800, style: "normal" },
      ],
    },
  );
}
