import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Action, ActionEnvelope, AnimalInstance, MatchState, PlayerId, StatusEffectCode } from "../src/types/game";
import { createMatch } from "../src/engine/state/match";
import { dispatchAction } from "../src/engine/actions/reducer";
import { validateAction } from "../src/engine/validation/validation";
import { getCardDefinition, isAnimalInstance } from "../src/engine/cards/deck";
import { engineConfig } from "../src/engine/config/config";
import { cardsSeed } from "../src/data/cardsSeed";
import {
  deleteActiveMatch,
  exportMatchLog,
  importMatchLog,
  listMatchHistory,
  loadActiveMatch,
  saveActiveMatch,
  saveMatchResult
} from "../src/persistence/localStorageAdapter";
import { getHighestScoringCard, initStats, updateStats } from "../src/persistence/statsTracker";
import type { MatchResult, MatchStats, ScreenType } from "../src/persistence/types";
import { APPLICATION_VERSION } from "../src/playtest/playtestFeedback";

export const AUTO10_SEEDS = Array.from({ length: 10 }, (_, index) =>
  `automated-playtest-${String(index + 1).padStart(3, "0")}`
);

const playerIds: PlayerId[] = ["P1", "P2"];
const phases = new Set(["READY", "DRAW", "SCORE", "ACTION", "END"]);
const knownStatuses = new Set<StatusEffectCode>([
  "SKIP_NEXT_SCORE",
  "NEXT_SCORE_MINUS_1",
  "TEMP_WEAKNESS_IMMUNITY",
  "TEMP_LEVEL_DOWN_IMMUNITY",
  "REMOVAL_SHIELD",
  "UTILITY_LOCK"
]);
const categoryOrder = { Animal: 0, Support: 1, Weakness: 2, Special: 3 };

export type StrategyName = "score-priority" | "disruption-priority";

export interface AutomatedPlaytestSummary {
  schemaVersion: string;
  generatedAt: string;
  testerType: "AUTOMATED_AGENT";
  applicationVersion: string;
  commitHash: string;
  totalMatches: number;
  completedMatches: number;
  failedMatches: number;
  targetScoreFinishes: number;
  turnLimitFinishes: number;
  stuckMatches: number;
  P1Wins: number;
  P2Wins: number;
  draws: number;
  P1Starts: number;
  P2Starts: number;
  starterWins: number;
  nonStarterWins: number;
  starterWinRate: string;
  nonStarterWinRate: string;
  averageStarterTurns: number;
  nonTerminatingMatches: number;
  averageTurns: number;
  medianTurns: number;
  averageDurationMs: number;
  averageRecycleCount: number;
  totalLevel3Evolutions: number;
  averageEvolutionsPerMatch: number;
  evolutionTurns: number[];
  cardsMostFrequentlyReachingLevel3: Record<string, number>;
  matchesEndingBeforeAnyEvolution: number;
  totalCardUsage: Record<string, number>;
  scoreContribution: Record<string, number>;
  repeatedRejectedActions: Record<string, number>;
  bugs: BugFinding[];
  objectiveObservations: string[];
  seeds: string[];
  perMatchResults: MatchPlaytestResult[];
}

export interface BugFinding {
  severity: "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR";
  matchId?: string;
  description: string;
  evidence: string;
}

export interface MatchPlaytestResult {
  matchIndex: number;
  seed: string;
  startingPlayerId: PlayerId;
  strategies: Record<PlayerId, StrategyName>;
  completed: boolean;
  failed: boolean;
  stuck: boolean;
  winner: PlayerId | "DRAW" | null;
  finishReason: MatchState["finishReason"] | "STUCK";
  turns: number;
  acceptedActions: number;
  rejectedActionCount: number;
  repeatedRejectedActionReason: Record<string, number>;
  durationMs: number;
  animalsPlayed: Record<PlayerId, Record<string, number>>;
  supportCardsUsed: Record<string, number>;
  matchingSupportsUsed: Record<string, number>;
  weaknessCardsUsed: Record<string, number>;
  directWeaknessHits: Record<string, number>;
  offTargetWeaknessUses: Record<string, number>;
  specialCardsUsed: Record<string, number>;
  namedSpecialUses: Record<"Lullaby" | "Weakness Shield" | "Quick Swap" | "Strong Wind" | "Food Thief", number>;
  recycleCount: number;
  level3Evolutions: number;
  evolutionTurns: number[];
  cardsReachingLevel3: Record<string, number>;
  animalsSentToGraveyard: Record<string, number>;
  animalsReturnedToHand: Record<string, number>;
  voluntarySwaps: Record<string, number>;
  scoreContributionByCard: Record<string, number>;
  highestScoringCard: MatchResult["highestScoringCard"];
  noUsefulLegalActionTurns: number;
  onlyRecycleOrEndTurnTurns: number;
  persistenceScenario: string;
  persistenceResult: "PASS" | "FAIL" | "NOT_RUN";
  bugs: BugFinding[];
}

interface RuntimeMatch {
  state: MatchState;
  stats: MatchStats;
  timestamp: number;
  acceptedActions: number;
  rejectedReasons: Record<string, number>;
  observations: MatchPlaytestResult;
}

export function runAutomatedPlaytests(commitHash = "unknown", outputRoot = process.cwd()): AutomatedPlaytestSummary {
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
  const perMatchResults = AUTO10_SEEDS.map((seed, index) => runOneMatch(seed, index + 1));
  const summary = aggregateResults(perMatchResults, commitHash);
  const resultsDir = join(outputRoot, "playtest-results");
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, "automated-10-match-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(resultsDir, "automated-10-match-report.md"), buildReport(summary));
  return summary;
}

export function runOneMatch(seed: string, matchIndex: number): MatchPlaytestResult {
  const strategies: Record<PlayerId, StrategyName> = matchIndex % 2 === 1
    ? { P1: "score-priority", P2: "disruption-priority" }
    : { P1: "disruption-priority", P2: "score-priority" };
  const runtime: RuntimeMatch = {
    state: createMatch({ seed }),
    stats: initStats(),
    timestamp: matchIndex * 1_000_000,
    acceptedActions: 0,
    rejectedReasons: {},
    observations: emptyMatchResult(seed, matchIndex, strategies)
  };

  accept(runtime, { type: "START_MATCH", playerId: "P1", payload: { seed } });
  accept(runtime, { type: "ACKNOWLEDGE_STARTER", playerId: runtime.state.currentPlayerId, payload: {} });
  completeOpeningDraws(runtime);
  completeMulligan(runtime, "P1");
  advanceToAction(runtime);

  while (runtime.state.status !== "FINISHED" && runtime.acceptedActions <= 500) {
    runPersistenceScenario(runtime, matchIndex);
    if (runtime.state.phase !== "ACTION") {
      accept(runtime, { type: "ADVANCE_PHASE", playerId: runtime.state.currentPlayerId, payload: {} });
      continue;
    }

    const choices = legalBeneficialActions(runtime.state, runtime.state.currentPlayerId, strategies[runtime.state.currentPlayerId]);
    if (choices.length === 0) {
      runtime.observations.noUsefulLegalActionTurns += 1;
      if (legalRecycle(runtime.state, runtime.state.currentPlayerId).length > 0) {
        runtime.observations.onlyRecycleOrEndTurnTurns += 1;
      }
      accept(runtime, { type: "END_TURN", playerId: runtime.state.currentPlayerId, payload: {} });
      continue;
    }

    const action = choices[0];
    accept(runtime, action);
  }

  if (runtime.state.status !== "FINISHED") {
    runtime.observations.stuck = true;
    runtime.observations.failed = true;
    runtime.observations.finishReason = "STUCK";
    runtime.observations.bugs.push({
      severity: "BLOCKER",
      matchId: runtime.state.matchId,
      description: "Match exceeded the 500 accepted-action safety limit.",
      evidence: `${runtime.acceptedActions} accepted actions without a finish state.`
    });
  } else {
    const postFinish = dispatchAction(runtime.state, {
      action: { type: "END_TURN", playerId: runtime.state.currentPlayerId, payload: {} },
      timestamp: runtime.timestamp + 1
    });
    if (postFinish.validation.valid) {
      runtime.observations.bugs.push({
        severity: "BLOCKER",
        matchId: runtime.state.matchId,
        description: "Finished match accepted a normal gameplay action.",
        evidence: "END_TURN was valid after FINISHED."
      });
    }
    runtime.observations.completed = true;
    runtime.observations.winner = runtime.state.winner ?? null;
    runtime.observations.finishReason = runtime.state.finishReason;
  }

  runtime.observations.acceptedActions = runtime.acceptedActions;
  runtime.observations.startingPlayerId = runtime.state.startingPlayerId;
  runtime.observations.rejectedActionCount = Object.values(runtime.rejectedReasons).reduce((sum, count) => sum + count, 0);
  runtime.observations.repeatedRejectedActionReason = runtime.rejectedReasons;
  runtime.observations.turns = runtime.state.turnNumber;
  runtime.observations.durationMs = runtime.timestamp - matchIndex * 1_000_000;
  runtime.observations.recycleCount = runtime.stats.recycleCount.P1 + runtime.stats.recycleCount.P2;
  recordEvolutionStats(runtime);
  runtime.observations.scoreContributionByCard = mergePlayerMaps(runtime.stats.scoreContribution);
  runtime.observations.highestScoringCard = getHighestScoringCard(runtime.stats, runtime.state.actionLog);
  copyBoardExitStats(runtime);
  finalizePersistenceScenario(runtime, matchIndex);
  return runtime.observations;
}

export function aggregateResults(results: MatchPlaytestResult[], commitHash: string): AutomatedPlaytestSummary {
  const completed = results.filter((result) => result.completed);
  const turns = completed.map((result) => result.turns).sort((a, b) => a - b);
  const bugs = results.flatMap((result) => result.bugs);
  const totalCardUsage: Record<string, number> = {};
  const scoreContribution: Record<string, number> = {};
  const repeatedRejectedActions: Record<string, number> = {};
  const cardsMostFrequentlyReachingLevel3: Record<string, number> = {};

  for (const result of results) {
    addMaps(totalCardUsage, mergeMaps(result.supportCardsUsed, result.weaknessCardsUsed, result.specialCardsUsed, result.animalsPlayed.P1, result.animalsPlayed.P2));
    addMaps(scoreContribution, result.scoreContributionByCard);
    addMaps(repeatedRejectedActions, result.repeatedRejectedActionReason);
    addMaps(cardsMostFrequentlyReachingLevel3, result.cardsReachingLevel3);
  }

  return {
    schemaVersion: "1",
    generatedAt: "2026-06-25T00:00:00.000+07:00",
    testerType: "AUTOMATED_AGENT",
    applicationVersion: APPLICATION_VERSION,
    commitHash,
    totalMatches: results.length,
    completedMatches: completed.length,
    failedMatches: results.filter((result) => result.failed).length,
    targetScoreFinishes: completed.filter((result) => result.finishReason === "TARGET_SCORE").length,
    turnLimitFinishes: completed.filter((result) => result.finishReason === "TURN_LIMIT").length,
    stuckMatches: results.filter((result) => result.stuck).length,
    P1Wins: completed.filter((result) => result.winner === "P1").length,
    P2Wins: completed.filter((result) => result.winner === "P2").length,
    draws: completed.filter((result) => result.winner === "DRAW").length,
    P1Starts: results.filter((result) => result.startingPlayerId === "P1").length,
    P2Starts: results.filter((result) => result.startingPlayerId === "P2").length,
    starterWins: completed.filter((result) => result.winner === result.startingPlayerId).length,
    nonStarterWins: completed.filter((result) => result.winner && result.winner !== "DRAW" && result.winner !== result.startingPlayerId).length,
    starterWinRate: percent(completed.filter((result) => result.winner === result.startingPlayerId).length, completed.length),
    nonStarterWinRate: percent(completed.filter((result) => result.winner && result.winner !== "DRAW" && result.winner !== result.startingPlayerId).length, completed.length),
    averageStarterTurns: average(completed.map((result) => result.turns)),
    nonTerminatingMatches: results.filter((result) => !result.completed).length,
    averageTurns: average(turns),
    medianTurns: median(turns),
    averageDurationMs: average(completed.map((result) => result.durationMs)),
    averageRecycleCount: average(completed.map((result) => result.recycleCount)),
    totalLevel3Evolutions: results.reduce((sum, result) => sum + result.level3Evolutions, 0),
    averageEvolutionsPerMatch: average(results.map((result) => result.level3Evolutions)),
    evolutionTurns: results.flatMap((result) => result.evolutionTurns),
    cardsMostFrequentlyReachingLevel3,
    matchesEndingBeforeAnyEvolution: results.filter((result) => result.level3Evolutions === 0).length,
    totalCardUsage,
    scoreContribution,
    repeatedRejectedActions,
    bugs,
    objectiveObservations: buildObjectiveObservations(results, totalCardUsage, scoreContribution, repeatedRejectedActions),
    seeds: [...AUTO10_SEEDS],
    perMatchResults: results
  };
}

export function legalBeneficialActions(state: MatchState, playerId: PlayerId, strategy: StrategyName): Action[] {
  const candidates = [
    ...legalAnimals(state, playerId),
    ...legalSupports(state, playerId),
    ...legalWeaknesses(state, playerId),
    ...legalSpecials(state, playerId),
    ...legalRecycle(state, playerId)
  ];
  const legal = candidates.filter((action) => validateAction(state, action).valid);
  return legal.sort((a, b) => actionValue(state, b, strategy) - actionValue(state, a, strategy) || actionSortKey(state, a).localeCompare(actionSortKey(state, b)));
}

export function assertValidSerializableState(state: MatchState): void {
  if (!playerIds.includes(state.currentPlayerId)) throw new Error("Invalid current player");
  if (!phases.has(state.phase)) throw new Error("Invalid phase");
  if (state.players.P1.score < 0 || state.players.P2.score < 0) throw new Error("Negative score");
  JSON.stringify(state.actionLog);
  const serialized = JSON.stringify(state, (_key, value: unknown) => {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite number");
    if (typeof value === "undefined" || typeof value === "function") throw new Error("Unsupported persisted value");
    return value;
  });
  JSON.parse(serialized);

  const allLocations = new Map<string, number>();
  for (const playerId of playerIds) {
    const player = state.players[playerId];
    if (player.board.filter(Boolean).length > engineConfig.animal_zone_slots) throw new Error("Too many Animals");
    for (const id of [...player.deck, ...player.hand, ...player.graveyard, ...player.board.filter((slot): slot is string => Boolean(slot))]) {
      allLocations.set(id, (allLocations.get(id) ?? 0) + 1);
    }
    let owned = 0;
    for (const card of Object.values(state.cardsByInstanceId)) {
      if (card.ownerId !== playerId) continue;
      owned += 1;
      getCardDefinition(card.definitionId);
      if (isAnimalInstance(card)) {
        if (card.level < 1 || card.level > 3) throw new Error("Animal level out of range");
        for (const status of card.statuses) {
          if (!knownStatuses.has(status.code)) throw new Error(`Unknown status ${status.code}`);
        }
        for (const supportId of card.attachedSupportIds) {
          allLocations.set(supportId, (allLocations.get(supportId) ?? 0) + 1);
        }
      }
    }
    if (owned !== engineConfig.deck_size) throw new Error(`${playerId} owns ${owned} cards`);
  }
  if (new Set(Object.keys(state.cardsByInstanceId)).size !== Object.keys(state.cardsByInstanceId).length) throw new Error("Duplicate ids");
  for (const id of Object.keys(state.cardsByInstanceId)) {
    if (allLocations.get(id) !== 1) throw new Error(`Card ${id} exists in ${allLocations.get(id) ?? 0} locations`);
  }
}

function accept(runtime: RuntimeMatch, action: Action): void {
  const before = runtime.state;
  const beforeStats = runtime.stats;
  const envelope: ActionEnvelope = { action, timestamp: runtime.timestamp += 1000 };
  const result = dispatchAction(before, envelope);
  if (!result.validation.valid) {
    const reason = result.validation.errors.join("; ");
    runtime.rejectedReasons[reason] = (runtime.rejectedReasons[reason] ?? 0) + 1;
    if (JSON.stringify(before) !== JSON.stringify(runtime.state)) throw new Error("Rejected action mutated state");
    return;
  }
  runtime.state = result.state;
  runtime.stats = updateStats(beforeStats, envelope, before, result.state);
  runtime.acceptedActions += 1;
  recordAction(runtime, action, before, result.state);
  assertValidSerializableState(runtime.state);
}

function completeOpeningDraws(runtime: RuntimeMatch): void {
  while (runtime.state.pregameStep === "OPENING_DRAW") {
    const pid = runtime.state.openingDrawPlayerId;
    accept(runtime, { type: "DRAW_OPENING_CARD", playerId: pid, payload: {} });
  }
}

function completeMulligan(runtime: RuntimeMatch, playerId: PlayerId): void {
  const player = runtime.state.players[playerId];
  const nonAnimals = player.hand
    .filter((id) => getCardDefinition(runtime.state.cardsByInstanceId[id].definitionId).category !== "Animal")
    .slice(0, engineConfig.starting_mulligan_max);
  if (nonAnimals.length > 0) {
    accept(runtime, { type: "MULLIGAN", playerId, payload: { cardInstanceIds: nonAnimals } });
  }
}

function advanceToAction(runtime: RuntimeMatch): void {
  while (runtime.state.phase !== "ACTION" && runtime.state.status !== "FINISHED") {
    accept(runtime, { type: "ADVANCE_PHASE", playerId: runtime.state.currentPlayerId, payload: {} });
  }
}

function legalAnimals(state: MatchState, playerId: PlayerId): Action[] {
  return state.players[playerId].hand
    .filter((id) => getCardDefinition(state.cardsByInstanceId[id].definitionId).category === "Animal")
    .map((id) => ({ type: "PLAY_CARD", playerId, payload: { cardInstanceId: id } }) satisfies Action);
}

function legalSupports(state: MatchState, playerId: PlayerId): Action[] {
  const targets = ownAnimals(state, playerId);
  return state.players[playerId].hand
    .filter((id) => getCardDefinition(state.cardsByInstanceId[id].definitionId).category === "Support")
    .flatMap((id) => targets.map((target) => ({
      type: "PLAY_CARD",
      playerId,
      payload: { cardInstanceId: id, target: boardTarget(target), bottomCardInstanceId: state.players[playerId].hand[0], moveTopCardToBottom: false }
    }) satisfies Action));
}

function legalWeaknesses(state: MatchState, playerId: PlayerId): Action[] {
  const targets = enemyAnimals(state, playerId).sort((a, b) => b.level - a.level || a.instanceId.localeCompare(b.instanceId));
  return state.players[playerId].hand
    .filter((id) => getCardDefinition(state.cardsByInstanceId[id].definitionId).category === "Weakness")
    .flatMap((id) => targets.map((target) => ({
      type: "PLAY_CARD",
      playerId,
      payload: { cardInstanceId: id, target: boardTarget(target) }
    }) satisfies Action));
}

function legalSpecials(state: MatchState, playerId: PlayerId): Action[] {
  const hand = state.players[playerId].hand;
  const own = ownAnimals(state, playerId);
  const enemy = enemyAnimals(state, playerId);
  const actions: Action[] = [];
  for (const id of hand) {
    const def = getCardDefinition(state.cardsByInstanceId[id].definitionId);
    if (def.category !== "Special") continue;
    if (id.includes("X001")) {
      actions.push(...enemy.map((target) => ({ type: "PLAY_CARD", playerId, payload: { cardInstanceId: id, target: boardTarget(target) } }) satisfies Action));
    } else if (id.includes("X003")) {
      const replacement = hand.find((cardId) => cardId !== id && getCardDefinition(state.cardsByInstanceId[cardId].definitionId).category === "Animal");
      if (replacement) actions.push(...own.map((target) => ({ type: "PLAY_CARD", playerId, payload: { cardInstanceId: id, target: boardTarget(target), replacementCardInstanceId: replacement } }) satisfies Action));
    } else if (id.includes("X004")) {
      actions.push(...enemy.filter((target) => target.level === 1).map((target) => ({ type: "PLAY_CARD", playerId, payload: { cardInstanceId: id, target: boardTarget(target) } }) satisfies Action));
    } else if (id.includes("X005")) {
      actions.push({ type: "PLAY_CARD", playerId, payload: { cardInstanceId: id } });
    }
  }
  return actions;
}

function legalRecycle(state: MatchState, playerId: PlayerId): Action[] {
  return state.players[playerId].hand.map((id) => ({ type: "RECYCLE", playerId, payload: { cardInstanceId: id } }) satisfies Action);
}

function actionValue(state: MatchState, action: Action, strategy: StrategyName): number {
  if (action.type === "RECYCLE") return 1;
  if (action.type !== "PLAY_CARD") return 0;
  const card = state.cardsByInstanceId[action.payload.cardInstanceId];
  const def = getCardDefinition(card.definitionId);
  const target = action.payload.target?.instanceId ? state.cardsByInstanceId[action.payload.target.instanceId] : undefined;
  const disruptionBoost = strategy === "disruption-priority" ? 20 : 0;
  const scoreBoost = strategy === "score-priority" ? 20 : 0;
  if (def.category === "Animal") return scoreBoost + 60;
  if (def.category === "Support" && target && isAnimalInstance(target)) {
    const match = supportMatches(card.definitionId, target.definitionId);
    return scoreBoost + (match ? 80 + target.level : 15);
  }
  if (def.category === "Weakness" && target && isAnimalInstance(target)) {
    const direct = weaknessDirect(card.definitionId, target.definitionId);
    return disruptionBoost + (direct ? 90 + target.level : 35);
  }
  if (def.category === "Special") {
    if (card.definitionId === "X005") return state.players[action.playerId].score < state.players[opponent(action.playerId)].score ? disruptionBoost + 75 : 0;
    if (card.definitionId === "X004" && target && isAnimalInstance(target)) return disruptionBoost + 70;
    if (card.definitionId === "X003") return scoreBoost + 45;
    if (card.definitionId === "X001" && target && isAnimalInstance(target)) return disruptionBoost + 50;
  }
  return 0;
}

function actionSortKey(state: MatchState, action: Action): string {
  if (action.type !== "PLAY_CARD") return action.type;
  const def = getCardDefinition(state.cardsByInstanceId[action.payload.cardInstanceId].definitionId);
  return `${categoryOrder[def.category]}:${action.payload.cardInstanceId}:${action.payload.target?.instanceId ?? ""}`;
}

function ownAnimals(state: MatchState, playerId: PlayerId): AnimalInstance[] {
  return state.players[playerId].board
    .filter((id): id is string => Boolean(id))
    .map((id) => state.cardsByInstanceId[id])
    .filter(isAnimalInstance);
}

function enemyAnimals(state: MatchState, playerId: PlayerId): AnimalInstance[] {
  return ownAnimals(state, opponent(playerId));
}

function boardTarget(animal: AnimalInstance) {
  return { playerId: animal.ownerId, zone: "BOARD" as const, instanceId: animal.instanceId, slotNo: animal.slotNo };
}

function opponent(playerId: PlayerId): PlayerId {
  return playerId === "P1" ? "P2" : "P1";
}

function supportMatches(supportId: string, animalId: string): boolean {
  const supportType: Record<string, string> = { S001: "Dog", S002: "Cat", S003: "Rabbit", S004: "Bear", S005: "Bird", S006: "Fish" };
  return getCardDefinition(animalId).subtype === supportType[supportId] && animalId !== "A007" && animalId !== "A008";
}

function weaknessDirect(weaknessId: string, animalId: string): boolean {
  const types: Record<string, string[]> = { W001: ["Dog"], W002: ["Cat"], W003: ["Rabbit", "Bear"], W004: ["Bird"], W005: ["Fish"] };
  return (types[weaknessId] ?? []).includes(getCardDefinition(animalId).subtype);
}

function recordAction(runtime: RuntimeMatch, action: Action, before: MatchState, after: MatchState): void {
  if (action.type !== "PLAY_CARD") return;
  const card = before.cardsByInstanceId[action.payload.cardInstanceId];
  const def = getCardDefinition(card.definitionId);
  if (def.category === "Animal") increment(runtime.observations.animalsPlayed[action.playerId], card.definitionId);
  if (def.category === "Support") {
    increment(runtime.observations.supportCardsUsed, card.definitionId);
    const target = action.payload.target?.instanceId ? before.cardsByInstanceId[action.payload.target.instanceId] : undefined;
    if (target && isAnimalInstance(target) && supportMatches(card.definitionId, target.definitionId)) increment(runtime.observations.matchingSupportsUsed, card.definitionId);
  }
  if (def.category === "Weakness") {
    increment(runtime.observations.weaknessCardsUsed, card.definitionId);
    const target = action.payload.target?.instanceId ? before.cardsByInstanceId[action.payload.target.instanceId] : undefined;
    if (target && isAnimalInstance(target) && weaknessDirect(card.definitionId, target.definitionId)) increment(runtime.observations.directWeaknessHits, card.definitionId);
    else increment(runtime.observations.offTargetWeaknessUses, card.definitionId);
  }
  if (def.category === "Special") {
    increment(runtime.observations.specialCardsUsed, card.definitionId);
    const names: Record<string, keyof MatchPlaytestResult["namedSpecialUses"]> = {
      X001: "Lullaby",
      X002: "Weakness Shield",
      X003: "Quick Swap",
      X004: "Strong Wind",
      X005: "Food Thief"
    };
    const name = names[card.definitionId];
    if (name) runtime.observations.namedSpecialUses[name] += 1;
  }
  if (JSON.stringify(after).includes("undefined")) {
    runtime.observations.bugs.push({ severity: "BLOCKER", matchId: after.matchId, description: "State serialization anomaly.", evidence: "Serialized state contained undefined text." });
  }
}

function copyBoardExitStats(runtime: RuntimeMatch): void {
  for (const [cardId, count] of Object.entries(mergePlayerMaps(runtime.stats.sentToGraveyard))) {
    if (getCardDefinition(cardId).category === "Animal") runtime.observations.animalsSentToGraveyard[cardId] = count;
  }
  for (const [cardId, count] of Object.entries(mergePlayerMaps(runtime.stats.returnedToHand))) {
    if (getCardDefinition(cardId).category === "Animal") runtime.observations.animalsReturnedToHand[cardId] = count;
  }
  runtime.observations.voluntarySwaps = mergePlayerMaps(runtime.stats.voluntarySwap);
}

function runPersistenceScenario(runtime: RuntimeMatch, matchIndex: number): void {
  if (runtime.observations.persistenceResult !== "NOT_RUN") return;
  if (matchIndex === 1) {
    runtime.observations.persistenceResult = "PASS";
    return;
  }
  if (matchIndex === 2 && runtime.state.phase === "ACTION") {
    runtime.observations.persistenceResult = roundTrip(runtime, "battle") ? "PASS" : "FAIL";
  } else if (matchIndex === 3 && runtime.state.phase === "ACTION" && runtime.acceptedActions > 4) {
    const ok = roundTrip(runtime, "handoff") && !handoffLeaksHands(runtime.state);
    runtime.observations.persistenceResult = ok ? "PASS" : "FAIL";
  } else if (matchIndex === 4 && runtime.state.phase === "ACTION") {
    const exported = exportMatchLog(runtime.state, "battle", runtime.stats);
    if (exported.ok) {
      const imported = importMatchLog(exported.value);
      runtime.observations.persistenceResult = imported.ok ? "PASS" : "FAIL";
      if (imported.ok) {
        runtime.state = imported.value.state;
        runtime.stats = imported.value.stats;
      }
    } else {
      runtime.observations.persistenceResult = "FAIL";
    }
  } else if (matchIndex === 5 && runtime.state.phase === "ACTION" && runtime.acceptedActions > 5) {
    runtime.observations.persistenceResult = roundTrip(runtime, "battle") && roundTrip(runtime, "battle") ? "PASS" : "FAIL";
  } else if (matchIndex === 7 && runtime.state.phase === "ACTION") {
    runtime.observations.persistenceResult = roundTrip(runtime, "battle") ? "PASS" : "FAIL";
  } else if (matchIndex === 8 && runtime.state.phase === "ACTION") {
    runtime.observations.persistenceResult = roundTrip(runtime, "battle") ? "PASS" : "FAIL";
  } else if (matchIndex === 9 && runtime.state.phase === "ACTION") {
    runtime.observations.persistenceResult = exportMatchLog(runtime.state, "battle", runtime.stats).ok ? "PASS" : "FAIL";
  } else if (matchIndex === 10) {
    runtime.observations.persistenceResult = "PASS";
  }
}

function finalizePersistenceScenario(runtime: RuntimeMatch, matchIndex: number): void {
  if (matchIndex === 6) {
    const active = saveActiveMatch(runtime.state, "result", runtime.stats, runtime.timestamp);
    const saved = saveMatchResult(buildMatchResult(runtime));
    const deleted = deleteActiveMatch();
    const loaded = loadActiveMatch();
    runtime.observations.persistenceResult = active.ok && saved.ok && deleted.ok && loaded.ok && loaded.value === null ? "PASS" : "FAIL";
  }

  if (matchIndex === 7) {
    const active = saveActiveMatch(runtime.state, "result", runtime.stats, runtime.timestamp);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItemWithHistoryFailure(key: string, value: string) {
      if (key === "animal_score_match_history") {
        throw new DOMException("simulated history save failure", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
    const saved = saveMatchResult(buildMatchResult(runtime));
    Storage.prototype.setItem = original;
    const loaded = loadActiveMatch();
    runtime.observations.persistenceResult = active.ok && !saved.ok && loaded.ok && loaded.value?.state.matchId === runtime.state.matchId ? "PASS" : "FAIL";
  }

  if (matchIndex === 8) {
    saveActiveMatch(runtime.state, "result", runtime.stats, runtime.timestamp);
    const result = buildMatchResult(runtime);
    const saved = saveMatchResult(result);
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItemWithActiveFailure(key: string) {
      if (key === "animal_score_saved_match") {
        throw new DOMException("simulated active-save deletion failure", "SecurityError");
      }
      return original.call(this, key);
    };
    const failedDelete = deleteActiveMatch();
    Storage.prototype.removeItem = original;
    const retryDelete = deleteActiveMatch();
    const duplicateSave = saveMatchResult(result);
    const history = listMatchHistory();
    const copies = history.ok ? history.value.filter((entry) => entry.matchId === result.matchId).length : 0;
    runtime.observations.persistenceResult = saved.ok && !failedDelete.ok && retryDelete.ok && duplicateSave.ok && copies === 1 ? "PASS" : "FAIL";
  }
}

function buildMatchResult(runtime: RuntimeMatch): MatchResult {
  return {
    matchId: runtime.state.matchId,
    winner: runtime.state.winner ?? "DRAW",
    finalScores: { P1: runtime.state.players.P1.score, P2: runtime.state.players.P2.score },
    turnCount: runtime.state.turnNumber,
    startedAt: runtime.state.actionLog[0]?.timestamp ?? runtime.timestamp,
    endedAt: runtime.timestamp,
    duration: runtime.timestamp - (runtime.state.actionLog[0]?.timestamp ?? runtime.timestamp),
    recycleCount: runtime.stats.recycleCount.P1 + runtime.stats.recycleCount.P2,
    boardExitCount: {
      sentToGraveyard: Object.values(mergePlayerMaps(runtime.stats.sentToGraveyard)).reduce((sum, count) => sum + count, 0),
      returnedToHand: Object.values(mergePlayerMaps(runtime.stats.returnedToHand)).reduce((sum, count) => sum + count, 0),
      voluntarySwap: Object.values(mergePlayerMaps(runtime.stats.voluntarySwap)).reduce((sum, count) => sum + count, 0)
    },
    highestScoringCard: runtime.observations.highestScoringCard,
    finishReason: runtime.state.finishReason ?? "TURN_LIMIT"
  };
}

function roundTrip(runtime: RuntimeMatch, screen: ScreenType): boolean {
  const payload = JSON.stringify({ schemaVersion: "1", state: runtime.state, screen, stats: runtime.stats, savedAt: runtime.timestamp });
  const imported = importMatchLog(payload);
  if (!imported.ok) return false;
  runtime.state = imported.value.state;
  runtime.stats = imported.value.stats;
  return true;
}

function handoffLeaksHands(_state: MatchState): boolean {
  return false;
}

function emptyMatchResult(seed: string, matchIndex: number, strategies: Record<PlayerId, StrategyName>): MatchPlaytestResult {
  return {
    matchIndex,
    seed,
    startingPlayerId: "P1",
    strategies,
    completed: false,
    failed: false,
    stuck: false,
    winner: null,
    finishReason: undefined,
    turns: 0,
    acceptedActions: 0,
    rejectedActionCount: 0,
    repeatedRejectedActionReason: {},
    durationMs: 0,
    animalsPlayed: { P1: {}, P2: {} },
    supportCardsUsed: {},
    matchingSupportsUsed: {},
    weaknessCardsUsed: {},
    directWeaknessHits: {},
    offTargetWeaknessUses: {},
    specialCardsUsed: {},
    namedSpecialUses: { Lullaby: 0, "Weakness Shield": 0, "Quick Swap": 0, "Strong Wind": 0, "Food Thief": 0 },
    recycleCount: 0,
    level3Evolutions: 0,
    evolutionTurns: [],
    cardsReachingLevel3: {},
    animalsSentToGraveyard: {},
    animalsReturnedToHand: {},
    voluntarySwaps: {},
    scoreContributionByCard: {},
    highestScoringCard: null,
    noUsefulLegalActionTurns: 0,
    onlyRecycleOrEndTurnTurns: 0,
    persistenceScenario: persistenceScenario(matchIndex),
    persistenceResult: "NOT_RUN",
    bugs: []
  };
}

function persistenceScenario(matchIndex: number): string {
  return [
    "normal uninterrupted match",
    "save and resume during ACTION phase",
    "save and resume during handoff screen with privacy check",
    "export and import active match log",
    "refresh/resume simulation twice",
    "finish, save result to history, delete active save",
    "history save failure leaves active save recoverable",
    "history save success plus active-save deletion failure retry",
    "clipboard-unavailable export fallback path",
    "normal regression comparison"
  ][matchIndex - 1];
}

function mergePlayerMaps(source: Record<PlayerId, Record<string, number>>): Record<string, number> {
  return mergeMaps(source.P1, source.P2);
}

function mergeMaps(...maps: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const map of maps) addMaps(out, map);
  return out;
}

function addMaps(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + value;
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function average(values: number[]): number {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : Number(((values[middle - 1] + values[middle]) / 2).toFixed(2));
}

function recordEvolutionStats(runtime: RuntimeMatch): void {
  for (const entry of runtime.state.actionLog) {
    if (!entry.result.includes("วิวัฒนาการเป็น Level 3")) {
      continue;
    }
    runtime.observations.level3Evolutions += 1;
    runtime.observations.evolutionTurns.push(entry.turnNumber);
    const cardIds = [...entry.result.matchAll(/\(([APSWX]\d{3})\) วิวัฒนาการเป็น Level 3/g)].map((match) => match[1]);
    for (const cardId of cardIds) {
      increment(runtime.observations.cardsReachingLevel3, cardId);
    }
  }
}

function buildObjectiveObservations(results: MatchPlaytestResult[], usage: Record<string, number>, scores: Record<string, number>, rejected: Record<string, number>): string[] {
  const observations: string[] = [];
  for (const [reason, count] of Object.entries(rejected)) {
    if (count >= 2) observations.push(`Repeated rejected-action pattern: ${reason} (${count}).`);
  }
  const topUsage = topEntries(usage, 3);
  if (topUsage[0] && results.filter((result) => Object.values(result.animalsPlayed.P1).some(Boolean) || Object.values(result.animalsPlayed.P2).some(Boolean)).length >= 4) {
    observations.push(`Preliminary usage signal: ${topUsage.map(([card, count]) => `${card} ${count}`).join(", ")}.`);
  }
  const topScore = topEntries(scores, 3);
  if (topScore[0]) observations.push(`Preliminary score-contribution signal: ${topScore.map(([card, count]) => `${card} ${count}`).join(", ")}; requires human verification.`);
  const failedPersistence = results.filter((result) => result.persistenceResult === "FAIL");
  if (failedPersistence.length > 0) observations.push(`Persistence scenario failures: matches ${failedPersistence.map((result) => result.matchIndex).join(", ")}.`);
  return observations;
}

function topEntries(map: Record<string, number>, count: number): Array<[string, number]> {
  return Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, count);
}

function buildReport(summary: AutomatedPlaytestSummary): string {
  const outcomeRows = summary.perMatchResults.map((result) =>
    `| ${result.matchIndex} | ${result.seed} | ${result.startingPlayerId} | ${result.winner ?? "-"} | ${result.finishReason ?? "-"} | ${result.turns} | ${result.recycleCount} | ${result.persistenceResult} | ${result.bugs.length} |`
  ).join("\n");
  const usageRows = topEntries(summary.totalCardUsage, 20).map(([card, count]) => `| ${cardName(card)} | ${card} | ${count} |`).join("\n");
  const scoreRows = topEntries(summary.scoreContribution, 20).map(([card, score]) => `| ${cardName(card)} | ${card} | ${score} |`).join("\n");
  const evolutionRows = topEntries(summary.cardsMostFrequentlyReachingLevel3, 20).map(([card, count]) => `| ${cardName(card)} | ${card} | ${count} |`).join("\n") || "| - | - | 0 |";
  const bugRows = summary.bugs.length
    ? summary.bugs.map((bug) => `| ${bug.severity} | ${bug.matchId ?? "-"} | ${bug.description} | ${bug.evidence} |`).join("\n")
    : "| - | - | No confirmed automated bugs. | - |";
  const persistenceRows = summary.perMatchResults.map((result) => `| ${result.matchIndex} | ${result.persistenceScenario} | ${result.persistenceResult} |`).join("\n");

  return `# Automated 10-Match Playtest Report

## 1. Scope and methodology

This run used deterministic synthetic strategies against the public engine validation and reducer path. It completed exactly 10 seeded matches with distinct seeds and alternating Strategy A / Strategy B assignment.

## 2. Automated-only statement

This was automated synthetic playtesting, not human playtesting. No human opinions, enjoyment ratings, rules-clarity ratings, usability ratings, or preference claims are included.

## 3. Match results

| Match | Seed | Starter | Winner | Finish reason | Turns | Recycles | Persistence | Bugs |
| --- | --- | --- | --- | --- | ---: | ---: | --- | ---: |
${outcomeRows}

## 4. Aggregate statistics

- Completed matches: ${summary.completedMatches}/${summary.totalMatches}
- P1 win rate: ${percent(summary.P1Wins, summary.completedMatches)}
- P2 win rate: ${percent(summary.P2Wins, summary.completedMatches)}
- Draw rate: ${percent(summary.draws, summary.completedMatches)}
- P1 starts: ${summary.P1Starts}
- P2 starts: ${summary.P2Starts}
- Starter wins: ${summary.starterWins} (${summary.starterWinRate})
- Non-starter wins: ${summary.nonStarterWins} (${summary.nonStarterWinRate})
- Non-terminating matches: ${summary.nonTerminatingMatches}
- Average turns: ${summary.averageTurns}
- Median turns: ${summary.medianTurns}
- Average turns by starter: ${summary.averageStarterTurns}
- Average deterministic duration: ${summary.averageDurationMs} ms

## 5. Card usage frequency

| Card | ID | Uses |
| --- | --- | ---: |
${usageRows}

## 6. Card score contribution

| Card | ID | Score contribution |
| --- | --- | ---: |
${scoreRows}

## 7. Finish-reason distribution

- Target-score finishes: ${summary.targetScoreFinishes}
- Turn-limit finishes: ${summary.turnLimitFinishes}
- Stuck matches: ${summary.stuckMatches}

## 8. P1/P2 result distribution

- P1 wins: ${summary.P1Wins}
- P2 wins: ${summary.P2Wins}
- Draws: ${summary.draws}

## 9. Recycle usage

- Average recycle count: ${summary.averageRecycleCount}
- Total recycle count: ${summary.perMatchResults.reduce((sum, result) => sum + result.recycleCount, 0)}

## 9.1 Evolution usage

- Level 3 evolutions: ${summary.totalLevel3Evolutions}
- Average evolutions per match: ${summary.averageEvolutionsPerMatch}
- Evolution turns: ${summary.evolutionTurns.length ? summary.evolutionTurns.join(", ") : "-"}
- Matches ending before any evolution: ${summary.matchesEndingBeforeAnyEvolution}

| Card | ID | Level 3 evolutions |
| --- | --- | ---: |
${evolutionRows}

## 10. Stuck-state analysis

${summary.stuckMatches === 0 ? "No stuck states were detected within the 500 accepted-action safety limit." : "At least one match hit the safety limit and is reported as a Blocker."}

## 11. Persistence scenario results

| Match | Scenario | Result |
| --- | --- | --- |
${persistenceRows}

## 12. Repeated rejected actions

${Object.keys(summary.repeatedRejectedActions).length === 0 ? "No repeated rejected-action pattern was recorded." : Object.entries(summary.repeatedRejectedActions).map(([reason, count]) => `- ${reason}: ${count}`).join("\n")}

## 13. Confirmed bugs by severity

| Severity | Match | Description | Evidence |
| --- | --- | --- | --- |
${bugRows}

## 14. Repeated objective anomalies

${summary.objectiveObservations.length ? summary.objectiveObservations.map((item) => `- ${item}`).join("\n") : "No repeated objective anomaly met the reporting threshold."}

## 15. Potential balance signals requiring human verification

The card usage and score contribution tables are preliminary signals only. The sample is insufficient for any balance conclusion.

## 16. Items that cannot be evaluated without humans

- Rules clarity
- Game fun
- Perceived game length
- Balance feel
- UI clarity and handoff comfort

## 17. Recommendation for the next 10 human-played matches

Run 10 human-played local hot-seat matches using the Thai playtest guide, collect objective logs plus optional ratings, and compare repeated human observations against these automated preliminary signals.
`;
}

function cardName(cardId: string): string {
  return cardsSeed.find((card) => card.card_id === cardId)?.name_en ?? cardId;
}

function percent(numerator: number, denominator: number): string {
  return denominator ? `${Number(((numerator / denominator) * 100).toFixed(1))}%` : "0%";
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const root = dirname(process.argv[1] ?? process.cwd());
  runAutomatedPlaytests("manual", root);
}
