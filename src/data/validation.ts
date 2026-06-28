import type { CardCategory, CardDefinition, GameConfig, Phase, ValidationResult } from "../types/game";

const categories: CardCategory[] = ["Animal", "Support", "Weakness", "Special"];
const phases: Phase[] = ["READY", "DRAW", "SCORE", "ACTION", "END"];

type CardCounts = Record<CardCategory, number>;

export type CardCatalog = {
  cards: CardDefinition[];
  counts: CardCounts;
};

export function validateGameConfig(input: unknown): GameConfig {
  const config = asRecord(input, "game_config");

  assertExact(config.game_title, "Animal Score Card Game", "game_title");
  assertExact(config.version, "Prototype v0.3", "version");
  assertExact(config.players, 2, "players");
  assertExact(config.deck_size, 24, "deck_size");
  assertExact(config.starting_hand, 5, "starting_hand");
  assertExact(config.hand_limit, 7, "hand_limit");
  assertExact(config.animal_zone_slots, 3, "animal_zone_slots");
  assertTargetScore(config.target_score, "target_score");
  assertExact(config.max_turns_per_player, 12, "max_turns_per_player");
  assertExact(config.level_min, 1, "level_min");
  assertExact(config.level_max, 3, "level_max");
  assertExact(config.first_player_draws_on_turn_1, false, "first_player_draws_on_turn_1");
  assertExact(config.guaranteed_animal_in_starting_hand, true, "guaranteed_animal_in_starting_hand");
  assertExact(config.starting_mulligan_max, 2, "starting_mulligan_max");
  assertExact(config.animal_actions_per_turn, 1, "animal_actions_per_turn");
  assertExact(config.utility_actions_per_turn, 1, "utility_actions_per_turn");
  assertExact(config.recycle_per_turn, 1, "recycle_per_turn");
  assertExact(config.recycle_allowed_on_first_turn, false, "recycle_allowed_on_first_turn");
  assertExact(config.score_phase_before_action_phase, true, "score_phase_before_action_phase");
  assertExact(config.new_animal_scores_same_turn, false, "new_animal_scores_same_turn");
  assertStringArray(config.win_tiebreakers, "win_tiebreakers");

  if (!Array.isArray(config.turn_phases) || config.turn_phases.join("|") !== phases.join("|")) {
    throw new Error("turn_phases must be READY, DRAW, SCORE, ACTION, END");
  }

  return config as GameConfig;
}

export function validateCardsSeed(input: unknown): CardCatalog {
  if (!Array.isArray(input)) {
    throw new Error("cards_seed must be an array");
  }

  const cards = input.map(validateCardDefinition);
  const ids = new Set<string>();
  const logicKeys = new Set<string>();
  const counts: CardCounts = {
    Animal: 0,
    Support: 0,
    Weakness: 0,
    Special: 0
  };

  for (const card of cards) {
    if (ids.has(card.card_id)) {
      throw new Error(`Duplicate card_id: ${card.card_id}`);
    }
    ids.add(card.card_id);

    if (logicKeys.has(card.logic_key)) {
      throw new Error(`Duplicate logic_key: ${card.logic_key}`);
    }
    logicKeys.add(card.logic_key);
    counts[card.category] += 1;
  }

  assertExact(cards.length, 24, "cards_seed length");
  assertExact(counts.Animal, 8, "Animal count");
  assertExact(counts.Support, 6, "Support count");
  assertExact(counts.Weakness, 5, "Weakness count");
  assertExact(counts.Special, 5, "Special count");

  const copyTotal = cards.reduce((total, card) => total + card.max_copies, 0);
  assertExact(copyTotal, 24, "total max_copies");

  return { cards, counts };
}

export function toValidationResult(task: () => void): ValidationResult {
  try {
    task();
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : "Unknown validation error"]
    };
  }
}

function validateCardDefinition(input: unknown): CardDefinition {
  const card = asRecord(input, "card");
  const category = asCategory(card.category);

  assertString(card.card_id, "card_id");
  assertString(card.name_th, "name_th");
  assertString(card.name_en, "name_en");
  assertString(card.subtype, "subtype");
  assertString(card.role, "role");
  assertLevelField(card.base_level, "base_level");
  assertLevelField(card.base_score, "base_score");
  assertString(card.favorite_item, "favorite_item");
  assertString(card.direct_weakness, "direct_weakness");
  assertString(card.timing, "timing");
  assertString(card.primary_effect, "primary_effect");
  assertString(card.secondary_effect, "secondary_effect");
  assertString(card.duration, "duration");
  assertString(card.target, "target");
  assertString(card.logic_key, "logic_key");
  assertExact(card.max_copies, 1, "max_copies");

  const effectModel = asRecord(card.effect_model, "effect_model");
  assertExact(effectModel.logic_key, card.logic_key, "effect_model.logic_key");
  assertString(effectModel.timing, "effect_model.timing");
  assertString(effectModel.target, "effect_model.target");
  assertString(effectModel.duration, "effect_model.duration");

  return {
    ...(card as Omit<CardDefinition, "category" | "effect_model">),
    category,
    effect_model: effectModel as CardDefinition["effect_model"]
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asCategory(value: unknown): CardCategory {
  if (typeof value !== "string" || !categories.includes(value as CardCategory)) {
    throw new Error(`Unknown card category: ${String(value)}`);
  }
  return value as CardCategory;
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
}

function assertTargetScore(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function assertLevelField(value: unknown, label: string): asserts value is number | "" {
  if (value !== "" && typeof value !== "number") {
    throw new Error(`${label} must be a number or empty string`);
  }
}

function assertExact<T>(value: unknown, expected: T, label: string): asserts value is T {
  if (value !== expected) {
    throw new Error(`${label} must be ${String(expected)}`);
  }
}

