import {
  createClient,
  httpSource,
  indexedDbStore,
  memoryStore,
  planInstall,
  verifyCatalogFile,
} from "../format-3/try/language-pack-client.js";
import {
  bookExclusiveBytes,
  bookList,
  catalogProblemText,
  downloadErrorText,
  formatSize,
  needsSizeWarning,
  requestStateText,
  sharedSizeLine,
  transferName,
} from "./view.js";

const SERVER =
  "https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev";
// The staging publisher's public key (language-pack-v3/keys/78d2e6299a2de4d0.pub).
const KEY_ID = "78d2e6299a2de4d0";
const KEY_HEX =
  "c2057cec32b948452849e7fcba6af323961a091ea82645eb297bb368e1c8d911";
const DB = "tc-language-packs-catalog";
const SHARED_UNITS = [
  "art:tw:kt",
  "art:tw:names",
  "art:tw:other",
  "art:ta:translate",
];

const BOOKS = [
  "gen",
  "exo",
  "lev",
  "num",
  "deu",
  "jos",
  "jdg",
  "rut",
  "1sa",
  "2sa",
  "1ki",
  "2ki",
  "1ch",
  "2ch",
  "ezr",
  "neh",
  "est",
  "job",
  "psa",
  "pro",
  "ecc",
  "sng",
  "isa",
  "jer",
  "lam",
  "ezk",
  "dan",
  "hos",
  "jol",
  "amo",
  "oba",
  "jon",
  "mic",
  "nam",
  "hab",
  "zep",
  "hag",
  "zec",
  "mal",
  "mat",
  "mrk",
  "luk",
  "jhn",
  "act",
  "rom",
  "1co",
  "2co",
  "gal",
  "eph",
  "php",
  "col",
  "1th",
  "2th",
  "1ti",
  "2ti",
  "tit",
  "phm",
  "heb",
  "jas",
  "1pe",
  "2pe",
  "1jn",
  "2jn",
  "3jn",
  "jud",
  "rev",
];

const NAMES = {
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

const $ = (id) => document.getElementById(id);

const trust = {
  trustedKeys: {
    [KEY_ID]: Uint8Array.from(KEY_HEX.match(/../g), (p) => parseInt(p, 16)),
  },
};

let store;
try {
  store = await indexedDbStore({ name: DB });
} catch {
  store = memoryStore();
}
const client = createClient({
  store,
  source: httpSource({ base: SERVER }),
  trust,
});

/** @type {{ lang: string; size: number; uploaded: string }[]} */
let languages = [];
/** @type {string | null} */
let openLang = null;
/** @type {{ code: string; bytes: number }[]} */
let openBooks = [];
/** @type {{ catalogs: object[]; state: object; have: Set<string>; sharedBytes: number } | null} */
let openPlan = null;
/** @type {number} */
let downloadGen = 0;

const WANT_BASE = { defaults: true, units: SHARED_UNITS };

/**
 * @param {string[]} books
 * @returns {number}
 */
function planBytes(books) {
  if (!openPlan || books.length === 0) return 0;
  return planInstall(
    openPlan.catalogs,
    openPlan.state,
    { ...WANT_BASE, books },
    openPlan.have,
  ).bytes;
}

function setStatus(text) {
  $("list-status").textContent = text;
}

function setDownloadStatus(text) {
  $("download-status").textContent = text;
}

function renderList(filter = "") {
  const q = filter.trim().toLowerCase();
  const list = $("lang-list");
  const matched = languages.filter(
    (entry) => !q || entry.lang.toLowerCase().includes(q),
  );
  list.replaceChildren();
  if (matched.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = languages.length
      ? "No language matches that search."
      : "No format 3 languages are listed yet.";
    list.append(empty);
    return;
  }
  for (const entry of matched) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.lang = entry.lang;
    if (entry.lang === openLang) btn.setAttribute("aria-current", "true");
    const name = document.createElement("span");
    name.textContent = entry.lang;
    btn.append(name);
    btn.addEventListener("click", () => {
      void openLanguage(entry.lang);
    });
    li.append(btn);
    list.append(li);
  }
}

function clearDetail() {
  $("detail").hidden = true;
  $("detail-title").textContent = "";
  $("detail-meta").replaceChildren();
  $("resource-list").replaceChildren();
  $("book-list").replaceChildren();
  $("detail-problem").textContent = "";
  $("detail-problem").hidden = true;
  $("download-panel").hidden = true;
  $("download").disabled = true;
  $("whole-language").checked = false;
  $("shared-size").hidden = true;
  $("shared-size").textContent = "";
  $("choice-size").textContent = "Selected: 0 KB";
  $("progress-wrap").hidden = true;
  $("progress-bar").style.width = "0%";
  setDownloadStatus("");
  openBooks = [];
  openPlan = null;
}

function showProblem(err) {
  $("detail").hidden = false;
  $("detail-problem").hidden = false;
  $("detail-problem").textContent = catalogProblemText(err);
  $("resource-list").replaceChildren();
  $("book-list").replaceChildren();
  $("detail-meta").replaceChildren();
  $("download-panel").hidden = true;
  $("download").disabled = true;
}

function selectedBooks() {
  if ($("whole-language").checked) {
    return openBooks.map((book) => book.code);
  }
  return [...$("book-list").querySelectorAll('input[type="checkbox"]:checked')]
    .map((input) => input.value)
    .filter(Boolean);
}

function selectedBytes() {
  return planBytes(selectedBooks());
}

function updateChoice() {
  const books = selectedBooks();
  const bytes = selectedBytes();
  const whole = $("whole-language").checked;
  $("choice-size").textContent = whole
    ? `Whole language: ${formatSize(bytes)}`
    : `Selected: ${formatSize(bytes)}${books.length ? ` · ${books.length} book${books.length === 1 ? "" : "s"}` : ""}`;
  $("download").disabled = books.length === 0;
  for (const input of $("book-list").querySelectorAll(
    'input[type="checkbox"]',
  )) {
    input.disabled = whole;
  }
}

function renderBookChoices(books) {
  openBooks = books;
  const sharedBytes = openPlan?.sharedBytes ?? 0;
  const shared = $("shared-size");
  if (openPlan) {
    shared.hidden = false;
    shared.textContent = sharedSizeLine(sharedBytes);
  } else {
    shared.hidden = true;
    shared.textContent = "";
  }
  const bookUl = $("book-list");
  bookUl.replaceChildren();
  for (const book of books) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    label.className = "book";
    const pick = document.createElement("span");
    pick.className = "pick";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = book.code;
    input.addEventListener("change", updateChoice);
    const title = document.createElement("span");
    title.textContent = NAMES[book.code] ?? book.code;
    pick.append(input, title);
    const bytes = document.createElement("span");
    bytes.className = "bytes";
    bytes.textContent = formatSize(book.bytes);
    label.append(pick, bytes);
    li.append(label);
    bookUl.append(li);
  }
  $("whole-language").checked = false;
  updateChoice();
}

/**
 * @param {Uint8Array | ArrayBuffer | number[]} bytes
 * @returns {string}
 */
function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verified catalog for `lang` plus the catalogs it `requires` (by name and id).
 * Sizes use an empty `have`: they describe the transfer file to share, not what
 * is left to download on this device.
 *
 * @param {string} lang
 * @returns {Promise<{ catalogs: object[]; state: object; have: Set<string>; sharedBytes: number }>}
 */
async function loadInstallPlan(lang) {
  const state = await store.getState();
  const published = state.published?.[lang];
  if (!published) {
    throw new Error(`No published catalog for ${lang}.`);
  }

  const catalogs = [];
  const seen = new Set();

  /**
   * @param {string | undefined} id
   * @returns {Promise<object | null>}
   */
  async function addCatalog(id) {
    if (!id || seen.has(id)) return null;
    const file = await store.get(id);
    if (!file) return null;
    const verified = await verifyCatalogFile(file, trust, {});
    seen.add(id);
    catalogs.push(verified);
    return verified;
  }

  const open = await addCatalog(published.id);
  if (!open) {
    throw new Error(`Catalog file missing for ${lang}.`);
  }
  for (const req of open.catalog.requires ?? []) {
    const name = req[0];
    const idFromReq =
      req[2] != null ? bytesToHex(req[2]) : undefined;
    const idFromName = state.published?.[name]?.id;
    const added = await addCatalog(idFromReq);
    if (!added) await addCatalog(idFromName);
  }

  const have = new Set();
  const sharedBytes = planInstall(
    catalogs,
    state,
    { ...WANT_BASE, books: [] },
    have,
  ).bytes;
  return { catalogs, state, have, sharedBytes };
}

/**
 * @param {string} lang
 */
async function openLanguage(lang) {
  openLang = lang;
  downloadGen += 1;
  renderList($("search").value);
  clearDetail();
  $("detail").hidden = false;
  $("detail-title").textContent = lang;
  $("detail-problem").hidden = true;
  $("detail-problem").textContent = "";
  setStatus(`Reading the catalog for ${lang}…`);

  try {
    await client.refresh(lang);
    if (openLang !== lang) return;
    const status = await client.status(lang);
    if (openLang !== lang) return;
    const reader = await client.open(lang);
    if (openLang !== lang) return;
    openPlan = await loadInstallPlan(lang);
    if (openLang !== lang) return;
    const resources = reader.resources?.() ?? [];
    const books = bookList(status)
      .map((book) => {
        const withShared = planInstall(
          openPlan.catalogs,
          openPlan.state,
          { ...WANT_BASE, books: [book.code] },
          openPlan.have,
        ).bytes;
        return {
          code: book.code,
          bytes: bookExclusiveBytes(withShared, openPlan.sharedBytes),
        };
      })
      .sort((a, b) => BOOKS.indexOf(a.code) - BOOKS.indexOf(b.code));
    const revision = status.published?.revision ?? status.active?.revision;

    const meta = $("detail-meta");
    meta.replaceChildren();
    const revLine = document.createElement("p");
    if (revision != null) {
      revLine.append("Catalog revision ");
      const rev = document.createElement("strong");
      rev.className = "tab";
      rev.textContent = String(revision);
      revLine.append(rev, ".");
    } else {
      revLine.textContent = "Catalog revision is not available.";
    }
    const sigLine = document.createElement("p");
    const sig = document.createElement("strong");
    sig.textContent = "Signature checked.";
    sigLine.append(sig);
    meta.append(revLine, sigLine);

    const resourceList = $("resource-list");
    resourceList.replaceChildren();
    if (resources.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No resources listed in this catalog.";
      resourceList.append(li);
    } else {
      for (const resource of resources) {
        const li = document.createElement("li");
        const title = document.createElement("span");
        title.textContent = resource.title || resource.key;
        const subject = document.createElement("span");
        subject.className = "soft";
        subject.textContent = resource.subject || resource.key;
        li.append(title, subject);
        resourceList.append(li);
      }
    }

    $("download-panel").hidden = false;
    renderBookChoices(books);
    setStatus(
      `${books.length} books in ${lang}${revision != null ? `, revision ${revision}` : ""}. Signature checked.`,
    );
  } catch (err) {
    if (openLang !== lang) return;
    showProblem(err);
    setStatus(catalogProblemText(err));
  }
}

function offerBlob(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadTransfer() {
  const lang = openLang;
  if (!lang) return;
  const whole = $("whole-language").checked;
  const books = selectedBooks();
  if (books.length === 0) return;

  const bytes = selectedBytes();
  if (
    needsSizeWarning(bytes) &&
    !confirm(
      `This choice is about ${formatSize(bytes)}. Building the transfer file may use a lot of memory on this device. Continue?`,
    )
  ) {
    return;
  }

  const gen = ++downloadGen;
  const nameBooks = whole ? [] : books;
  const filename = transferName(lang, nameBooks, new Date());
  $("download").disabled = true;
  $("progress-wrap").hidden = false;
  $("progress-bar").style.width = "0%";
  setDownloadStatus("Downloading…");

  try {
    await client.install(
      lang,
      { books, defaults: true, units: SHARED_UNITS },
      {
        onProgress: (p) => {
          if (gen !== downloadGen || openLang !== lang) return;
          $("progress-bar").style.width =
            (p.total ? Math.round((p.done / p.total) * 100) : 0) + "%";
          setDownloadStatus(
            `Downloading: ${p.done} of ${p.total} pieces · ${formatSize(p.bytes ?? 0)}`,
          );
        },
      },
    );
    if (gen !== downloadGen || openLang !== lang) return;

    setDownloadStatus("Building the transfer file…");
    const bytesOut = await client.exportTransfer({
      lang,
      mode: "full",
      books,
    });
    if (gen !== downloadGen || openLang !== lang) return;

    offerBlob(bytesOut, filename);
    $("progress-bar").style.width = "100%";
    setDownloadStatus(`Ready: ${filename}`);
    setStatus(`Transfer file ready for ${lang}.`);
  } catch (err) {
    if (gen !== downloadGen || openLang !== lang) return;
    setDownloadStatus(downloadErrorText(err));
    setStatus(downloadErrorText(err));
  } finally {
    if (gen === downloadGen && openLang === lang) {
      updateChoice();
    }
  }
}

async function loadLanguages() {
  setStatus("Loading the language list…");
  clearDetail();
  try {
    const res = await fetch("/api/languages");
    if (!res.ok) {
      throw new Error(`The language list could not be loaded (${res.status}).`);
    }
    const body = await res.json();
    languages = Array.isArray(body.languages) ? body.languages : [];
    renderList($("search").value);
    setStatus(
      languages.length
        ? `${languages.length} format 3 languages.`
        : "No format 3 languages are listed yet.",
    );
  } catch (err) {
    languages = [];
    renderList();
    setStatus(err?.message ?? String(err));
  }
}

$("search").addEventListener("input", (event) => {
  renderList(event.target.value);
});
$("whole-language").addEventListener("change", updateChoice);
$("download").addEventListener("click", () => {
  void downloadTransfer();
});

function turnstileSiteKey() {
  const meta = document.querySelector('meta[name="turnstile-site-key"]');
  return meta?.getAttribute("content")?.trim() || "";
}

/** @type {string | null} */
let turnstileToken = null;
/** @type {string | null} */
let turnstileWidgetId = null;

function setAskStatus(text) {
  $("ask-status").textContent = text;
}

function setAskedStatus(text) {
  $("asked-status").textContent = text;
}

function renderAskedList(entries) {
  const list = $("asked-list");
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Nobody has asked for a language yet.";
    list.append(empty);
    return;
  }
  for (const entry of entries) {
    const li = document.createElement("li");
    const lang = document.createElement("strong");
    lang.textContent = entry.lang;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${entry.count} ask${entry.count === 1 ? "" : "s"}`;
    const state = document.createElement("span");
    state.className = "state";
    state.textContent = requestStateText(entry.state);
    li.append(lang, count, state);
    list.append(li);
  }
}

async function loadAsked() {
  setAskedStatus("Loading who asked…");
  try {
    const res = await fetch("/api/requests");
    if (!res.ok) {
      throw new Error(`The request list could not be loaded (${res.status}).`);
    }
    const body = await res.json();
    const entries = Array.isArray(body.requests) ? body.requests : [];
    renderAskedList(entries);
    setAskedStatus(
      entries.length
        ? `${entries.length} language${entries.length === 1 ? "" : "s"} asked for.`
        : "Nobody has asked for a language yet.",
    );
  } catch (err) {
    renderAskedList([]);
    setAskedStatus(err?.message ?? String(err));
  }
}

function resetTurnstile() {
  turnstileToken = null;
  const api = globalThis.turnstile;
  if (api && turnstileWidgetId != null) {
    try {
      api.reset(turnstileWidgetId);
    } catch {
      /* widget may not be ready */
    }
  }
}

function mountTurnstile() {
  const key = turnstileSiteKey();
  const host = $("ask-turnstile");
  if (!key) {
    setAskStatus("Turnstile is not configured on this page.");
    return;
  }
  const api = globalThis.turnstile;
  if (!api || typeof api.render !== "function") {
    window.setTimeout(mountTurnstile, 200);
    return;
  }
  if (turnstileWidgetId != null) return;
  turnstileWidgetId = api.render(host, {
    sitekey: key,
    callback: (token) => {
      turnstileToken = token;
    },
    "expired-callback": () => {
      turnstileToken = null;
    },
    "error-callback": () => {
      turnstileToken = null;
    },
  });
}

async function submitAsk(event) {
  event.preventDefault();
  const lang = $("ask-lang").value.trim();
  const reason = $("ask-reason").value.trim();
  if (!lang) {
    setAskStatus("Enter a language code.");
    return;
  }
  if (!turnstileToken) {
    setAskStatus("Complete the check before asking.");
    return;
  }

  $("ask-submit").disabled = true;
  setAskStatus("Sending your request…");
  try {
    const body = { lang, token: turnstileToken };
    if (reason) body.reason = reason;
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err =
        typeof data.error === "string" ? data.error : `Request failed (${res.status}).`;
      setAskStatus(err);
      return;
    }
    const state = typeof data.state === "string" ? data.state : "try-later";
    const count =
      typeof data.count === "number" ? ` · ${data.count} ask${data.count === 1 ? "" : "s"}` : "";
    setAskStatus(`${requestStateText(state, data.reason)}${count}`);
    await loadAsked();
  } catch (err) {
    setAskStatus(err?.message ?? String(err));
  } finally {
    $("ask-submit").disabled = false;
    resetTurnstile();
  }
}

$("ask-form").addEventListener("submit", (event) => {
  void submitAsk(event);
});

mountTurnstile();
await Promise.all([loadLanguages(), loadAsked()]);
