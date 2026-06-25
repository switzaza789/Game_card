import { describe, expect, it } from "vitest";
import type { Action, MatchState } from "../types/game";
import { runPveNormalAiTurn } from "../ai/aiTurnController";
import { dispatchAction, forcePhase } from "../engine/actions/reducer";
import { createMatch } from "../engine/state/match";
import { preparePveHumanTurnToAction } from "./pveHumanTurnController";

describe("PvE human turn preparation", () => {
  it("advances AI-to-P1 handoff through READY, DRAW, SCORE, ACTION exactly once", () => {
    let state = forcePhase(createMatch({ seed: "pve-human-ready", gameMode: "PVE_NORMAL" }), "ACTION");
    const actions: Action[] = [];

    for (let cycle = 0; cycle < 3; cycle += 1) {
      state = dispatch(state, { type: "END_TURN", playerId: "P1", payload: {} }, actions);
      state = runAi(state, actions);
      expect(state.currentPlayerId).toBe("P1");
      expect(state.phase).toBe("READY");

      const handBefore = state.players.P1.hand.length;
      const scoreBefore = state.players.P1.score;
      const logBefore = state.actionLog.length;
      state = prepareHuman(state, actions);
      const prepLogs = state.actionLog.slice(logBefore);

      expect(prepLogs.map((entry) => entry.action.type)).toEqual(["ADVANCE_PHASE", "ADVANCE_PHASE", "ADVANCE_PHASE"]);
      expect(prepLogs.every((entry) => entry.validation.valid)).toBe(true);
      expect(state.currentPlayerId).toBe("P1");
      expect(state.phase).toBe("ACTION");
      expect(state.players.P1.hand.length).toBe(Math.min(handBefore + 1, 7));
      expect(state.players.P1.score).toBeGreaterThanOrEqual(scoreBefore);

      const animalId = state.players.P1.hand.find((id) => state.cardsByInstanceId[id].definitionId.startsWith("A"));
      if (animalId) {
        state = dispatch(state, { type: "PLAY_CARD", playerId: "P1", payload: { cardInstanceId: animalId } }, actions);
        expect(state.actionLog[state.actionLog.length - 1].validation.valid).toBe(true);
      }
    }

    expect(state.actionLog.some((entry) => entry.action.type === "PLAY_CARD" && !entry.validation.valid)).toBe(false);
    expect(state.actionLog.some((entry) => entry.action.type === "ADVANCE_PHASE" && !entry.validation.valid)).toBe(false);
  });

  it("resumes from P1 DRAW or SCORE without restarting READY effects", () => {
    let drawState: MatchState = { ...forcePhase(createMatch({ seed: "resume-p1-draw", gameMode: "PVE_NORMAL" }), "DRAW"), currentPlayerId: "P1", turnNumber: 2 };
    const drawHandBefore = drawState.players.P1.hand.length;
    drawState = prepareHuman(drawState, []);
    expect(drawState.phase).toBe("ACTION");
    expect(drawState.players.P1.hand.length).toBe(drawHandBefore);

    let scoreState: MatchState = { ...forcePhase(createMatch({ seed: "resume-p1-score", gameMode: "PVE_NORMAL" }), "SCORE"), currentPlayerId: "P1", turnNumber: 2 };
    const scoreHandBefore = scoreState.players.P1.hand.length;
    scoreState = prepareHuman(scoreState, []);
    expect(scoreState.phase).toBe("ACTION");
    expect(scoreState.players.P1.hand.length).toBe(scoreHandBefore);
  });

  it("does nothing for Local PvP and P1 ACTION", () => {
    const local = forcePhase(createMatch({ seed: "local-no-prep", gameMode: "LOCAL_PVP" }), "READY");
    expect(prepareHuman(local, [])).toBe(local);

    const action = forcePhase(createMatch({ seed: "action-no-prep", gameMode: "PVE_NORMAL" }), "ACTION");
    expect(prepareHuman(action, [])).toBe(action);
  });
});

function runAi(initialState: MatchState, actions: Action[]): MatchState {
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

function prepareHuman(initialState: MatchState, actions: Action[]): MatchState {
  let state = initialState;
  return preparePveHumanTurnToAction({
    getState: () => state,
    dispatch: (action) => {
      actions.push(action);
      const result = dispatchAction(state, { action, timestamp: actions.length });
      state = result.state;
      return result;
    }
  }).state;
}

function dispatch(state: MatchState, action: Action, actions: Action[]): MatchState {
  actions.push(action);
  return dispatchAction(state, { action, timestamp: actions.length }).state;
}
