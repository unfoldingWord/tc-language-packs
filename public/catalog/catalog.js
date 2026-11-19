import {
  createClient,
  httpSource,
  indexedDbStore,
  memoryStore,
  planInstall,
  verifyCatalogFile,
} from "../format-3/try/language-pack-client.js";
import {
  askCountSuffix,
  bookExclusiveBytes,
  bookList,
  catalogProblemText,
  CORE_UNITS,
  downloadErrorText,
  exportUnitsForWant,
  formatSize,
  groupCatalogUnits,
  installWant,
  listableLanguages,
  needsSizeWarning,
  patchInfo,
  patchNoticeText,
  requestErrorText,
  requestStateText,
  sharedArticleUnits,
  sharedSizeLine,
  transferName,
  unitsFromCatalogs,
} from "./view.js";

const SERVER =
  "https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev";
// The staging publisher's public key (language-pack-v3/keys/78d2e6299a2de4d0.pub).
const KEY_ID = "78d2e6299a2de4d0";
const KEY_HEX =
  "c2057cec32b948452849e7fcba6af323961a091ea82645eb297bb368e1c8d911";
const DB = "tc-language-packs-catalog";

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
/** @type {string[]} */
let openUnitIds = [];
/** @type {string[]} */
let openLexIds = [];
/** @type {boolean} */
let openHasAligned = false;
/** @type {{ catalogs: object[]; state: object; have: Set<string>; sharedBytes: number; sharedUnits: string[] } | null} */
let openPlan = null;
/** @type {number} */
let downloadGen = 0;

/**
 * @param {{ books?: string[]; units?: string[]; aligned?: boolean; whole?: boolean }} choice
 * @returns {object}
 */
function wantFor(choice) {
  return installWant(choice, {
    bookCodes: openBooks.map((book) => book.code),
    unitIds: openUnitIds,
    hasAligned: openHasAligned,
    sharedUnits: openPlan?.sharedUnits ?? [],
  });
}

/**
 * @param {string[]} books
 * @param {string[]} units
 * @param {boolean} aligned
 * @returns {number}
 */
function planBytes(books, units, aligned) {
  if (!openPlan) return 0;
  if (books.length === 0 && units.length === 0 && !aligned) return 0;
  return planInstall(
    openPlan.catalogs,
    openPlan.state,
    wantFor({ books, units, aligned }),
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
  const visible = listableLanguages(languages);
  const matched = visible.filter(
    (entry) => !q || entry.lang.toLowerCase().includes(q),
  );
  list.replaceChildren();
  if (matched.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = visible.length
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
    const patch = patchInfo(entry.lang);
    if (patch) name.textContent = `${entry.lang} · patch of ${patch.base}`;
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
  $("unit-groups").replaceChildren();
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
  openUnitIds = [];
  openLexIds = [];
  openHasAligned = false;
  openPlan = null;
}

function showProblem(err) {
  $("detail").hidden = false;
  $("detail-problem").hidden = false;
  $("detail-problem").textContent = catalogProblemText(err);
  $("resource-list").replaceChildren();
  $("unit-groups").replaceChildren();
  $("detail-meta").replaceChildren();
  $("download-panel").hidden = true;
  $("download").disabled = true;
}

function selectedBooks() {
  if ($("whole-language").checked) {
    return openBooks.map((book) => book.code);
  }
  return [...$("unit-groups").querySelectorAll('input[data-kind="book"]:checked')]
    .map((input) => input.value)
    .filter(Boolean);
}

function selectedExtraUnits() {
  if ($("whole-language").checked) {
    return openUnitIds.filter(
      (id) =>
        id === "obs" ||
        id.startsWith("art:ta:") ||
        id.startsWith("lex:"),
    );
  }
  const units = [];
  for (const input of $("unit-groups").querySelectorAll(
    'input[data-kind="unit"]:checked',
  )) {
    units.push(input.value);
  }
  if (
    $("unit-groups").querySelector('input[data-kind="lexicon"]:checked')
  ) {
    units.push(...openLexIds);
  }
  return [...new Set(units)];
}

function selectedAligned() {
  if ($("whole-language").checked) return openHasAligned;
  return Boolean(
    $("unit-groups").querySelector('input[data-kind="aligned"]:checked'),
  );
}

function selectedBytes() {
  if ($("whole-language").checked) {
    if (!openPlan) return 0;
    return planInstall(
      openPlan.catalogs,
      openPlan.state,
      wantFor({ whole: true }),
      openPlan.have,
    ).bytes;
  }
  return planBytes(selectedBooks(), selectedExtraUnits(), selectedAligned());
}

function updateChoice() {
  const books = selectedBooks();
  const units = selectedExtraUnits();
  const aligned = selectedAligned();
  const bytes = selectedBytes();
  const whole = $("whole-language").checked;
  const parts = books.length + units.length + (aligned ? 1 : 0);
  $("choice-size").textContent = whole
    ? `Whole language: ${formatSize(bytes)}`
    : `Selected: ${formatSize(bytes)}${parts ? ` · ${parts} part${parts === 1 ? "" : "s"}` : ""}`;
  $("download").disabled = !whole && books.length === 0 && units.length === 0 && !aligned;
  for (const input of $("unit-groups").querySelectorAll(
    'input[type="checkbox"]',
  )) {
    input.disabled = whole;
  }
}

/**
 * @param {{ kind: string; label: string; bytes: number; optional: boolean; items: { id: string; label: string; bytes: number; optional: boolean; choosable: boolean }[] }[]} groups
 * @param {{ code: string; bytes: number }[]} books
 */
function renderUnitGroups(groups, books) {
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

  const root = $("unit-groups");
  root.replaceChildren();

  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "unit-group";
    section.dataset.kind = group.kind;

    const heading = document.createElement("h4");
    heading.className = "unit-group-title";
    const title = document.createElement("span");
    title.textContent = group.optional
      ? `${group.label} (optional)`
      : group.label;
    const size = document.createElement("span");
    size.className = "bytes";
    size.textContent = formatSize(group.bytes);
    heading.append(title, size);
    section.append(heading);

    if (group.kind === "books") {
      const ul = document.createElement("ul");
      ul.className = "books";
      for (const book of books) {
        const li = document.createElement("li");
        const label = document.createElement("label");
        label.className = "book";
        const pick = document.createElement("span");
        pick.className = "pick";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = book.code;
        input.dataset.kind = "book";
        input.addEventListener("change", updateChoice);
        const name = document.createElement("span");
        name.textContent =
          group.items.find((item) => item.id === `book:${book.code}`)?.label ??
          book.code;
        pick.append(input, name);
        const bytes = document.createElement("span");
        bytes.className = "bytes";
        bytes.textContent = formatSize(book.bytes);
        label.append(pick, bytes);
        li.append(label);
        ul.append(li);
      }
      section.append(ul);
    } else if (group.kind === "lexicon") {
      const label = document.createElement("label");
      label.className = "unit-pick";
      const pick = document.createElement("span");
      pick.className = "pick";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.kind = "lexicon";
      input.value = "lexicon";
      input.addEventListener("change", updateChoice);
      const name = document.createElement("span");
      name.textContent = "Lexicon";
      pick.append(input, name);
      const bytes = document.createElement("span");
      bytes.className = "bytes";
      bytes.textContent = formatSize(group.bytes);
      label.append(pick, bytes);
      section.append(label);
      const ul = document.createElement("ul");
      ul.className = "unit-items soft-list";
      for (const item of group.items) {
        const li = document.createElement("li");
        const left = document.createElement("span");
        left.textContent = item.label;
        const right = document.createElement("span");
        right.className = "bytes";
        right.textContent = formatSize(item.bytes);
        li.append(left, right);
        ul.append(li);
      }
      section.append(ul);
    } else if (group.kind === "aligned") {
      const label = document.createElement("label");
      label.className = "unit-pick";
      const pick = document.createElement("span");
      pick.className = "pick";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.kind = "aligned";
      input.value = "aligned";
      input.addEventListener("change", updateChoice);
      const name = document.createElement("span");
      name.textContent = "Phrase index";
      pick.append(input, name);
      const bytes = document.createElement("span");
      bytes.className = "bytes";
      bytes.textContent = formatSize(group.bytes);
      label.append(pick, bytes);
      section.append(label);
    } else if (
      group.kind === "obs" ||
      group.kind === "academy"
    ) {
      const ul = document.createElement("ul");
      ul.className = "books";
      for (const item of group.items) {
        const li = document.createElement("li");
        const label = document.createElement("label");
        label.className = "book";
        const pick = document.createElement("span");
        pick.className = "pick";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = item.id;
        input.dataset.kind = "unit";
        input.addEventListener("change", updateChoice);
        const name = document.createElement("span");
        name.textContent = item.label;
        pick.append(input, name);
        const bytes = document.createElement("span");
        bytes.className = "bytes";
        bytes.textContent = formatSize(item.bytes);
        label.append(pick, bytes);
        li.append(label);
        ul.append(li);
      }
      section.append(ul);
    } else {
      const ul = document.createElement("ul");
      ul.className = "unit-items";
      for (const item of group.items) {
        const li = document.createElement("li");
        const left = document.createElement("span");
        left.textContent = item.label;
        const right = document.createElement("span");
        right.className = "bytes";
        right.textContent = formatSize(item.bytes);
        li.append(left, right);
        ul.append(li);
      }
      section.append(ul);
    }

    root.append(section);
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
 * @returns {Promise<{ catalogs: object[]; state: object; have: Set<string>; sharedBytes: number; sharedUnits: string[] }>}
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
    const idFromReq = req[2] != null ? bytesToHex(req[2]) : undefined;
    const idFromName = state.published?.[name]?.id;
    const added = await addCatalog(idFromReq);
    if (!added) await addCatalog(idFromName);
  }

  const catalogUnits = unitsFromCatalogs(catalogs);
  const sharedUnits = [
    ...CORE_UNITS,
    ...sharedArticleUnits(catalogUnits),
  ];
  const have = new Set();
  const sharedBytes = planInstall(
    catalogs,
    state,
    { defaults: false, books: [], units: sharedUnits },
    have,
  ).bytes;
  return { catalogs, state, have, sharedBytes, sharedUnits };
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

    const catalogUnits = unitsFromCatalogs(openPlan.catalogs);
    openUnitIds = catalogUnits.map((unit) => unit.id);
    openLexIds = catalogUnits
      .filter((unit) => unit.id.startsWith("lex:"))
      .map((unit) => unit.id);
    openHasAligned = catalogUnits.some((unit) =>
      unit.id.startsWith("aligned:"),
    );

    const resources = reader.resources?.() ?? [];
    const books = bookList(status)
      .map((book) => {
        const withShared = planInstall(
          openPlan.catalogs,
          openPlan.state,
          wantFor({ books: [book.code], units: [] }),
          openPlan.have,
        ).bytes;
        return {
          code: book.code,
          bytes: bookExclusiveBytes(withShared, openPlan.sharedBytes),
        };
      })
      .sort((a, b) => BOOKS.indexOf(a.code) - BOOKS.indexOf(b.code));

    const groups = groupCatalogUnits(catalogUnits);
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
    const patch = patchInfo(lang);
    if (patch) {
      const note = document.createElement("p");
      note.textContent = patchNoticeText(patch);
      meta.append(note);
    }

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
    renderUnitGroups(groups, books);
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
  const units = selectedExtraUnits();
  const aligned = selectedAligned();
  if (!whole && books.length === 0 && units.length === 0 && !aligned) return;

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
  const want = whole
    ? wantFor({ whole: true })
    : wantFor({ books, units, aligned });
  const filename = transferName(
    lang,
    {
      books: whole ? [] : books,
      units: whole ? [] : units,
      whole,
    },
    new Date(),
  );
  $("download").disabled = true;
  $("progress-wrap").hidden = false;
  $("progress-bar").style.width = "0%";
  setDownloadStatus("Downloading…");

  try {
    await client.install(lang, want, {
      onProgress: (p) => {
        if (gen !== downloadGen || openLang !== lang) return;
        $("progress-bar").style.width =
          (p.total ? Math.round((p.done / p.total) * 100) : 0) + "%";
        setDownloadStatus(
          `Downloading: ${p.done} of ${p.total} pieces · ${formatSize(p.bytes ?? 0)}`,
        );
      },
    });
    if (gen !== downloadGen || openLang !== lang) return;

    setDownloadStatus("Building the transfer file…");
    // Same want as the size estimate / install: list books and units
    // explicitly (phrase-index units must be named; export has no `aligned`).
    const bytesOut = await client.exportTransfer({
      lang,
      mode: "full",
      books: want.books,
      units: exportUnitsForWant(want, openUnitIds),
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
    const visible = listableLanguages(languages);
    renderList($("search").value);
    setStatus(
      visible.length
        ? `${visible.length} format 3 languages.`
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
/** @type {number} */
let turnstileStarted = 0;

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
  if (!turnstileStarted) turnstileStarted = Date.now();
  const api = globalThis.turnstile;
  if (!api || typeof api.render !== "function") {
    if (Date.now() - turnstileStarted > 10_000) {
      setAskStatus(
        "The check could not load. Reload the page and try again.",
      );
      return;
    }
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
      setAskStatus(requestErrorText(err));
      return;
    }
    const state = typeof data.state === "string" ? data.state : "try-later";
    const count = typeof data.count === "number" ? data.count : 0;
    setAskStatus(
      `${requestStateText(state, data.reason)}${askCountSuffix(state, count)}`,
    );
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
