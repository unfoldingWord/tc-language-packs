/** Pure helpers for the catalog page (sizes, book list, error text). */

const KiB = 1024;
const MiB = KiB * 1024;
const GiB = MiB * 1024;
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
