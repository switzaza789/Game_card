import { describe, expect, it } from "vitest";
import { createRng, nextFloat, shuffle } from "./rng";

describe("deterministic RNG", () => {
  it("produces stable values for the same seed", () => {
    const first = nextFloat(createRng("seed-a"));
    const second = nextFloat(createRng("seed-a"));

    expect(first).toEqual(second);
  });

  it("shuffles deterministically for the same seed", () => {
    const items = ["A", "B", "C", "D", "E"];

    const first = shuffle(items, createRng("shuffle-seed"));
    const second = shuffle(items, createRng("shuffle-seed"));

    expect(first.value).toEqual(second.value);
    expect(first.value).not.toEqual(items);
    expect(first.rng.step).toBe(items.length - 1);
  });
});

