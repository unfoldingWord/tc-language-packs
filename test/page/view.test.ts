import { describe, expect, it } from "vitest";
import {
  askCountSuffix,
  bookExclusiveBytes,
  bookList,
  catalogProblemText,
  downloadErrorText,
  exportUnitsForWant,
  formatSize,
  groupCatalogUnits,
  GROUP_ORDER,
  installWant,
  listableLanguages,
  patchInfo,
  patchNoticeText,
  needsSizeWarning,
  requestErrorText,
  requestStateText,
  sharedSizeLine,
  transferName,
  unitKind,
  unitLabel,
  unitsFromCatalogs,
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

describe("installWant", () => {
  const catalog = {
    bookCodes: ["tit", "mat"],
    unitIds: [
      "book:tit",
      "book:mat",
      "obs",
      "art:ta:translate",
      "art:tw:kt",
      "map",
      "topics",
      "xmap",
      "xtopics",
      "aligned:other",
      "orig:tit",
      "lex:G0",
    ],
    hasAligned: true,
    sharedUnits: ["xmap", "map", "xtopics", "topics", "art:tw:kt", "art:ta:translate"],
  };

  it("whole language lists OBS and maps explicitly, not via defaults", () => {
    const want = installWant({ whole: true }, catalog);
    expect(want.defaults).toBe(false);
    expect(want.books).toEqual(["tit", "mat"]);
    expect(want.units).toEqual(
      expect.arrayContaining([
        "obs",
        "art:ta:translate",
        "art:tw:kt",
        "map",
        "topics",
        "xmap",
        "xtopics",
        "lex:G0",
      ]),
    );
    expect(want.units).not.toContain("book:tit");
    expect(want.units).not.toContain("aligned:other");
    expect(want.units).not.toContain("orig:tit");
    expect(want.aligned).toBe(true);
  });

  it("partial choice keeps shared units and optional extras", () => {
    const want = installWant(
      { books: ["tit"], units: ["obs"], aligned: false },
      catalog,
    );
    expect(want.defaults).toBe(false);
    expect(want.books).toEqual(["tit"]);
    expect(want.units).toEqual(
      expect.arrayContaining(["obs", "xmap", "art:tw:kt"]),
    );
    expect(want.aligned).toBeUndefined();
  });
});

describe("exportUnitsForWant", () => {
  it("names aligned units when the want asks for the phrase index", () => {
    expect(
      exportUnitsForWant(
        { units: ["obs", "map"], aligned: true },
        ["obs", "map", "aligned:a-c", "aligned:other"],
      ),
    ).toEqual(["obs", "map", "aligned:a-c", "aligned:other"]);
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

  it("names an OBS-only transfer from the unit id", () => {
    expect(
      transferName("en", { books: [], units: ["obs"] }, day),
    ).toBe("en-obs-2026-11-15.tcpack");
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

describe("requestErrorText", () => {
  it("explains bad language", () => {
    expect(requestErrorText("bad language")).toBe(
      "That is not a language code. Try one like es-419 or pt.",
    );
  });

  it("explains too many requests", () => {
    expect(requestErrorText("too many requests")).toBe(
      "Too many requests from here. Try again later.",
    );
  });

  it("explains check failed", () => {
    expect(requestErrorText("check failed")).toBe(
      "The check did not pass. Try again.",
    );
  });
});

describe("askCountSuffix", () => {
  it("is empty when the language is already available", () => {
    expect(askCountSuffix("available", 0)).toBe("");
    expect(askCountSuffix("available", 3)).toBe("");
  });

  it("is empty when the count is zero", () => {
    expect(askCountSuffix("try-later", 0)).toBe("");
  });

  it("shows the count otherwise", () => {
    expect(askCountSuffix("try-later", 1)).toBe(" · 1 ask");
    expect(askCountSuffix("preparing", 2)).toBe(" · 2 asks");
  });
});

describe("listableLanguages", () => {
  it("hides es when es-419 is present", () => {
    const listed = listableLanguages([
      { lang: "en" },
      { lang: "es" },
      { lang: "es-419" },
    ]);
    expect(listed.map((e) => e.lang)).toEqual(["en", "es-419"]);
  });

  it("drops catalogs whose code starts with zxx-", () => {
    const listed = listableLanguages([
      { lang: "en" },
      { lang: "zxx-obsimg" },
    ]);
    expect(listed.map((e) => e.lang)).toEqual(["en"]);
  });
});

describe("unitKind and unitLabel", () => {
  it("classifies known unit ids", () => {
    expect(unitKind("book:tit")).toBe("books");
    expect(unitKind("obs")).toBe("obs");
    expect(unitKind("art:ta:intro")).toBe("academy");
    expect(unitKind("art:tw:kt")).toBe("words");
    expect(unitKind("lex:G0")).toBe("lexicon");
    expect(unitKind("aligned:a-c")).toBe("aligned");
    expect(unitKind("map")).toBe("lang-map");
    expect(unitKind("xmap")).toBe("common");
    expect(unitKind("weird:thing")).toBe("other");
  });

  it("labels academy manuals in plain English", () => {
    expect(unitLabel("art:ta:translate")).toBe("Translation Manual");
  });
});

describe("unitsFromCatalogs and groupCatalogUnits", () => {
  const sample = [
    {
      name: "en",
      catalog: {
        units: [
          { id: "book:tit", segments: [0] },
          { id: "obs", segments: [1] },
          { id: "art:ta:translate", segments: [2] },
          { id: "art:ta:intro", segments: [3] },
          { id: "art:tw:kt", segments: [4] },
          { id: "aligned:other", segments: [5], optional: true },
          { id: "map", segments: [6] },
          { id: "topics", segments: [7] },
        ],
        segments: [
          { size: 1000 },
          { size: 2000 },
          { size: 3000 },
          { size: 4000 },
          { size: 5000 },
          { size: 6000 },
          { size: 7000 },
          { size: 8000 },
        ],
      },
    },
    {
      name: "common",
      catalog: {
        units: [
          { id: "orig:tit", segments: [0] },
          { id: "xmap", segments: [1] },
          { id: "xtopics", segments: [2] },
        ],
        segments: [{ size: 100 }, { size: 200 }, { size: 300 }],
      },
    },
  ];

  it("reads units and sizes from catalogs", () => {
    const units = unitsFromCatalogs(sample);
    expect(units.find((u) => u.id === "obs")).toEqual({
      id: "obs",
      catalog: "en",
      bytes: 2000,
      optional: false,
    });
  });

  it("groups in the catalog order and skips missing kinds", () => {
    const groups = groupCatalogUnits(unitsFromCatalogs(sample));
    expect(groups.map((g) => g.kind)).toEqual([
      "books",
      "obs",
      "academy",
      "words",
      "aligned",
      "lang-map",
      "common",
    ]);
    expect(groups.map((g) => g.kind)).not.toContain("lexicon");
    expect(GROUP_ORDER.indexOf("books")).toBeLessThan(
      GROUP_ORDER.indexOf("obs"),
    );
  });

  it("omits OBS when the language has none", () => {
    const noObs = [
      {
        name: "vi",
        catalog: {
          units: [
            { id: "book:mat", segments: [0] },
            { id: "map", segments: [1] },
            { id: "topics", segments: [2] },
            { id: "aligned:other", segments: [3], optional: true },
          ],
          segments: [
            { size: 10 },
            { size: 20 },
            { size: 30 },
            { size: 40 },
          ],
        },
      },
    ];
    const kinds = groupCatalogUnits(unitsFromCatalogs(noObs)).map((g) => g.kind);
    expect(kinds).not.toContain("obs");
    expect(kinds).not.toContain("academy");
    expect(kinds).toContain("books");
  });

  it("lists an unknown class under Other with its id and size", () => {
    const weird = [
      {
        name: "xx",
        catalog: {
          units: [{ id: "future:widget", segments: [0] }],
          segments: [{ size: 42 }],
        },
      },
    ];
    const groups = groupCatalogUnits(unitsFromCatalogs(weird));
    expect(groups).toEqual([
      {
        kind: "other",
        label: "Other",
        bytes: 42,
        optional: false,
        items: [
          {
            id: "future:widget",
            label: "future:widget",
            bytes: 42,
            optional: false,
            choosable: false,
          },
        ],
      },
    ]);
  });

  it("folds orig books into one Hebrew and Greek line", () => {
    const common = groupCatalogUnits(unitsFromCatalogs(sample)).find(
      (g) => g.kind === "common",
    );
    expect(common?.items[0]).toMatchObject({
      id: "orig",
      label: "Hebrew and Greek (MACULA v2)",
      bytes: 100,
    });
  });
});

describe("patch catalogs", () => {
  it("knows a patch by its source, not any -x- tag", () => {
    expect(patchInfo("hi-x-aquifer")).toEqual({ base: "hi", source: "aquifer", sourceName: "Aquifer" });
    expect(patchInfo("es-419-x-aquifer")?.base).toBe("es-419");
    expect(patchInfo("ar-x-strong")).toBeNull();
    expect(patchInfo("hi")).toBeNull();
  });

  it("says in words what a patch is", () => {
    const text = patchNoticeText({ base: "hi", sourceName: "Aquifer" });
    expect(text).toContain("patch, not a language");
    expect(text).toContain("hi wins");
  });
});
