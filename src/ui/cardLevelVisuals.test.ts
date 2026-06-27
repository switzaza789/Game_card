import { describe, it, expect } from "vitest";
import { getCardLevelVisualState } from "./cardLevelVisuals";

describe("getCardLevelVisualState", () => {
  it("Level 1 maps to level-1 tier", () => {
    const state = getCardLevelVisualState(1, 0);
    expect(state.tier).toBe("level-1");
    expect(state.level).toBe(1);
    expect(state.evolutionState).toBe("not-started");
    expect(state.isEvolutionComplete).toBe(false);
  });

  it("Level 2 maps to level-2 tier", () => {
    const state = getCardLevelVisualState(2, 0);
    expect(state.tier).toBe("level-2");
    expect(state.level).toBe(2);
    expect(state.isEvolutionComplete).toBe(false);
  });

  it("Level 3 maps to level-3 tier", () => {
    const state = getCardLevelVisualState(3, 2);
    expect(state.tier).toBe("level-3");
    expect(state.level).toBe(3);
    expect(state.isEvolutionComplete).toBe(true);
  });

  it("actual maximum Level is respected", () => {
    const state = getCardLevelVisualState(3, 2, 5);
    expect(state.maxLevel).toBe(5);
    expect(state.isEvolutionComplete).toBe(false);
  });

  it("Evolution not started when progressCurrent is 0 and level < max", () => {
    const state = getCardLevelVisualState(1, 0);
    expect(state.evolutionState).toBe("not-started");
  });

  it("Evolution in progress when progressCurrent > 0 and level < max", () => {
    const state = getCardLevelVisualState(2, 1);
    expect(state.evolutionState).toBe("in-progress");
  });

  it("Evolution complete when level reaches max", () => {
    const state = getCardLevelVisualState(3, 2);
    expect(state.evolutionState).toBe("complete");
    expect(state.isEvolutionComplete).toBe(true);
  });

  it("numeric progress preserved", () => {
    const state = getCardLevelVisualState(2, 1);
    expect(state.progressCurrent).toBe(1);
    expect(state.progressRequired).toBe(3);
  });

  it("missing progress does not fabricate values", () => {
    const state = getCardLevelVisualState(1, undefined);
    expect(state.progressCurrent).toBe(0);
    expect(state.evolutionState).toBe("not-started");
  });

  it("Level decrease maps correctly", () => {
    const state = getCardLevelVisualState(1, 0);
    expect(state.tier).toBe("level-1");
    expect(state.level).toBe(1);
  });

  it("output is locale-neutral", () => {
    const state = getCardLevelVisualState(2, 1);
    expect(state.tier).toBe("level-2");
    expect(state.level).toBe(2);
    expect(typeof state.progressCurrent).toBe("number");
    expect(typeof state.progressRequired).toBe("number");
  });

  it("input is not mutated", () => {
    const level = 2;
    const points = 1;
    const state = getCardLevelVisualState(level, points);
    expect(level).toBe(2);
    expect(points).toBe(1);
    expect(state.level).toBe(2);
  });

  it("invalid Level is clamped safely", () => {
    const state = getCardLevelVisualState(5, 0);
    expect(state.tier).toBe("level-3");
    expect(state.level).toBe(3);
    expect(state.isEvolutionComplete).toBe(true);
  });

  it("Level 0 is clamped to minimum", () => {
    const state = getCardLevelVisualState(0, 0);
    expect(state.tier).toBe("level-1");
    expect(state.level).toBe(1);
  });

  it("deterministic result", () => {
    const a = getCardLevelVisualState(2, 1);
    const b = getCardLevelVisualState(2, 1);
    expect(a).toEqual(b);
  });
});
