import { describe, it, expect } from "vitest";
import { getCardArtwork, getCardArtworkVariant, resolveCardArtwork, ARTWORK_PLACEHOLDER } from "./cardArtwork";

describe("cardArtwork level variants", () => {
  it("base Thai artwork resolves", () => {
    const path = getCardArtwork("A001", "th");
    expect(path).toMatch(/^\/Card\/A001-th\.\w+$/);
  });

  it("base English artwork resolves", () => {
    const path = getCardArtwork("A001", "en");
    expect(path).toMatch(/^\/Card\/A001-en\.\w+$/);
  });

  it("optional Level 2 Thai artwork path is supported", () => {
    const path = getCardArtworkVariant("A001", "th", 2);
    expect(path).toBe("/Card/A001-lv2-th.png");
  });

  it("optional Level 2 English artwork path is supported", () => {
    const path = getCardArtworkVariant("A001", "en", 2);
    expect(path).toBe("/Card/A001-lv2-en.png");
  });

  it("optional Level 3 Thai artwork path is supported", () => {
    const path = getCardArtworkVariant("A001", "th", 3);
    expect(path).toBe("/Card/A001-lv3-th.png");
  });

  it("optional Level 3 English artwork path is supported", () => {
    const path = getCardArtworkVariant("A001", "en", 3);
    expect(path).toBe("/Card/A001-lv3-en.png");
  });

  it("missing Level artwork resolves via resolveCardArtwork to level-specific path (not placeholder)", () => {
    const path = resolveCardArtwork("A001", "th", 2);
    expect(path).toBe("/Card/A001-lv2-th.png");
  });

  it("resolveCardArtwork without level falls back to base localized artwork", () => {
    const path = resolveCardArtwork("A001", "th");
    expect(path).toMatch(/^\/Card\/A001-th\.\w+$/);
  });

  it("generic fallback still works for unknown card IDs", () => {
    expect(getCardArtwork("UNKNOWN", "th")).toBe(ARTWORK_PLACEHOLDER);
    expect(resolveCardArtwork("UNKNOWN", "en")).toBe(ARTWORK_PLACEHOLDER);
  });

  it("existing callers without Level remain compatible", () => {
    const path = getCardArtwork("A001", "th");
    expect(path).not.toBe(ARTWORK_PLACEHOLDER);
    expect(path).toMatch(/^\/Card\/A001-th\.\w+$/);
  });

  it("no broken asset URL is returned for known cards", () => {
    const path = getCardArtwork("A001", "th");
    expect(path).toBeTruthy();
    expect(path.startsWith("/Card/")).toBe(true);
  });

  it("no cross-locale fallback occurs unexpectedly for variant paths", () => {
    const thPath = getCardArtworkVariant("A001", "th", 2);
    const enPath = getCardArtworkVariant("A001", "en", 2);
    expect(thPath).not.toContain("-en-");
    expect(enPath).not.toContain("-th-");
  });
});
