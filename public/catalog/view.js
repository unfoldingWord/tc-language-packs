/** Pure helpers for the catalog page (sizes, book list, error text). */

const KiB = 1024;
const MiB = KiB * 1024;
const GiB = MiB * 1024;
const SIZE_WARN = 200 * MiB;
const BOOK_KEY = /\/book:([0-9a-z]{3})$/;

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
 * @param {string} lang
 * @param {string[]} books
 * @param {Date} date
 * @returns {string}
 */
export function transferName(lang, books, date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const day = `${y}-${m}-${d}`;
  if (books.length === 0) return `${lang}-all-${day}.tcpack`;
  if (books.length === 1) return `${lang}-${books[0]}-${day}.tcpack`;
  return `${lang}-${books.length}-books-${day}.tcpack`;
}

/**
 * @param {number} bytes
 * @returns {boolean}
 */
export function needsSizeWarning(bytes) {
  return bytes > SIZE_WARN;
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
