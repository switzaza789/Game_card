import type { Locale } from "../i18n/types";

export type ArtworkEntry = {
  th: string | null;
  en: string | null;
};

const artworkMap: Record<string, ArtworkEntry> = {
  A001: { th: "/Card/A001-th.png", en: "/Card/A001-en.png" },
  A002: { th: "/Card/A002-th.png", en: "/Card/A002-en.png" },
  A003: { th: "/Card/A003-th.png", en: "/Card/A003-en.png" },
  A004: { th: "/Card/A004-th.png", en: "/Card/A004-en.png" },
  A005: { th: "/Card/A005-th.png", en: "/Card/A005-en.png" },
  A006: { th: "/Card/A006-th.png", en: "/Card/A006-en.png" },
  A007: { th: "/Card/A007-th.png", en: "/Card/A007-en.png" },
  A008: { th: "/Card/A008-th.png", en: "/Card/A008-en.png" },
  S001: { th: "/Card/S001-th.png", en: "/Card/S001-en.png" },
  S002: { th: "/Card/S002-th.png", en: "/Card/S002-en.png" },
  S003: { th: "/Card/S003-th.png", en: "/Card/S003-en.png" },
  S004: { th: "/Card/S004-th.png", en: "/Card/S004-en.png" },
  S005: { th: "/Card/S005-th.png", en: "/Card/S005-en.png" },
  S006: { th: "/Card/S006-th.png", en: "/Card/S006-en.png" },
  W001: { th: "/Card/W001-th.png", en: "/Card/W001-en.png" },
  W002: { th: "/Card/W002-th.png", en: "/Card/W002-en.png" },
  W003: { th: "/Card/W003-th.png", en: "/Card/W003-en.png" },
  W004: { th: "/Card/W004-th.png", en: "/Card/W004-en.png" },
  W005: { th: "/Card/W005-th.png", en: "/Card/W005-en.png" },
  X001: { th: "/Card/X001-th.png", en: "/Card/X001-en.png" },
  X002: { th: "/Card/X002-th.png", en: "/Card/X002-en.png" },
  X003: { th: "/Card/X003-th.png", en: "/Card/X003-en.png" },
  X004: { th: "/Card/X004-th.png", en: "/Card/X004-en.png" },
  X005: { th: "/Card/X005-th.png", en: "/Card/X005-en.png" },
};

export const ARTWORK_PLACEHOLDER = "/Card/card-placeholder.png";

export function getCardArtwork(cardId: string, locale: Locale): string {
  const entry = artworkMap[cardId];
  if (!entry) {
    return ARTWORK_PLACEHOLDER;
  }
  const requested = entry[locale];
  if (requested) {
    return requested;
  }
  const alternate = locale === "th" ? entry.en : entry.th;
  if (alternate) {
    return alternate;
  }
  return ARTWORK_PLACEHOLDER;
}

export function getArtworkAltText(cardId: string, locale: Locale, cardName?: string): string {
  if (locale === "th") {
    return `ภาพการ์ด ${cardId}${cardName ? ` ${cardName}` : ""}`;
  }
  return `Card artwork ${cardId}${cardName ? ` ${cardName}` : ""}`;
}

export function getCardIds(): string[] {
  return Object.keys(artworkMap);
}

export function getArtworkEntry(cardId: string): ArtworkEntry | undefined {
  return artworkMap[cardId];
}
