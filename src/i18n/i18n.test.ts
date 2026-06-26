import { describe, expect, it } from "vitest";
import { en } from "./en";
import { localeDictionary, normalizeLocale, t } from "./index";
import { th } from "./th";

describe("i18n foundation", () => {
  it("keeps Thai and English key coverage identical", () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it("falls back to Thai for malformed locale values", () => {
    expect(normalizeLocale("de")).toBe("th");
    expect(normalizeLocale(null)).toBe("th");
  });

  it("translates the shared root labels", () => {
    expect(t("th", "menu.localPvp")).toBe("Local PvP");
    expect(t("en", "menu.continue")).toBe("Continue");
    expect(localeDictionary.en["phase.ACTION"]).toBe("ACTION");
  });
});
