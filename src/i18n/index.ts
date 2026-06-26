import { en } from "./en";
import { th } from "./th";
import type { Locale, TranslationKey, TranslationParams } from "./types";
export { getLocalizedCard, getCardText, cardTexts } from "./cards";
export type { CardText } from "./cards";

export type { Locale, TranslationKey, TranslationParams } from "./types";

export const LOCALE_STORAGE_KEY = "animal_score_locale";

export const localeDictionary = { th, en } satisfies Record<Locale, Record<TranslationKey, string>>;

export function normalizeLocale(value: unknown): Locale {
  return value === "en" ? "en" : "th";
}

export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "th";
  return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
}

export function setStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function t(locale: Locale, key: TranslationKey, params?: TranslationParams): string {
  const template = localeDictionary[locale][key] ?? localeDictionary.th[key];
  return interpolate(template, params);
}

export function localeOptions(): Locale[] {
  return ["th", "en"];
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}
