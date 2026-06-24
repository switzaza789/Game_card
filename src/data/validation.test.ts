import { describe, expect, it } from "vitest";
import rawCardsSeed from "../../cards_seed.json";
import rawGameConfig from "../../game_config.json";
import { cardCatalog } from "./cardsSeed";
import { gameConfig } from "./gameConfig";
import { validateCardsSeed, validateGameConfig } from "./validation";

describe("data validation", () => {
  it("loads the game config with required prototype values", () => {
    expect(gameConfig.players).toBe(2);
    expect(gameConfig.deck_size).toBe(24);
    expect(gameConfig.starting_hand).toBe(5);
    expect(gameConfig.animal_zone_slots).toBe(3);
    expect(gameConfig.target_score).toBe(15);
    expect(gameConfig.max_turns_per_player).toBe(12);
    expect(gameConfig.turn_phases).toEqual(["READY", "DRAW", "SCORE", "ACTION", "END"]);
    expect(gameConfig.first_player_draws_on_turn_1).toBe(false);
  });

  it("loads exactly 24 unique cards with the required category counts", () => {
    expect(cardCatalog.cards).toHaveLength(24);
    expect(cardCatalog.counts).toEqual({
      Animal: 8,
      Support: 6,
      Weakness: 5,
      Special: 5
    });

    const cardIds = new Set(cardCatalog.cards.map((card) => card.card_id));
    expect(cardIds.size).toBe(24);
  });

  it("rejects duplicate card ids", () => {
    const duplicate = [
      ...(rawCardsSeed as unknown[]),
      { ...(rawCardsSeed as Array<Record<string, unknown>>)[0] }
    ];

    expect(() => validateCardsSeed(duplicate)).toThrow(/Duplicate card_id/);
  });

  it("rejects unknown card categories", () => {
    const invalid = (rawCardsSeed as Array<Record<string, unknown>>).map((card, index) =>
      index === 0 ? { ...card, category: "Rarity" } : card
    );

    expect(() => validateCardsSeed(invalid)).toThrow(/Unknown card category/);
  });

  it("rejects game config values outside the approved prototype scope", () => {
    expect(() =>
      validateGameConfig({
        ...(rawGameConfig as Record<string, unknown>),
        players: 4
      })
    ).toThrow(/players must be 2/);
  });
});

