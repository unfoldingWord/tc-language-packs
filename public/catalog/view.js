/** Pure helpers for the catalog page (sizes, unit groups, error text). */

const KiB = 1024;
const MiB = KiB * 1024;
const GiB = MiB * 1024;
const SIZE_WARN = 200 * MiB;
const BOOK_KEY = /\/book:([0-9a-z]{3})$/;
const BOOK_ID = /^book:([0-9a-z]{3})$/;

/** Units the client always installs with any transfer (defaults minus OBS). */
export const CORE_UNITS = ["xmap", "map", "xtopics", "topics"];

const ACADEMY_ORDER = [
  "art:ta:intro",
  "art:ta:process",
  "art:ta:translate",
  "art:ta:checking",
];
const WORDS_ORDER = ["art:tw:kt", "art:tw:names", "art:tw:other"];

/** @type {const} */
export const GROUP_ORDER = [
  "books",
  "obs",
  "academy",
  "words",
  "lexicon",
  "aligned",
  "lang-map",
  "common",
  "other",
];

const GROUP_LABELS = {
  books: "Books",
  obs: "Open Bible Stories",
  academy: "Translation Academy",
  words: "Translation Words",
  lexicon: "Lexicon",
  aligned: "Phrase index",
  "lang-map": "Language map and topics",
  common: "Shared by every language (from the common catalog)",
  other: "Other",
};

const UNIT_LABELS = {
  obs: "Open Bible Stories",
  "art:ta:intro": "Introduction",
  "art:ta:process": "Process Manual",
  "art:ta:translate": "Translation Manual",
  "art:ta:checking": "Checking Manual",
  "art:tw:kt": "Key terms",
  "art:tw:names": "Names",
  "art:tw:other": "Other terms",
  map: "Language map",
  topics: "Topics",
  xmap: "Whole-Bible map",
  xtopics: "Topics",
};

const BOOK_NAMES = {
  gen: "Genesis",
  exo: "Exodus",
  lev: "Leviticus",
  num: "Numbers",
  deu: "Deuteronomy",
  jos: "Joshua",
  jdg: "Judges",
  rut: "Ruth",
  "1sa": "1 Samuel",
  "2sa": "2 Samuel",
  "1ki": "1 Kings",
  "2ki": "2 Kings",
  "1ch": "1 Chronicles",
  "2ch": "2 Chronicles",
  ezr: "Ezra",
  neh: "Nehemiah",
  est: "Esther",
  job: "Job",
  psa: "Psalms",
  pro: "Proverbs",
  ecc: "Ecclesiastes",
  sng: "Song of Songs",
  isa: "Isaiah",
  jer: "Jeremiah",
  lam: "Lamentations",
  ezk: "Ezekiel",
  dan: "Daniel",
  hos: "Hosea",
  jol: "Joel",
  amo: "Amos",
  oba: "Obadiah",
  jon: "Jonah",
  mic: "Micah",
  nam: "Nahum",
  hab: "Habakkuk",
  zep: "Zephaniah",
  hag: "Haggai",
  zec: "Zechariah",
  mal: "Malachi",
  mat: "Matthew",
  mrk: "Mark",
  luk: "Luke",
  jhn: "John",
  act: "Acts",
  rom: "Romans",
  "1co": "1 Corinthians",
  "2co": "2 Corinthians",
  gal: "Galatians",
  eph: "Ephesians",
  php: "Philippians",
  col: "Colossians",
  "1th": "1 Thessalonians",
  "2th": "2 Thessalonians",
  "1ti": "1 Timothy",
  "2ti": "2 Timothy",
  tit: "Titus",
  phm: "Philemon",
  heb: "Hebrews",
  jas: "James",
  "1pe": "1 Peter",
  "2pe": "2 Peter",
  "1jn": "1 John",
  "2jn": "2 John",
  "3jn": "3 John",
  jud: "Jude",
  rev: "Revelation",
};

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (bytes >= GiB) return `${(bytes / GiB).toFixed(1)} GB`;
  if (bytes >= MiB) return `${(bytes / MiB).toFixed(1)} MB`;
  return `${Math.round(bytes / KiB)} KB`;
}

/**
 * @param {{ units?: { key: string; bytes: number }[] }} status
 * @returns {{ code: string; bytes: number }[]}
 */
export function bookList(status) {
  const units = status?.units ?? [];
  const books = [];
  for (const unit of units) {
    const match = BOOK_KEY.exec(unit.key);
    if (!match) continue;
    books.push({ code: match[1], bytes: unit.bytes });
  }
  return books;
}

/**
 * @param {string} id
 * @returns {string}
 */
export function unitKind(id) {
  if (BOOK_ID.test(id)) return "books";
  if (id === "obs") return "obs";
  if (id.startsWith("art:ta:")) return "academy";
  if (id.startsWith("art:tw:")) return "words";
  if (id.startsWith("lex:")) return "lexicon";
  if (id.startsWith("aligned:")) return "aligned";
  if (id === "map" || id === "topics") return "lang-map";
  if (id.startsWith("orig:") || id === "xmap" || id === "xtopics") return "common";
  return "other";
}

/**
 * @param {string} kind
 * @returns {string}
 */
export function groupLabel(kind) {
  return GROUP_LABELS[kind] ?? kind;
}

/**
 * @param {string} id
 * @returns {string}
 */
export function unitLabel(id) {
  if (UNIT_LABELS[id]) return UNIT_LABELS[id];
  const book = BOOK_ID.exec(id);
  if (book) return BOOK_NAMES[book[1]] ?? book[1];
  if (id.startsWith("orig:")) return `Original ${id.slice(5)}`;
  if (id.startsWith("lex:")) return `Lexicon ${id.slice(4)}`;
  if (id.startsWith("aligned:")) return `Phrases ${id.slice(8)}`;
  return id;
}

/**
 * Units and sizes from verified catalogs (language + requires).
 * @param {{ name?: string; catalog?: { units?: { id: string; segments?: number[]; optional?: boolean }[]; segments?: { size?: number }[] } }[]} catalogs
 * @returns {{ id: string; catalog: string; bytes: number; optional: boolean }[]}
 */
export function unitsFromCatalogs(catalogs) {
  const out = [];
  for (const cat of catalogs ?? []) {
    const name = typeof cat.name === "string" ? cat.name : "";
    const units = cat.catalog?.units ?? [];
    const segments = cat.catalog?.segments ?? [];
    for (const unit of units) {
      const bytes = (unit.segments ?? []).reduce(
        (sum, idx) => sum + (segments[idx]?.size ?? 0),
        0,
      );
      out.push({
        id: unit.id,
        catalog: name,
        bytes,
        optional: unit.optional === true,
      });
    }
  }
  return out;
}

/**
 * @param {{ id: string }} unit
 * @returns {boolean}
 */
function isChoosableUnit(unit) {
  const kind = unitKind(unit.id);
  return (
    kind === "books" ||
    kind === "obs" ||
    kind === "academy" ||
    kind === "lexicon" ||
    kind === "aligned"
  );
}

/**
 * Group catalog units for the language panel. Empty kinds are omitted.
 * Common-catalog units are listed under "common"; unknown ids under "other".
 *
 * @param {{ id: string; catalog: string; bytes: number; optional?: boolean }[]} units
 * @returns {{ kind: string; label: string; bytes: number; optional: boolean; items: { id: string; label: string; bytes: number; optional: boolean; choosable: boolean }[] }[]}
 */
export function groupCatalogUnits(units) {
  /** @type {Map<string, { id: string; label: string; bytes: number; optional: boolean; choosable: boolean }[]>} */
  const buckets = new Map();
  for (const kind of GROUP_ORDER) buckets.set(kind, []);

  const origItems = [];
  for (const unit of units ?? []) {
    const kind = unitKind(unit.id);
    if (kind === "common" && unit.id.startsWith("orig:")) {
      origItems.push(unit);
      continue;
    }
    const items = buckets.get(kind) ?? buckets.get("other");
    items.push({
      id: unit.id,
      label: unitLabel(unit.id),
      bytes: unit.bytes,
      optional: unit.optional === true,
      choosable: isChoosableUnit(unit),
    });
  }

  if (origItems.length) {
    const bytes = origItems.reduce((sum, u) => sum + u.bytes, 0);
    buckets.get("common").unshift({
      id: "orig",
      label: "Hebrew and Greek (MACULA v2)",
      bytes,
      optional: false,
      choosable: false,
    });
  }

  const sortIds = (kind, items) => {
    if (kind === "academy") {
      items.sort(
        (a, b) =>
          ACADEMY_ORDER.indexOf(a.id) - ACADEMY_ORDER.indexOf(b.id) ||
          a.id.localeCompare(b.id),
      );
    } else if (kind === "words") {
      items.sort(
        (a, b) =>
          WORDS_ORDER.indexOf(a.id) - WORDS_ORDER.indexOf(b.id) ||
          a.id.localeCompare(b.id),
      );
    } else if (kind === "common") {
      const order = ["orig", "xmap", "xtopics"];
      items.sort(
        (a, b) =>
          order.indexOf(a.id) - order.indexOf(b.id) || a.id.localeCompare(b.id),
      );
    } else if (kind === "lang-map") {
      const order = ["map", "topics"];
      items.sort(
        (a, b) =>
          order.indexOf(a.id) - order.indexOf(b.id) || a.id.localeCompare(b.id),
      );
    } else {
      items.sort((a, b) => a.id.localeCompare(b.id));
    }
  };

  const groups = [];
  for (const kind of GROUP_ORDER) {
    const items = buckets.get(kind) ?? [];
    if (items.length === 0) continue;
    sortIds(kind, items);
    const bytes = items.reduce((sum, item) => sum + item.bytes, 0);
    groups.push({
      kind,
      label: groupLabel(kind),
      bytes,
      optional: kind === "aligned",
      items,
    });
  }
  return groups;
}

/**
 * Article / words units that every book pulls in (for the shared-size line).
 * @param {{ id: string }[]} units
 * @returns {string[]}
 */
export function sharedArticleUnits(units) {
  const ids = [];
  for (const unit of units ?? []) {
    if (unit.id.startsWith("art:tw:") || unit.id === "art:ta:translate") {
      ids.push(unit.id);
    }
  }
  return ids.sort();
}

/**
 * Drop `zxx-*` catalogs (no linguistic content, such as `zxx-obsimg`, the story pictures: the page names it
 * in its text) and hide `es` when `es-419` is listed
 * (staging serves the same catalog; header lang is es-419).
 * @param {{ lang: string }[]} languages
 * @returns {{ lang: string }[]}
 */
export function listableLanguages(languages) {
  const list = languages ?? [];
  const hasEs419 = list.some((entry) => entry.lang === "es-419");
  return list.filter((entry) => {
    if (typeof entry.lang !== "string") return false;
    if (entry.lang.startsWith("zxx-")) return false;
    if (entry.lang === "es" && hasEs419) return false;
    return true;
  });
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function catalogProblemText(err) {
  const problem = err && typeof err === "object" ? err : {};
  if (problem.code === "E_SIGNATURE") {
    return "The publisher signature did not check. Nothing is installed.";
  }
  if (problem.status === 404) {
    return "This language is not available right now.";
  }
  const detail =
    typeof problem.message === "string" && problem.message
      ? problem.message
      : typeof err === "string"
        ? err
        : "Something went wrong while reading the catalog.";
  return detail;
}

/**
 * Want for `planInstall` / `client.install`. Whole language lists every
 * catalog unit explicitly (including OBS and maps), so the size estimate
 * matches the transfer; `orig:*` still arrives through needs. Aligned
 * phrase-index units use the `aligned` flag.
 *
 * @param {{
 *   whole?: boolean;
 *   books?: string[];
 *   units?: string[];
 *   aligned?: boolean;
 * }} choice
 * @param {{
 *   bookCodes: string[];
 *   unitIds: string[];
 *   hasAligned: boolean;
 *   sharedUnits?: string[];
 * }} catalog
 * @returns {{
 *   defaults: boolean;
 *   books: string[];
 *   units: string[];
 *   aligned?: boolean | string[];
 * }}
 */
export function installWant(choice, catalog) {
  if (choice.whole) {
    return {
      defaults: false,
      books: [...catalog.bookCodes],
      units: catalog.unitIds.filter(
        (id) =>
          !id.startsWith("book:") &&
          !id.startsWith("aligned:") &&
          !id.startsWith("orig:"),
      ),
      ...(catalog.hasAligned ? { aligned: true } : {}),
    };
  }
  const shared = catalog.sharedUnits ?? [];
  return {
    defaults: false,
    books: choice.books ?? [],
    units: [...new Set([...shared, ...(choice.units ?? [])])],
    ...(choice.aligned ? { aligned: true } : {}),
  };
}

/**
 * Unit ids to pass to `exportTransfer` for the same want (phrase-index
 * units must be named; export has no `aligned` flag).
 *
 * @param {{ units: string[]; aligned?: boolean | string[] }} want
 * @param {string[]} unitIds
 * @returns {string[]}
 */
export function exportUnitsForWant(want, unitIds) {
  const aligned =
    want.aligned === true
      ? unitIds.filter((id) => id.startsWith("aligned:"))
      : Array.isArray(want.aligned)
        ? want.aligned.map((g) => `aligned:${g}`)
        : [];
  return [...new Set([...want.units, ...aligned])];
}

/**
 * @param {string} lang
 * @param {{ books?: string[]; units?: string[]; whole?: boolean }} selection
 * @param {Date} date
 * @returns {string}
 */
export function transferName(lang, selection, date) {
  const books = Array.isArray(selection)
    ? selection
    : (selection?.books ?? []);
  const units = Array.isArray(selection) ? [] : (selection?.units ?? []);
  const whole = Array.isArray(selection) ? false : selection?.whole === true;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const day = `${y}-${m}-${d}`;
  if (whole || (books.length === 0 && units.length === 0)) {
    return `${lang}-all-${day}.tcpack`;
  }
  if (books.length === 1 && units.length === 0) {
    return `${lang}-${books[0]}-${day}.tcpack`;
  }
  if (books.length === 0 && units.length === 1) {
    const tag = units[0].replace(/:/g, "-");
    return `${lang}-${tag}-${day}.tcpack`;
  }
  if (books.length > 1 && units.length === 0) {
    return `${lang}-${books.length}-books-${day}.tcpack`;
  }
  const parts = books.length + units.length;
  return `${lang}-${parts}-parts-${day}.tcpack`;
}

/**
 * @param {number} bytes
 * @returns {boolean}
 */
export function needsSizeWarning(bytes) {
  return bytes > SIZE_WARN;
}

/**
 * Bytes unique to one book once the shared install plan is subtracted.
 * @param {number} bookPlanBytes
 * @param {number} sharedBytes
 * @returns {number}
 */
export function bookExclusiveBytes(bookPlanBytes, sharedBytes) {
  return Math.max(0, bookPlanBytes - sharedBytes);
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function sharedSizeLine(bytes) {
  return `Shared by every book (downloaded once): ${formatSize(bytes)}`;
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function downloadErrorText(err) {
  const problem = err && typeof err === "object" ? err : {};
  const name = typeof problem.name === "string" ? problem.name : "";
  const message =
    typeof problem.message === "string"
      ? problem.message
      : typeof err === "string"
        ? err
        : "";

  if (
    name === "QuotaExceededError" ||
    /quotaexceeded/i.test(name) ||
    /quota/i.test(message)
  ) {
    return "Browser storage is full, so the download could not finish. Free some space and try again. What is complete is kept.";
  }

  if (
    name === "TypeError" ||
    /failed to fetch/i.test(message) ||
    /network/i.test(message) ||
    problem.code === "E_NETWORK"
  ) {
    return "The connection dropped before the download finished. What is complete is kept; try again.";
  }

  const detail = message || "Something went wrong while building the transfer file.";
  return `${detail} What is complete is kept; try again.`;
}

/**
 * @typedef {"available" | "preparing" | "no-content" | "try-later" | "waiting-format-3"} RequestState
 */

/**
 * Plain words for a language-request answer. `reason` is accepted for the
 * call site but never shown (personal data stays off the page).
 * @param {RequestState | string} state
 * @param {string} [reason]
 * @returns {string}
 */
export function requestStateText(state, reason) {
  void reason;
  switch (state) {
    case "available":
      return "This language is already here. Pick it in the list above.";
    case "preparing":
      return "It is being prepared now. Come back in a few hours.";
    case "no-content":
      return "Door43 has no resources in this language yet, so there is nothing to prepare. Your request is counted.";
    case "try-later":
      return "Asked for. It cannot be prepared right now; it will be tried again later. Your request is counted.";
    case "waiting-format-3":
      return "This language exists in the older format; the new one is still pending. Your request is counted.";
    default:
      return "Asked for. It cannot be prepared right now; it will be tried again later. Your request is counted.";
  }
}

/**
 * Plain words for Worker request errors (never show the raw code).
 * @param {unknown} error
 * @returns {string}
 */
export function requestErrorText(error) {
  const code = typeof error === "string" ? error : "";
  switch (code) {
    case "bad language":
      return "That is not a language code. Try one like es-419 or pt.";
    case "bad request":
      return "That request could not be read. Check the language code and try again.";
    case "check failed":
      return "The check did not pass. Try again.";
    case "too many requests":
      return "Too many requests from here. Try again later.";
    default:
      return code || "Something went wrong while sending your request. Try again.";
  }
}

/**
 * Suffix with the ask count, omitted when the language is already available
 * or the count is zero.
 * @param {string} state
 * @param {number} [count]
 * @returns {string}
 */
export function askCountSuffix(state, count) {
  if (state === "available") return "";
  if (typeof count !== "number" || count <= 0) return "";
  return ` · ${count} ask${count === 1 ? "" : "s"}`;
}
