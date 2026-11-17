import {
  createClient,
  httpSource,
  indexedDbStore,
  memoryStore,
} from "../format-3/try/language-pack-client.js";
import {
  bookList,
  catalogProblemText,
  downloadErrorText,
  formatSize,
  needsSizeWarning,
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
/** @type {number} */
let downloadGen = 0;

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
  $("choice-size").textContent = "Selected: 0 KB";
  $("progress-wrap").hidden = true;
  $("progress-bar").style.width = "0%";
  setDownloadStatus("");
  openBooks = [];
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
  if ($("whole-language").checked) {
    return openBooks.reduce((sum, book) => sum + book.bytes, 0);
  }
  const chosen = new Set(selectedBooks());
  return openBooks
    .filter((book) => chosen.has(book.code))
    .reduce((sum, book) => sum + book.bytes, 0);
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
    const resources = reader.resources?.() ?? [];
    const books = bookList(status).sort(
      (a, b) => BOOKS.indexOf(a.code) - BOOKS.indexOf(b.code),
    );
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

await loadLanguages();
