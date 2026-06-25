import { describe, expect, it } from "vitest";
import type { Action, MatchState } from "../types/game";
import { dispatchAction, forcePhase } from "../engine/actions/reducer";
import { createMatch } from "../engine/state/match";
import { runPveNormalAiTurn } from "./aiTurnController";

describe("PvE AI turn controller", () => {
  it("ends each AI turn once and returns control to playable P1 cycles", () => {
    let state = forcePhase(createMatch({ seed: "pve-duplicate-end-turn", gameMode: "PVE_NORMAL" }), "ACTION");
    const actions: Action[] = [];

    for (let cycle = 0; cycle < 3; cycle += 1) {
      state = dispatch(state, { type: "END_TURN", playerId: "P1", payload: {} }, actions);
      const beforeSeq = state.actionLog.length;
      state = runController(state, actions);
      const aiLogs = state.actionLog.slice(beforeSeq).filter((entry) => entry.actor === "P2");
      const aiEndTurns = aiLogs.filter((entry) => entry.action.type === "END_TURN");

      expect(aiEndTurns).toHaveLength(1);
      expect(aiEndTurns[0].validation.valid).toBe(true);
      expect(aiLogs.some((entry) => entry.action.type === "END_TURN" && !entry.validation.valid)).toBe(false);
      expect(state.currentPlayerId).toBe("P1");
      expect(state.phase).toBe("READY");

      state = advanceToAction(state, actions);
      const animalId = state.players.P1.hand.find((id) => state.cardsByInstanceId[id].definitionId.startsWith("A"));
      if (animalId) {
        const result = dispatchAction(state, {
          action: { type: "PLAY_CARD", playerId: "P1", payload: { cardInstanceId: animalId } },
          timestamp: actions.length + 1
        });
        if (result.validation.valid) state = result.state;
      }
      expect(state.currentPlayerId).toBe("P1");
      expect(state.phase).toBe("ACTION");
    }

    const rejectedEndTurns = state.actionLog.filter((entry) => entry.action.type === "END_TURN" && !entry.validation.valid);
    expect(rejectedEndTurns).toHaveLength(0);
  });

  it("does not dispatch from a stale callback after ownership changes to P1", () => {
    let state = forcePhase(createMatch({ seed: "stale-ai-callback", gameMode: "PVE_NORMAL" }), "ACTION");
    state = { ...state, currentPlayerId: "P1" };
    const actions: Action[] = [];
    const result = runPveNormalAiTurn({
      getState: () => state,
      dispatch: (action) => {
        actions.push(action);
        const dispatched = dispatchAction(state, { action, timestamp: actions.length });
        state = dispatched.state;
        return dispatched;
      }
    });

    expect(result.endedTurn).toBe(false);
    expect(actions).toHaveLength(0);
  });

  it("action-limit fallback dispatches exactly one END_TURN", () => {
    let state: MatchState = { ...forcePhase(createMatch({ seed: "ai-action-limit", gameMode: "PVE_NORMAL" }), "ACTION"), currentPlayerId: "P2" };
    const actions: Action[] = [];
    const result = runPveNormalAiTurn({
      getState: () => state,
      maxActions: 0,
      dispatch: (action) => {
        actions.push(action);
        const dispatched = dispatchAction(state, { action, timestamp: actions.length });
        state = dispatched.state;
        return dispatched;
      }
    });

    expect(result.actionLimitFallback).toBe(true);
    expect(actions.filter((action) => action.type === "END_TURN")).toHaveLength(1);
    expect(state.currentPlayerId).toBe("P1");
  });
});

function runController(initialState: MatchState, actions: Action[]): MatchState {
  let state = initialState;
  return runPveNormalAiTurn({
    getState: () => state,
    dispatch: (action) => {
      actions.push(action);
      const result = dispatchAction(state, { action, timestamp: actions.length });
      state = result.state;
      return result;
    }
  }).state;
}

function advanceToAction(initialState: MatchState, actions: Action[]): MatchState {
  let state = initialState;
  while (state.status !== "FINISHED" && state.phase !== "ACTION") {
    state = dispatch(state, { type: "ADVANCE_PHASE", playerId: state.currentPlayerId, payload: {} }, actions);
  }
  return state;
}

function dispatch(state: MatchState, action: Action, actions: Action[]): MatchState {
  actions.push(action);
  return dispatchAction(state, { action, timestamp: actions.length }).state;
}
