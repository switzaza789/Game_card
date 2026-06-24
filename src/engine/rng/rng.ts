import type { RngResult, RngState } from "../../types/game";

const UINT32_MAX = 0x100000000;

export function createRng(seed: string): RngState {
  return { seed, step: 0 };
}

export function nextFloat(rng: RngState): RngResult<number> {
  const nextStep = rng.step + 1;
  const hash = hashSeed(`${rng.seed}:${nextStep}`);
  return {
    value: hash / UINT32_MAX,
    rng: { ...rng, step: nextStep }
  };
}

export function shuffle<T>(items: readonly T[], rng: RngState): RngResult<T[]> {
  const nextItems = [...items];
  let nextRng = rng;

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const roll = nextFloat(nextRng);
    nextRng = roll.rng;
    const swapIndex = Math.floor(roll.value * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return { value: nextItems, rng: nextRng };
}

function hashSeed(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

