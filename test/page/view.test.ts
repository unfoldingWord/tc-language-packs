import { describe, expect, it } from "vitest";
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

describe("bookExclusiveBytes", () => {
  it("is the book plan minus what every book shares", () => {
    expect(bookExclusiveBytes(2_305_820, 2_253_048)).toBe(52_772);
  });

  it("never goes below zero", () => {
    expect(bookExclusiveBytes(100, 200)).toBe(0);
  });
});

describe("sharedSizeLine", () => {
  it("names the shared download and formats its size", () => {
    expect(sharedSizeLine(2_253_048)).toBe(
      "Shared by every book (downloaded once): 2.1 MB",
    );
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

describe("requestStateText", () => {
  it("explains available", () => {
    expect(requestStateText("available")).toBe(
      "This language is already here. Pick it in the list above.",
    );
  });

  it("explains preparing", () => {
    expect(requestStateText("preparing")).toBe(
      "It is being prepared now. Come back in a few hours.",
    );
  });

  it("explains no-content", () => {
    expect(requestStateText("no-content")).toBe(
      "Door43 has no resources in this language yet, so there is nothing to prepare. Your request is counted.",
    );
  });

  it("explains try-later", () => {
    expect(requestStateText("try-later")).toBe(
      "Asked for. It cannot be prepared right now; it will be tried again later. Your request is counted.",
    );
  });

  it("explains waiting-format-3", () => {
    expect(requestStateText("waiting-format-3")).toBe(
      "This language exists in the older format; the new one is still pending. Your request is counted.",
    );
  });
});
