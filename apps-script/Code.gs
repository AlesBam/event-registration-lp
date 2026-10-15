/**
 * Vánoční Fongerton 2026 – backend registrací (Google Apps Script Web App).
 *
 * HRANICE DŮVĚRY
 * URL /exec je veřejná (je v klientském JS), takže kdokoli sem může poslat
 * cokoli, i mimo náš formulář (curl, bot). Tento skript je proto JEDINÉ
 * autoritativní místo pro validaci, uzávěrku, kontrolu duplicit a honeypot.
 * Klientské validaci nevěříme.
 *
 * SDÍLENÍ PRAVIDEL S FRONTENDEM
 * Validační pravidla jsou VĚDOMĚ duplikovaná ve frontendu (lib/schema.ts),
 * kde slouží jen pro UX. Při změně pravidel je nutné upravit OBĚ místa.
 * Shodu hlídá test tests/parity.test.ts.
 *
 * TESTOVATELNOST
 * Čisté funkce (normalizePhone, validateRegistration, isRegistrationOpen, …)
 * nesahají na žádnou Google službu, takže je Vitest spustí v Node.
 * Na nejvyšší úrovni souboru proto NESMÍ být volání SpreadsheetApp,
 * CacheService apod.: Vitest načítá tento soubor bez nich a načtení by spadlo.
 * Export pro Node je na konci souboru za guardem `typeof module`.
 *
 * LOGOVÁNÍ
 * Do logů nikdy nezapisujeme osobní údaje ani text chyb, které by je mohly
 * obsahovat (např. JSON.parse vkládá kus vstupu do zprávy). Logujeme jen
 * typ chyby a místo, kde nastala.
 */

// ---------------------------------------------------------------------------
// Konfigurace
// ---------------------------------------------------------------------------

const SHEET_NAME = 'Registrace';

/**
 * Výchozí uzávěrka. V listopadu platí v Praze zimní čas (CET = UTC+1).
 * MUSÍ odpovídat REGISTRATION_DEADLINE v lib/config.ts na frontendu.
 * Pro testování lze přepsat Script Property `REGISTRATION_DEADLINE`
 * (ISO 8601 s offsetem, např. 2026-10-14T12:00:00+02:00).
 */
const DEFAULT_DEADLINE_ISO = '2026-11-20T20:00:00+01:00';
const DEADLINE_PROPERTY = 'REGISTRATION_DEADLINE';

const TIME_ZONE = 'Europe/Prague';
const TIMESTAMP_FORMAT = 'yyyy-MM-dd HH:mm:ss';

const COUNT_CACHE_KEY = 'registrationCount';
const COUNT_CACHE_SECONDS = 60;

/**
 * Jak dlouho čekat na zámek. Zápis jednoho řádku trvá typicky < 1 s,
 * takže 10 s pokryje i nával desítek souběžných registrací. Delší čekání
 * nedává smysl, protože frontend request stejně po 15 s ukončí.
 */
const LOCK_TIMEOUT_MS = 10000;

/** Ochrana proti obřím tělům requestu. Platná registrace má pár set bajtů. */
const MAX_BODY_LENGTH = 10000;

// Sloupce: Čas registrace | Jméno a příjmení | Telefon | Kategorie | Raketa | Pivo/jídlo
const NUM_COLUMNS = 6;
const PHONE_COLUMN = 3;
const EXPECTED_HEADER = [
  'Čas registrace',
  'Jméno a příjmení',
  'Telefon',
  'Kategorie',
  'Raketa',
  'Pivo/jídlo',
];

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;

/**
 * Povolené hodnoty (enumy). Klíč = hodnota, kterou posílá frontend,
 * hodnota = čitelný text, který se uloží do Sheetu.
 */
const CATEGORY_LABELS = { casual: 'Casual', tryhard: 'Tryhard' };
const RACKET_LABELS = { own: 'Mám vlastní', borrow: 'Potřebuji půjčit' };
const AFTER_PARTY_LABELS = { yes: 'Ano', no: 'Ne', maybe: 'Ještě nevím' };

const MESSAGES = {
  invalidRequest: 'Neplatný požadavek.',
  nameRequired: 'Vyplň jméno a příjmení.',
  nameLength: 'Jméno a příjmení musí mít 2 až 100 znaků.',
  nameInvalid: 'Jméno obsahuje nepovolené znaky.',
  phoneRequired: 'Vyplň telefonní číslo.',
  phoneInvalid: 'Zadej české mobilní číslo (9 číslic, začíná 6 nebo 7), např. 777 123 456.',
  categoryRequired: 'Vyber kategorii.',
  racketRequired: 'Vyber, jestli máš vlastní raketu.',
  afterPartyRequired: 'Vyber, jestli půjdeš na pivo/jídlo.',
  duplicate:
    'Na tohle číslo už registrace existuje. Pokud jsi to právě zkoušel(a) odeslat, registrace nejspíš prošla.',
  closed: 'Registrace je uzavřená.',
  busy: 'Server je právě vytížený, zkus to prosím za chvíli znovu.',
  serverError: 'Něco se pokazilo, zkus to prosím znovu.',
};

// ---------------------------------------------------------------------------
// Čisté funkce (testované ve Vitestu)
// ---------------------------------------------------------------------------

/**
 * Normalizuje české mobilní číslo do tvaru +420XXXXXXXXX, jinak vrátí null.
 *
 * Přijímá např. 777123456, 777 123 456, +420 777 123 456, +420777123456,
 * 00420777123456, 420777123456. Odstraňuje mezery (včetně nezlomitelných,
 * které vznikají kopírováním z WhatsAppu), pomlčky, závorky a tečky.
 *
 * Proč 420 bez plusu ořezáváme JEN u 12 číslic: 9místné číslo, které náhodou
 * začíná na 420, by se jinak zkrátilo na 6 číslic a byla by to chyba.
 *
 * Proč jen 6/7 na začátku: číslo slouží k přidání do WhatsApp skupiny,
 * takže musí být mobilní. České mobilní rozsahy začínají 6 nebo 7.
 */
function normalizePhone(input) {
  if (typeof input !== 'string' || input.length > 40) return null;

  let s = input.replace(/[\s\u00a0\u2000-\u200b\u202f().\-\u2010-\u2015]/g, '');

  if (s.indexOf('+420') === 0) {
    s = s.slice(4);
  } else if (s.indexOf('00420') === 0) {
    s = s.slice(5);
  } else if (/^420\d{9}$/.test(s)) {
    s = s.slice(3);
  }

  if (!/^[67]\d{8}$/.test(s)) return null;
  return '+420' + s;
}

/** Parsuje ISO datum s offsetem. Nevalidní vstup → null. */
function parseDeadline(iso) {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const d = new Date(iso.trim());
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Registrace je otevřená STRIKTNĚ před uzávěrkou. Přesně v okamžiku
 * uzávěrky (20:00:00.000) už je zavřeno.
 * Porovnáváme přes getTime(), ne instanceof Date, aby funkce fungovala
 * i s Date objekty z jiného kontextu (Vitest načítá skript přes node:vm).
 */
function isRegistrationOpen(now, deadline) {
  if (!now || !deadline) return false;
  const n = now.getTime();
  const d = deadline.getTime();
  if (isNaN(n) || isNaN(d)) return false;
  return n < d;
}

/** Vrátí true, pokud je vyplněné honeypot pole (= nejspíš bot). */
function isHoneypotFilled(body) {
  if (!body || typeof body !== 'object') return false;
  const v = body.website;
  if (v === undefined || v === null) return false;
  return String(v).trim() !== '';
}

/**
 * Validuje a normalizuje vstup registrace.
 * Vrací { ok: true, value: {...} } nebo { ok: false, field, message }.
 * `value` obsahuje už jen povolené, normalizované hodnoty (labely do Sheetu).
 */
function validateRegistration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, field: null, message: MESSAGES.invalidRequest };
  }

  // Jméno: trim, sloučení vícenásobných mezer, 2–100 znaků, žádné řídicí znaky.
  if (typeof input.name !== 'string' || input.name.trim() === '') {
    return { ok: false, field: 'name', message: MESSAGES.nameRequired };
  }
  const name = input.name.trim().replace(/\s+/g, ' ');
  // Délku počítáme v Unicode kódových bodech (emoji = 1 znak), stejně jako Zod
  // na frontendu po normalizaci; viz poznámka v lib/schema.ts.
  const nameLength = Array.from(name).length;
  if (nameLength < NAME_MIN_LENGTH || nameLength > NAME_MAX_LENGTH) {
    return { ok: false, field: 'name', message: MESSAGES.nameLength };
  }
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name)) {
    return { ok: false, field: 'name', message: MESSAGES.nameInvalid };
  }

  // Telefon
  if (typeof input.phone !== 'string' || input.phone.trim() === '') {
    return { ok: false, field: 'phone', message: MESSAGES.phoneRequired };
  }
  const phone = normalizePhone(input.phone);
  if (phone === null) {
    return { ok: false, field: 'phone', message: MESSAGES.phoneInvalid };
  }

  // Výběrová pole: všechna povinná, jen hodnoty z enumu. Chybějící, prázdná
  // i nepovolená hodnota dávají stejnou hlášku (z formuláře přijde jen
  // „nevybráno“; cokoli jiného posílá někdo mimo formulář).
  const category = requiredEnum_(input.category, CATEGORY_LABELS);
  if (category === null) return { ok: false, field: 'category', message: MESSAGES.categoryRequired };

  const racket = requiredEnum_(input.racket, RACKET_LABELS);
  if (racket === null) return { ok: false, field: 'racket', message: MESSAGES.racketRequired };

  const afterParty = requiredEnum_(input.afterParty, AFTER_PARTY_LABELS);
  if (afterParty === null) {
    return { ok: false, field: 'afterParty', message: MESSAGES.afterPartyRequired };
  }

  return {
    ok: true,
    value: {
      name: name,
      phone: phone,
      category: category,
      racket: racket,
      afterParty: afterParty,
    },
  };
}

/**
 * Ochrana proti formula injection: hodnotu začínající =, +, -, @ (a tab/CR,
 * které OWASP uvádí pro CSV injection) prefixujeme apostrofem. Apostrof
 * Sheets chápe jako „ber to jako text“ (v buňce ani v getDisplayValues()
 * není vidět).
 *
 * Tohle je JEDINÁ ochrana proti vzorcům. Ověřeno selfTest() ve skutečném
 * Sheetu (2026-10-14): setValues('=1+1') do buňky s formátem @ uloží
 * VZOREC (výsledek 2). Textový formát vzorcům nebrání, chrání jen před
 * převodem typů (viz appendRow_).
 */
function escapeForSheet(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/** Sestaví řádek pro Sheet ve správném pořadí sloupců. */
function buildRow(value, timestamp) {
  return [timestamp, value.name, value.phone, value.category, value.racket, value.afterParty];
}

/**
 * Parsuje tělo requestu. Posíláme ho jako text/plain (kvůli CORS, viz
 * lib/api.ts), takže JSON je v e.postData.contents jako string.
 * Vrací objekt, nebo null, pokud tělo chybí, je moc velké nebo to není JSON objekt.
 */
function parseBody(e) {
  if (!e || !e.postData || typeof e.postData.contents !== 'string') return null;
  const raw = e.postData.contents;
  if (raw.length === 0 || raw.length > MAX_BODY_LENGTH) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

/**
 * Najde duplicitu v hodnotách sloupce Telefon (z getDisplayValues()).
 * Každou buňku znovu normalizujeme, takže duplicitu poznáme i u čísla,
 * které někdo ručně zapsal do Sheetu jinak (např. „777 123 456“), nebo
 * u buňky, kde by se apostrof uložil doslovně.
 */
function isDuplicatePhone(phoneCells, phone) {
  for (let i = 0; i < phoneCells.length; i++) {
    const cell = String(phoneCells[i][0] || '').replace(/^'/, '');
    if (cell !== '' && normalizePhone(cell) === phone) return true;
  }
  return false;
}

/**
 * Počet přihlášených = počet neprázdných buněk ve sloupci Telefon (bez hlavičky).
 * Proč ne getLastRow() - 1: když někdo v Sheetu jen vymaže obsah řádku
 * (místo smazání řádku), getLastRow() ho dál počítá.
 */
function countFilled(phoneCells) {
  let count = 0;
  for (let i = 0; i < phoneCells.length; i++) {
    if (String(phoneCells[i][0] || '').trim() !== '') count++;
  }
  return count;
}

function hasOwn_(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Vrátí label pro povolenou hodnotu, jinak null (chybí, prázdná i nepovolená).
 * hasOwn_ místo `value in labels`, aby neprošly klíče z prototypu (toString…).
 */
function requiredEnum_(value, labels) {
  if (typeof value !== 'string' || !hasOwn_(labels, value)) return null;
  return labels[value];
}

// ---------------------------------------------------------------------------
// Web App endpointy
// ---------------------------------------------------------------------------

/**
 * POST: registrace.
 * Apps Script neumí nastavit HTTP status, takže vždy vracíme 200 a výsledek
 * je v těle ({ ok, code, ... }). Celé tělo je v try/catch: nezachycená
 * výjimka by vrátila HTML chybovou stránku Googlu bez CORS hlaviček
 * a frontend by ji neuměl přečíst.
 */
function doPost(e) {
  try {
    return jsonResponse_(handleRegistration_(e));
  } catch (err) {
    logError_('doPost', err);
    return jsonResponse_({ ok: false, code: 'SERVER_ERROR', message: MESSAGES.serverError });
  }
}

function handleRegistration_(e) {
  // 1. Bezpečné parsování JSON.
  const body = parseBody(e);
  if (body === null) {
    return { ok: false, code: 'VALIDATION', field: null, message: MESSAGES.invalidRequest };
  }

  // 2. Honeypot: falešný úspěch, nic nezapisujeme. Bot nepozná, že byl odhalen.
  //    Kontrolujeme ho před uzávěrkou i validací, aby bot nemohl podle odpovědí
  //    zkoumat, která pravidla platí.
  if (isHoneypotFilled(body)) {
    console.log('doPost: honeypot triggered');
    return { ok: true };
  }

  // 3. Uzávěrka.
  if (!isRegistrationOpen(new Date(), getDeadline_())) {
    return { ok: false, code: 'CLOSED', message: MESSAGES.closed };
  }

  // 4. Validace a normalizace.
  const result = validateRegistration(body);
  if (!result.ok) {
    return { ok: false, code: 'VALIDATION', field: result.field, message: result.message };
  }

  // 5. Zámek.
  // PROČ: kontrola duplicity (čtení) a zápis jsou dva oddělené kroky.
  // Bez zámku by dva souběžné requesty se stejným číslem oba přečetly
  // „číslo tam není“ a oba by zapsaly (race condition). Kromě toho by dva
  // souběžné zápisy na getLastRow() + 1 mohly přepsat stejný řádek.
  // Script lock serializuje všechna spuštění skriptu bez ohledu na uživatele.
  // waitLock při timeoutu VYHAZUJE výjimku (nevrací false), proto try/catch.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_TIMEOUT_MS);
  } catch (err) {
    logError_('doPost: lock timeout', err);
    return { ok: false, code: 'SERVER_ERROR', message: MESSAGES.busy };
  }

  let count;
  try {
    // 6. Pod zámkem: duplicita + zápis.
    const sheet = getSheet_();
    const phoneCells = readPhoneCells_(sheet);

    if (isDuplicatePhone(phoneCells, result.value.phone)) {
      return { ok: false, code: 'DUPLICATE', message: MESSAGES.duplicate };
    }

    const timestamp = Utilities.formatDate(new Date(), TIME_ZONE, TIMESTAMP_FORMAT);
    appendRow_(sheet, buildRow(result.value, timestamp));

    // Dokumentace LockService: u spreadsheetů zavolat flush() PŘED uvolněním
    // zámku. Jinak by další request pod zámkem nemusel vidět právě zapsaný
    // řádek a duplicita by mohla proklouznout.
    SpreadsheetApp.flush();
    count = countFilled(phoneCells) + 1;
  } finally {
    // 7. Uvolnit zámek vždy, i při chybě nebo duplicitě.
    lock.releaseLock();
  }

  // 8. Cache počtu. Místo pouhého remove() rovnou uložíme nový počet:
  // tím je stará hodnota zneplatněná a zároveň další GET nemusí číst Sheet.
  // Chyba cache nesmí shodit už zapsanou registraci.
  try {
    CacheService.getScriptCache().put(COUNT_CACHE_KEY, String(count), COUNT_CACHE_SECONDS);
  } catch (err) {
    logError_('doPost: cache put', err);
  }

  return { ok: true, count: count };
}

/**
 * GET: počet přihlášených + jestli je registrace otevřená.
 * Cache 60 s přes CacheService, protože čtení Sheetu je pomalé (stovky ms).
 * CacheService je „best effort“: Google může záznam smazat dřív, pak se
 * počet prostě znovu načte ze Sheetu.
 */
function doGet() {
  try {
    const open = isRegistrationOpen(new Date(), getDeadline_());
    const cache = CacheService.getScriptCache();
    const cached = cache.get(COUNT_CACHE_KEY);
    let count = cached === null ? NaN : Number(cached);

    if (!isFinite(count)) {
      count = countFilled(readPhoneCells_(getSheet_()));
      cache.put(COUNT_CACHE_KEY, String(count), COUNT_CACHE_SECONDS);
    }

    return jsonResponse_({ ok: true, count: count, open: open });
  } catch (err) {
    logError_('doGet', err);
    return jsonResponse_({ ok: false, code: 'SERVER_ERROR', message: MESSAGES.serverError });
  }
}

// ---------------------------------------------------------------------------
// Práce se Sheetem a službami (netestováno ve Vitestu, ověř přes selfTest)
// ---------------------------------------------------------------------------

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" not found');
  return sheet;
}

/** Vrací 2D pole hodnot sloupce Telefon bez hlavičky (prázdné pole, když nejsou data). */
function readPhoneCells_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, PHONE_COLUMN, lastRow - 1, 1).getDisplayValues();
}

/**
 * Zapíše řádek na konec listu.
 * Dvě vrstvy s RŮZNÝMI rolemi (ověřeno selfTest() ve skutečném Sheetu):
 *   - apostrof (escapeForSheet): brání vzorcům (=1+1). Formát @ to NEumí.
 *   - textový formát @: brání automatickému převodu typů u hodnot, které
 *     apostrof nepokrývá nebo které by Sheets „pochopily“ jinak
 *     (bez formátu se -5 uložilo jako číslo; časové razítko by se převedlo
 *     na datum).
 * PROČ ne appendRow(): formát musí být nastavený DŘÍV, než se hodnota
 * zapíše, a appendRow to neumožní. Zápis na getLastRow() + 1 je bezpečný,
 * protože běží pod zámkem.
 */
function appendRow_(sheet, row) {
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, NUM_COLUMNS);
  range.setNumberFormat('@');
  range.setValues([row.map(escapeForSheet)]);
}

function getDeadline_() {
  const raw = PropertiesService.getScriptProperties().getProperty(DEADLINE_PROPERTY);
  if (raw !== null && raw !== '') {
    const parsed = parseDeadline(raw);
    if (parsed) return parsed;
    // Hodnotu property nelogujeme celou, stačí info, že je špatně.
    console.warn('Invalid ' + DEADLINE_PROPERTY + ' property, using default deadline');
  }
  return parseDeadline(DEFAULT_DEADLINE_ISO);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** Loguje jen místo a typ chyby (err.name), nikdy err.message, které může obsahovat data. */
function logError_(where, err) {
  console.error(where + ': ' + (err && err.name ? err.name : 'UnknownError'));
}

// ---------------------------------------------------------------------------
// Pomocné funkce pro ruční spuštění z editoru
// ---------------------------------------------------------------------------

/**
 * Jednorázové nastavení: zkontroluje hlavičku a nastaví sloupce A:F
 * na textový formát (@). Spusť jednou po vytvoření listu.
 */
function setupSheet() {
  const sheet = getSheet_();
  const header = sheet.getRange(1, 1, 1, NUM_COLUMNS).getDisplayValues()[0];
  const mismatch = EXPECTED_HEADER.some(function (h, i) {
    return String(header[i]).trim() !== h;
  });
  if (mismatch) {
    throw new Error(
      'Hlavička neodpovídá. Očekávám: ' + EXPECTED_HEADER.join(' | ') + ' / Je: ' + header.join(' | ')
    );
  }
  // Celé sloupce A:F (včetně budoucích řádků) jako text.
  sheet.getRange(1, 1, sheet.getMaxRows(), NUM_COLUMNS).setNumberFormat('@');
  sheet.setFrozenRows(1);
  console.log('setupSheet: OK, sloupce A:F mají textový formát.');
}

/**
 * Ověří formula injection a typy hodnot na DOČASNÉM listu a pak ho smaže.
 * Spusť v editoru (Spustit → selfTest) a podívej se do „Protokolu provádění“.
 * Pro každou hodnotu vypíše, co Sheets skutečně uložily:
 *   value   = getValue() (typ a hodnota)
 *   formula = getFormula() (neprázdné → uložilo se jako VZOREC = špatně)
 *   display = getDisplayValue() (co uvidíš v buňce)
 */
function selfTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = '_selfTest_' + Date.now();
  const sheet = ss.insertSheet(name);
  try {
    const inputs = ['=1+1', '+420777123456', '-5', '@SUM(1)', 'Jan Novák'];
    const variants = [
      { label: 'format @ + apostrof (produkční cesta)', format: true, escape: true },
      { label: 'jen format @', format: true, escape: false },
      { label: 'jen apostrof', format: false, escape: true },
      { label: 'nic (kontrola)', format: false, escape: false },
    ];

    let row = 1;
    const results = [];
    variants.forEach(function (v) {
      inputs.forEach(function (input) {
        const cell = sheet.getRange(row, 1);
        if (v.format) cell.setNumberFormat('@');
        cell.setValues([[v.escape ? escapeForSheet(input) : input]]);
        results.push({ variant: v.label, input: input, row: row });
        row++;
      });
    });
    SpreadsheetApp.flush();

    let productionOk = true;
    results.forEach(function (r) {
      const cell = sheet.getRange(r.row, 1);
      const value = cell.getValue();
      const formula = cell.getFormula();
      const display = cell.getDisplayValue();
      const ok = formula === '' && typeof value === 'string' && display === r.input;
      if (r.variant.indexOf('produkční') !== -1 && !ok) productionOk = false;
      console.log(
        (ok ? 'OK   ' : 'FAIL ') +
          '[' + r.variant + '] vstup=' + JSON.stringify(r.input) +
          ' value(' + typeof value + ')=' + JSON.stringify(value) +
          ' formula=' + JSON.stringify(formula) +
          ' display=' + JSON.stringify(display)
      );
    });
    console.log(
      productionOk
        ? 'VÝSLEDEK: produkční cesta ukládá všechny hodnoty jako text beze změny.'
        : 'VÝSLEDEK: produkční cesta NEFUNGUJE podle očekávání, pošli tento log.'
    );
  } finally {
    ss.deleteSheet(sheet);
  }
}

// ---------------------------------------------------------------------------
// Export pro Vitest (Node). V Apps Script runtime `module` neexistuje,
// typeof vrátí "undefined" a blok se přeskočí. typeof na nedeklarovaném
// identifikátoru nevyhazuje ReferenceError, takže je to bezpečné.
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizePhone: normalizePhone,
    parseDeadline: parseDeadline,
    isRegistrationOpen: isRegistrationOpen,
    isHoneypotFilled: isHoneypotFilled,
    validateRegistration: validateRegistration,
    escapeForSheet: escapeForSheet,
    buildRow: buildRow,
    parseBody: parseBody,
    isDuplicatePhone: isDuplicatePhone,
    countFilled: countFilled,
    DEFAULT_DEADLINE_ISO: DEFAULT_DEADLINE_ISO,
    MESSAGES: MESSAGES,
  };
}
