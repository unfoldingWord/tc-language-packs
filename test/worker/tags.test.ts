import { describe, expect, it } from "vitest";
import { normalizeTag } from "../../src/worker/tags";

describe("normalizeTag", () => {
  it("aliases ES to es-419", () => {
    expect(normalizeTag("ES")).toBe("es-419");
  });

  it("trims and lowercases es-419", () => {
    expect(normalizeTag(" es-419 ")).toBe("es-419");
  });

  it("aliases pt to pt-br", () => {
    expect(normalizeTag("pt")).toBe("pt-br");
  });

  it("aliases zh to zh-hans", () => {
    expect(normalizeTag("zh")).toBe("zh-hans");
  });

  it("aliases ar to ar-x-strong", () => {
    expect(normalizeTag("ar")).toBe("ar-x-strong");
  });

  it("keeps en", () => {
    expect(normalizeTag("en")).toBe("en");
  });

  it("rejects underscore form es_419", () => {
    expect(normalizeTag("es_419")).toBeNull();
  });

  it("rejects common", () => {
    expect(normalizeTag("common")).toBeNull();
  });

  it("rejects empty", () => {
    expect(normalizeTag("")).toBeNull();
  });

  it("rejects overly long tags", () => {
    expect(normalizeTag("a".repeat(40))).toBeNull();
  });
});
