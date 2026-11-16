import { describe, expect, it } from "vitest";
import { bookList, catalogProblemText, formatSize } from "../../public/catalog/view.js";

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
