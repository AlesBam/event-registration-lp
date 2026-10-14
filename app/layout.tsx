import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { EVENT } from "@/lib/config";
import "./globals.css";

// latin-ext kvůli české diakritice (ř, ů, ě…).
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/**
 * Absolutní URL webu pro OG tagy. WhatsApp (a další) potřebují absolutní URL
 * obrázku, relativní cestu ignorují a náhled pak nemá obrázek.
 * VERCEL_PROJECT_PRODUCTION_URL nastavuje Vercel automaticky (bez https://)
 * a ukazuje na produkční doménu i v preview deployi, takže náhled vede
 * vždy na produkci. Lokálně fallback na localhost.
 */
function siteUrl(): URL {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return new URL(`https://${prod}`);
  return new URL(`http://localhost:${process.env.PORT ?? 3000}`);
}

const description = `Badmintonový turnaj ve čtyřhrách ${EVENT.dateLabel} na ${EVENT.place}. Kategorie Casual i Tryhard, startovné 200 Kč. Registrace do ${EVENT.deadlineLabel}.`;

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: `${EVENT.name} · ${EVENT.tagline}`,
  description,
  openGraph: {
    title: EVENT.name,
    description,
    type: "website",
    locale: "cs_CZ",
    siteName: EVENT.name,
    // og:image doplní Next automaticky z app/opengraph-image.tsx
  },
  twitter: { card: "summary_large_image", title: EVENT.name, description },
};

export const viewport: Viewport = {
  themeColor: "#0f1e3a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs" className={`${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
