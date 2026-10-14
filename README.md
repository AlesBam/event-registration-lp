# Vánoční Fongerton 2026

Landing page a registrace na badmintonový turnaj.

```
Prohlížeč (Next.js 16 na Vercelu)
   │  POST text/plain (JSON v těle)  → registrace
   ▼
Google Apps Script Web App (vázaný na Sheet)  ← GET počet (volá Next.js server, cache 60 s)
   ▼
Google Sheet „Registrace“
```

Osobní údaje jdou **přímo z prohlížeče do Apps Scriptu**. Next.js server (Vercel)
je nikdy nevidí, takže nejsou ani v logech Vercelu.

## Struktura

| Soubor | Co dělá |
| --- | --- |
| `app/page.tsx` | Landing page. Statický shell + dvě `<Suspense>` části renderované při requestu |
| `app/layout.tsx` | Metadata, OG tagy, `metadataBase`, font |
| `app/opengraph-image.tsx` | OG obrázek 1200×630 (statický, generuje se při buildu) |
| `components/RegistrationSection.tsx` | Server: `connection()` → rozhodnutí formulář / uzavřeno při každém requestu |
| `components/RegistrationForm.tsx` | Klient: formulář, validace, odeslání, stavy |
| `components/PlayerCount.tsx` + `LiveCount.tsx` | Počet přihlášených (server načte, klient aktualizuje po registraci) |
| `lib/config.ts` | Uzávěrka, texty, kontakt |
| `lib/schema.ts` | Zod schéma (jen UX) |
| `lib/api.ts` | Klient pro Apps Script, typy odpovědí |
| `lib/player-count.ts` | Načtení počtu na serveru, `"use cache: remote"` 60 s |
| `apps-script/Code.gs` | **Celý backend.** Autoritativní validace, uzávěrka, duplicity, honeypot |
| `apps-script/appsscript.json` | Manifest (časové pásmo, oprávnění, nastavení web app) |
| `scripts/mock-apps-script.mjs` | Lokální mock: spouští skutečný `Code.gs` se Sheetem v paměti |
| `tests/` | Vitest |

## Lokální vývoj

```bash
npm install
```

```bash
npm test
```

Mock backendu (spouští skutečný `Code.gs`, napodobuje redirect i CORS Googlu):

```bash
node scripts/mock-apps-script.mjs
```

V druhém terminálu (Git Bash):

```bash
NEXT_PUBLIC_APPS_SCRIPT_URL=http://localhost:4000/exec npm run dev
```

Proměnné mocku: `MOCK_DEADLINE=<ISO>` (simuluje Script Property uzávěrky),
`MOCK_DELAY_MS=2000` (pomalý backend), `MOCK_FAIL=1` (pád skriptu).
Obsah „Sheetu“ v mocku: http://localhost:4000/rows

---

## 1. Nastavení Google Sheetu a Apps Scriptu

1. Vytvoř nový Google Sheet. List (záložku dole) přejmenuj na **`Registrace`**.
2. Do řádku 1 napiš hlavičku, každé slovo do vlastní buňky A1–F1:
   `Čas registrace | Jméno a příjmení | Telefon | Kategorie | Raketa | Pivo/jídlo`
3. **Rozšíření → Apps Script.** Otevře se editor vázaný na tento Sheet.
4. Smaž obsah `Kód.gs` a vlož celý obsah `apps-script/Code.gs`.
5. **Nastavení projektu** (ozubené kolo vlevo) → zaškrtni
   „Zobrazit soubor manifestu appsscript.json v editoru“. Vrať se do editoru,
   otevři `appsscript.json` a nahraď jeho obsah souborem `apps-script/appsscript.json`.
6. Ulož (Ctrl+S).
7. V horní liště vyber funkci **`setupSheet`** → **Spustit**.
   - Google si vyžádá autorizaci. Protože je skript tvůj a neověřený, zobrazí
     „Google tuto aplikaci neověřil“ → **Rozšířené → Přejít na … (nebezpečné)** → Povolit.
     Oprávnění je jen `spreadsheets.currentonly` (přístup k tomuto jednomu Sheetu).
   - Funkce zkontroluje hlavičku a nastaví sloupce A:F na formát „prostý text“.
8. Vyber funkci **`selfTest`** → **Spustit** a otevři **Protokol provádění**.
   Musí končit řádkem `VÝSLEDEK: produkční cesta ukládá všechny hodnoty jako text beze změny.`
   Ověřeno 2026-10-14: proti vzorcům chrání **jen apostrof**. Textový formát `@`
   při zápisu přes `setValues` vzorec nezastaví (`=1+1` → 2), brání jen převodu
   typů (např. `-5` → číslo). Proto jsou v kódu obě vrstvy. Kdyby log někdy
   ukázal `FAIL` u řádku „produkční cesta“, je ochrana rozbitá.
9. **Nasadit → Nové nasazení** → ozubené kolo u „Vyberte typ“ → **Webová aplikace**:
   - Popis: např. `v1`
   - **Spustit jako: Já**
   - **Kdo má přístup: Kdokoli**
   - **Nasadit** → zkopíruj **URL webové aplikace** (končí na `/exec`).

> Proč „Spustit jako: Já“: skript zapisuje do tvého Sheetu tvým oprávněním.
> Návštěvníci se nepřihlašují a k Sheetu přístup nemají.

## 2. Aktualizace skriptu (URL `/exec` zůstane stejná)

1. Uprav kód v editoru a ulož.
2. **Nasadit → Spravovat nasazení** → u stávajícího nasazení **tužka (Upravit)**.
3. **Verze: Nová verze** → **Nasadit**.

⚠️ **Bez tohoto kroku běží na `/exec` pořád STARÁ verze.** Uložení kódu nestačí.
„Nové nasazení“ by vytvořilo **novou URL** a frontend by dál volal tu starou.

Výjimka: **Script Properties** (např. `REGISTRATION_DEADLINE`) se čtou za běhu,
jejich změna platí hned, bez nového nasazení.

## 3. Vercel

1. Importuj repozitář do Vercelu (framework se rozpozná sám).
2. **Settings → Environment Variables**:
   - `NEXT_PUBLIC_APPS_SCRIPT_URL` = URL z kroku 1.9 (`https://script.google.com/macros/s/…/exec`)
   - Prostředí: Production (a Preview, pokud chceš testovat preview deploye).
3. **Redeploy.** Proměnná s prefixem `NEXT_PUBLIC_` se vkládá do JS **při buildu**,
   změna se projeví až po novém deployi.
4. `VERCEL_PROJECT_PRODUCTION_URL` (pro absolutní URL OG obrázku) nastavuje Vercel sám,
   pokud je zapnuté „Automatically expose System Environment Variables“ (výchozí stav).

`NEXT_PUBLIC_APPS_SCRIPT_URL` **není tajemství**. Je vidět v klientském JS.
Bezpečnost stojí na logice ve skriptu.

## 4. Checklist před spuštěním

Do proměnné si ulož URL (Git Bash):

```bash
URL="https://script.google.com/macros/s/TVOJE_ID/exec"
```

**Backend přímo (curl).** Používej `-L` (sleduj redirect) a **ne** `-X POST`:
curl by pak POST poslal i na cílovou URL a Google vrátí 405. S `-d` a bez `-X`
curl po 302 správně přejde na GET.

- [ ] **Počet:** `curl -sL "$URL"` → `{"ok":true,"count":0,"open":true}`
- [ ] **Nevalidní JSON:**
  ```bash
  curl -sL -H "Content-Type: text/plain;charset=utf-8" -d '{name:' "$URL"
  ```
  → `VALIDATION`, `field: null`
- [ ] **Nevalidní telefon:**
  ```bash
  curl -sL -H "Content-Type: text/plain;charset=utf-8" -d '{"name":"Test","phone":"123","category":"casual"}' "$URL"
  ```
  → `VALIDATION`, `field: "phone"`
- [ ] **Nepovolená kategorie / volba:** `"category":"pro"` → `field: "category"`; `"racket":"x"` → `field: "racket"`
- [ ] **Honeypot:**
  ```bash
  curl -sL -H "Content-Type: text/plain;charset=utf-8" -d '{"name":"Bot","phone":"777000111","category":"casual","website":"x"}' "$URL"
  ```
  → `{"ok":true}` a v Sheetu **žádný** nový řádek
- [ ] **CORS hlavičky na redirectu.** Tohle Google oficiálně nedokumentuje, ale prohlížeč
  kontroluje CORS u **každé** odpovědi v řetězci. Mock to při vývoji odhalil.
  ```bash
  curl -s -D - -o /dev/null -H "Origin: https://example.vercel.app" -H "Content-Type: text/plain;charset=utf-8" -d '{}' "$URL"
  ```
  Očekávám `HTTP/… 302`, `location: https://script.googleusercontent.com/…`
  a `access-control-allow-origin: *`. Definitivní test je registrace z prohlížeče (níže).

**Přes web (nejdřív na Vercel preview nebo produkci, ještě před rozesláním odkazu):**

- [ ] **Úspěšná registrace** z telefonu: potvrzení se srazem **15:50 v areálu Hamr Braník**,
  počet v hero se zvýší, v Sheetu je řádek s pražským časem.
- [ ] **Duplicita:** stejné číslo v jiném formátu (`+420 777…` vs. `777…`) → hláška u pole Telefon.
- [ ] **Nevalidní telefon** ve formuláři (`123`, pevná linka `222 123 456`) → hláška u pole.
- [ ] **Formula injection:** jméno `=1+1` → v Sheetu je text `=1+1`, ne `2`.
  Klikni do buňky: v řádku vzorců nesmí být vzorec.
- [ ] **Telefon jako text:** buňka ukazuje `+420777123456` včetně `+`, zarovnaná vlevo (text),
  ne `420777123456` ani `4,21E+11`.
- [ ] **Uzávěrka:** v Apps Script editoru **Nastavení projektu → Vlastnosti skriptu** → přidej
  `REGISTRATION_DEADLINE` = `2026-10-01T12:00:00+02:00` (minulost). Odešli formulář
  → stránka ukáže „Registrace uzavřena“. `curl -sL "$URL"` → `"open":false`.
  **Pak vlastnost SMAŽ** (jinak zůstane registrace zavřená).
  Frontend tuto vlastnost nevidí: zavře se sám až podle `lib/config.ts`, skript ale odmítá hned.
- [ ] **Mobil:** iPhone i Android, úzký displej, velké písmo v systému, ovládání jen klávesnicí
  (Tab / šipky v radio skupinách / Enter), VoiceOver nebo TalkBack přečte chyby u polí.
- [ ] **Náhled ve WhatsAppu:** pošli odkaz sobě. Má mít obrázek, název a popis.
  WhatsApp náhledy cachuje: pro opakovaný test přidej `?v=2`.
  Alternativa: https://www.opengraph.xyz/ nebo Facebook Sharing Debugger.
- [ ] **Úklid:** smaž testovací řádky ze Sheetu (celé řádky, ne jen obsah). Počet se srovná do ~2 min.

## 5. Kde to může selhat a co s tím

| Riziko | Projev | Co s tím |
| --- | --- | --- |
| Google změní chování redirectu / CORS | Každé odeslání skončí „Něco se pokazilo…“ | Hlídat první registrace. Záložní plán: Next.js Route Handler jako proxy (změna architektury, konzultovat). |
| Zapomenutá „Nová verze“ při úpravě skriptu | Na `/exec` běží starý kód | Vždy Spravovat nasazení → Upravit → Nová verze. |
| Google Workspace účet nepovolí přístup „Kdokoli“ | Volby přístupu chybí nebo je vyžadováno přihlášení | Nasadit z osobního @gmail.com účtu. |
| Úprava struktury Sheetu | Přejmenovaný list → SERVER_ERROR; nový sloupec před Telefon → špatná kontrola duplicit | List nepřejmenovávat, sloupce nepřidávat vlevo od F. Vlastní poznámky dávej do sloupce G a dál. |
| Odvolaná autorizace / změna oprávnění skriptu | SERVER_ERROR, v logu chyba oprávnění | V editoru spusť libovolnou funkci (např. `setupSheet`) a znovu autorizuj. Pokud hlásí chybějící scope, smaž v manifestu `oauthScopes` a autorizuj znovu. |
| Zastaralý počet | Hero ukazuje až ~2 min starý počet | Záměr: 60 s cache v Next.js + 60 s v Apps Scriptu. Po vlastní registraci uživatel vidí přesný počet. |
| Timeout 15 s, ale zápis proběhl | Uživatel zkusí znovu a dostane DUPLICATE | Hláška to vysvětluje („registrace nejspíš prošla“). |
| Spam s validními daty | Falešné řádky v Sheetu | Honeypot chytí jen hloupé boty. URL je veřejná a Apps Script nevidí IP, takže rate limit nejde udělat spolehlivě. Řešení: ruční úklid, případně dočasně zavřít přes `REGISTRATION_DEADLINE`. |
| Kvóty Apps Scriptu | Při návalu SERVER_ERROR „server je vytížený“ | Zámek čeká až 10 s. Pro desítky lidí je to s rezervou. Uživatel může odeslat znovu. |
| `use cache: remote` na Vercelu | Počet se načítá při každém zobrazení (pomalejší, víc volání skriptu) | Na Vercelu by měl být handler automaticky. Zkontroluj v logu funkce, že se Apps Script nevolá při každém requestu. |
| Změna `NEXT_PUBLIC_APPS_SCRIPT_URL` bez redeploye | Frontend volá starou URL | Po změně proměnné vždy Redeploy. |
| Nesmazání osobních údajů po turnaji | Slib na webu nedodržen | Po turnaji smaž řádky v Sheetu i WhatsApp skupinu. Nastav si připomínku. V logách Apps Scriptu ani Vercelu osobní údaje nejsou. |

## Klíčová rozhodnutí (a proč)

- **Cache Components (výchozí v Next.js 16).** `RegistrationSection` a `PlayerCount` volají
  `await connection()`, takže se vyhodnotí až při requestu. Hero, info a kategorie jsou
  ve statickém shellu. Build hlásí `/` jako `◐ Partial Prerender`. Po uzávěrce se stránka
  zavře sama, bez deploye.
- **`"use cache: remote"` + `cacheLife({ stale: 60, revalidate: 60, expire: 300 })`** pro počet.
  Výchozí in-memory `use cache` na serverless mezi requesty nepřetrvává. Chyba (výjimka)
  se do cache neuloží, kdežto `fetch` cache by uložila i `{ok:false}`, protože Apps Script vrací vždy 200.
- **`text/plain` místo `application/json`.** Apps Script neodpovídá na CORS preflight.
- **Formulář do hydratace disabled + `method="post"`.** Při testu se před hydratací formulář
  odeslal nativně jako GET a jméno s telefonem skončily v URL.
- **Validace duplikovaná** (`Code.gs` autoritativně, `lib/schema.ts` pro UX).
  `tests/parity.test.ts` hlídá, že se nerozešly.
- **Počet = neprázdné buňky ve sloupci Telefon**, ne `getLastRow() - 1`.
  Odolné vůči řádkům, kde někdo jen vymazal obsah.
- **Zápis přes `setNumberFormat("@")` + `setValues`**, ne `appendRow`.
  Formát se musí nastavit dřív, než se hodnota zapíše.
