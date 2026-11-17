import { describe, expect, it } from "vitest";
import {
  bookList,
  catalogProblemText,
  downloadErrorText,
  formatSize,
  needsSizeWarning,
  transferName,
} from "../../public/catalog/view.js";

describe("formatSize", () => {
  it("formats kilobytes with a 1024 base", () => {
    expect(formatSize(831488)).toBe("812 KB");
  });

  it("formats megabytes with one decimal", () => {
    expect(formatSize(1468006)).toBe("1.4 MB");
  });
});

describe("bookList", () => {
  it("returns only units whose key ends in /book:XXX", () => {
    const status = {
      units: [
        { key: "es-419/book:tit", bytes: 12000 },
        { key: "common/map", bytes: 4000 },
        { key: "es-419/art:tw:kt", bytes: 8000 },
      ],
    };
    expect(bookList(status)).toEqual([{ code: "tit", bytes: 12000 }]);
  });
});

describe("catalogProblemText", () => {
  it("explains a failed signature and that nothing was installed", () => {
    expect(catalogProblemText({ code: "E_SIGNATURE" })).toMatch(
      /signature did not check/i,
    );
    expect(catalogProblemText({ code: "E_SIGNATURE" })).toMatch(
      /nothing is installed/i,
    );
  });

  it("explains a missing catalog as not available right now", () => {
    expect(catalogProblemText({ status: 404 })).toMatch(
      /not available right now/i,
    );
  });
});

describe("transferName", () => {
  const day = new Date(Date.UTC(2026, 10, 15));

  it("names a single-book transfer with the book code", () => {
    expect(transferName("es-419", ["tit"], day)).toBe(
      "es-419-tit-2026-11-15.tcpack",
    );
  });

  it("names a multi-book transfer with the book count", () => {
    expect(transferName("es-419", ["mat", "mrk", "luk"], day)).toBe(
      "es-419-3-books-2026-11-15.tcpack",
    );
  });

  it("names a whole-language transfer as all", () => {
    expect(transferName("es-419", [], day)).toBe(
      "es-419-all-2026-11-15.tcpack",
    );
  });
});

describe("needsSizeWarning", () => {
  const limit = 200 * 1024 * 1024;

  it("is false at exactly 200 MiB", () => {
    expect(needsSizeWarning(limit)).toBe(false);
  });

  it("is true just over 200 MiB", () => {
    expect(needsSizeWarning(limit + 1)).toBe(true);
  });
});

describe("downloadErrorText", () => {
  it("mentions browser storage for QuotaExceededError", () => {
    expect(downloadErrorText({ name: "QuotaExceededError" })).toMatch(
      /browser storage/i,
    );
  });

  it("mentions the connection and that what is complete is kept for a failed fetch", () => {
    const text = downloadErrorText(new TypeError("Failed to fetch"));
    expect(text).toMatch(/connection/i);
    expect(text).toMatch(/what is complete is kept/i);
  });
});
