import { describe, expect, it } from "vitest";
import {
  aggregateResults,
  assertValidSerializableState,
  AUTO10_SEEDS,
  legalBeneficialActions,
  runAutomatedPlaytests,
  runOneMatch
} from "./automatedAuto10";
import { createMatch } from "../src/engine/state/match";
import { dispatchAction } from "../src/engine/actions/reducer";

describe("automated 10-match playtest runner", () => {
  it("uses exactly 10 distinct required seeds", () => {
    expect(AUTO10_SEEDS).toHaveLength(10);
    expect(new Set(AUTO10_SEEDS).size).toBe(10);
    expect(AUTO10_SEEDS[0]).toBe("automated-playtest-001");
    expect(AUTO10_SEEDS[9]).toBe("automated-playtest-010");
  });

  it("is deterministic for identical seed and strategy assignment", () => {
    const first = runOneMatch("automated-playtest-001", 1);
    const second = runOneMatch("automated-playtest-001", 1);
    expect(second).toEqual(first);
  });

  it("chooses actions from public state plus current player's hand", () => {
    const state = createMatch({ seed: "hidden-info-check" });
    const redacted = {
      ...state,
      players: {
        ...state.players,
        P2: {
          ...state.players.P2,
          hand: []
        }
      }
    };
    const actions = legalBeneficialActions(redacted, "P1", "score-priority");
    expect(actions.every((action) => action.playerId === "P1")).toBe(true);
  });

  it("preserves rejected action state and keeps it outside accepted statistics", () => {
    const state = createMatch({ seed: "rejected-check" });
    const result = dispatchAction(state, {
      action: { type: "RECYCLE", playerId: "P1", payload: { cardInstanceId: state.players.P1.hand[0] } },
      timestamp: 1
    });
    expect(result.validation.valid).toBe(false);
    expect(result.state.players.P1.recycleUsed).toBe(false);
  });

  it("asserts serializable valid match state", () => {
    expect(() => assertValidSerializableState(createMatch({ seed: "serializable" }))).not.toThrow();
  });

  it("aggregates completed match results and leaves human ratings unpopulated", () => {
    const result = runOneMatch("automated-playtest-002", 2);
    const summary = aggregateResults([result], "test-hash");
    expect(summary.testerType).toBe("AUTOMATED_AGENT");
    expect(summary.totalMatches).toBe(1);
    expect(JSON.stringify(summary)).not.toContain("rulesClarity");
    expect(JSON.stringify(summary)).not.toContain("gameFun");
  });

  it("runs the 500-action safety limit below the threshold for baseline matches", () => {
    const result = runOneMatch("automated-playtest-003", 3);
    expect(result.acceptedActions).toBeLessThanOrEqual(500);
    expect(result.stuck).toBe(false);
  });

  it("writes summary and report for all completed matches", () => {
    const summary = runAutomatedPlaytests(process.env.PLAYTEST_COMMIT_HASH ?? "test-hash");
    expect(summary.totalMatches).toBe(10);
    expect(summary.seeds).toEqual(AUTO10_SEEDS);
    expect(summary.perMatchResults.every((result) => result.completed)).toBe(true);
    expect(summary.perMatchResults.every((result) => result.winner)).toBe(true);
  });
});
