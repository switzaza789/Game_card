export type CardLevelVisualTier =
  | "level-1"
  | "level-2"
  | "level-3";

export type EvolutionVisualState =
  | "not-started"
  | "in-progress"
  | "complete";

export interface CardLevelVisualState {
  tier: CardLevelVisualTier;
  level: number;
  maxLevel: number;
  evolutionState: EvolutionVisualState;
  progressCurrent: number;
  progressRequired: number;
  isEvolutionComplete: boolean;
}

export function getCardLevelVisualState(
  level: number,
  evolutionPoints: number | undefined,
  maxLevel: number = 3,
  minLevel: number = 1
): CardLevelVisualState {
  const clampedLevel = Math.max(minLevel, Math.min(maxLevel, level));
  const safeLevel = Math.max(1, clampedLevel);
  const tier = getTier(safeLevel);
  const progressCurrent = evolutionPoints ?? 0;
  const progressRequired = maxLevel;
  const isEvolutionComplete = safeLevel >= maxLevel;
  const evolutionState = getEvolutionState(safeLevel, maxLevel, progressCurrent);

  return {
    tier,
    level: safeLevel,
    maxLevel,
    evolutionState,
    progressCurrent,
    progressRequired,
    isEvolutionComplete
  };
}

function getTier(level: number): CardLevelVisualTier {
  if (level >= 3) return "level-3";
  if (level >= 2) return "level-2";
  return "level-1";
}

function getEvolutionState(
  level: number,
  maxLevel: number,
  progressCurrent: number
): EvolutionVisualState {
  if (level >= maxLevel) return "complete";
  if (progressCurrent > 0) return "in-progress";
  return "not-started";
}
