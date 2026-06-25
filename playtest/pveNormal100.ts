import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Action, MatchState, PlayerId } from "../src/types/game";
import { chooseNormalAiAction, MAX_AI_ACTIONS_PER_TURN } from "../src/ai/normalAi";
import { createMatch } from "../src/engine/state/match";
import { dispatchAction } from "../src/engine/actions/reducer";
import { legalBeneficialActions } from "./automatedAuto10";

export interface PveNormal100Summary {
  schemaVersion: string;
  generatedAt: string;
  totalMatches: number;
  completedMatches: number;
  p1Wins: number;
  aiWins: number;
  draws: number;
  averageTurns: number;
  medianTurns: number;
  finishReasons: Record<string, number>;
  stuckMatches: number;
  invalidAiActions: number;
  aiActionLimitFallbacks: number;
  mostUsedAiCards: Record<string, number>;
  highestAiScoreContributionCards: Record<string, number>;
}

export function runPveNormal100(outputRoot = process.cwd()): PveNormal100Summary {
  const results = Array.from({ length: 100 }, (_, index) => runPveMatch(`pve-normal-${String(index + 1).padStart(3, "0")}`));
  const completed = results.filter((result) => result.completed);
  const turns = completed.map((result) => result.turns).sort((a, b) => a - b);
  const summary: PveNormal100Summary = {
    schemaVersion: "1",
    generatedAt: "2026-06-25T00:00:00.000+07:00",
    totalMatches: results.length,
    completedMatches: completed.length,
    p1Wins: completed.filter((result) => result.winner === "P1").length,
    aiWins: completed.filter((result) => result.winner === "P2").length,
    draws: completed.filter((result) => result.winner === "DRAW").length,
    averageTurns: average(turns),
    medianTurns: median(turns),
    finishReasons: countBy(completed.map((result) => result.finishReason ?? "UNKNOWN")),
    stuckMatches: results.filter((result) => result.stuck).length,
    invalidAiActions: results.reduce((sum, result) => sum + result.invalidAiActions, 0),
    aiActionLimitFallbacks: results.reduce((sum, result) => sum + result.aiActionLimitFallbacks, 0),
    mostUsedAiCards: mergeCounts(results.map((result) => result.aiCardUsage)),
    highestAiScoreContributionCards: mergeCounts(results.map((result) => result.aiCardUsage))
  };
  const resultsDir = join(outputRoot, "playtest-results");
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, "pve-normal-100-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(resultsDir, "pve-normal-100-report.md"), buildReport(summary));
  return summary;
}

function runPveMatch(seed: string) {
  let state = createMatch({ seed, gameMode: "PVE_NORMAL" });
  let accepted = 0;
  let invalidAiActions = 0;
  let aiActionLimitFallbacks = 0;
  const aiCardUsage: Record<string, number> = {};
  state = accept(state, { type: "START_MATCH", playerId: "P1", payload: { seed } });

  while (state.status !== "FINISHED" && accepted < 500) {
    while (state.status !== "FINISHED" && state.phase !== "ACTION") {
      state = accept(state, { type: "ADVANCE_PHASE", playerId: state.currentPlayerId, payload: {} });
      accepted += 1;
    }
    if (state.status === "FINISHED") break;
    if (state.currentPlayerId === "P1") {
      const actions = legalBeneficialActions(state, "P1", "score-priority");
      state = accept(state, actions[0] ?? { type: "END_TURN", playerId: "P1", payload: {} });
      accepted += 1;
      continue;
    }
    let aiActions = 0;
    while (state.status !== "FINISHED" && state.currentPlayerId === "P2" && state.phase === "ACTION") {
      const decision = chooseNormalAiAction({ state, playerId: "P2" });
      if (!decision || aiActions >= MAX_AI_ACTIONS_PER_TURN) {
        if (aiActions >= MAX_AI_ACTIONS_PER_TURN) aiActionLimitFallbacks += 1;
        state = accept(state, { type: "END_TURN", playerId: "P2", payload: {} });
        accepted += 1;
        break;
      }
      const before = state;
      const result = dispatchAction(state, { action: decision.action, timestamp: accepted });
      if (!result.validation.valid) {
        invalidAiActions += 1;
        state = accept(state, { type: "END_TURN", playerId: "P2", payload: {} });
        break;
      }
      state = result.state;
      accepted += 1;
      aiActions += 1;
      if (decision.action.type === "PLAY_CARD") {
        const cardId = before.cardsByInstanceId[decision.action.payload.cardInstanceId].definitionId;
        aiCardUsage[cardId] = (aiCardUsage[cardId] ?? 0) + 1;
      }
    }
  }

  return {
    completed: state.status === "FINISHED",
    stuck: state.status !== "FINISHED",
    winner: state.winner ?? "DRAW",
    finishReason: state.finishReason,
    turns: state.turnNumber,
    invalidAiActions,
    aiActionLimitFallbacks,
    aiCardUsage
  };
}

function accept(state: MatchState, action: Action): MatchState {
  return dispatchAction(state, { action, timestamp: state.actionLog.length + 1 }).state;
}

function average(values: number[]): number {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  return values[Math.floor(values.length / 2)];
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {});
}

function mergeCounts(maps: Array<Record<string, number>>): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map)) {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return Object.fromEntries(Object.entries(merged).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function buildReport(summary: PveNormal100Summary): string {
  return `# PvE Normal 100-Match Simulation

This deterministic simulation checks stability only. It is not human balance evidence.

- Completed matches: ${summary.completedMatches}/${summary.totalMatches}
- P1 wins: ${summary.p1Wins}
- AI wins: ${summary.aiWins}
- Draws: ${summary.draws}
- Average turns: ${summary.averageTurns}
- Median turns: ${summary.medianTurns}
- Stuck matches: ${summary.stuckMatches}
- Invalid AI actions: ${summary.invalidAiActions}
- AI action-limit fallbacks: ${summary.aiActionLimitFallbacks}
- Finish reasons: ${JSON.stringify(summary.finishReasons)}
`;
}

