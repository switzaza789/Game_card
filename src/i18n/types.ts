export type Locale = "th" | "en";

export type TranslationKey =
  | "app.title"
  | "app.subtitle"
  | "menu.continue"
  | "menu.localPvp"
  | "menu.pveNormal"
  | "label.player1"
  | "label.player2"
  | "label.you"
  | "label.computer"
  | "label.turn"
  | "phase.READY"
  | "phase.DRAW"
  | "phase.SCORE"
  | "phase.ACTION"
  | "phase.END"
  | "locale.th"
  | "locale.en"
  | "selector.aria";

export type TranslationParams = Record<string, string | number>;
