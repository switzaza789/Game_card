import type { Action, MatchState, ValidationResult } from "../types/game";

export type HumanTurnDispatchResult = {
  state: MatchState;
  validation: ValidationResult;
};

export type HumanTurnControllerOptions = {
  getState: () => MatchState;
  dispatch: (action: Action) => HumanTurnDispatchResult;
};

export type HumanTurnControllerResult = {
  state: MatchState;
  advancedPhases: number;
  stoppedByRejection: boolean;
};

export function preparePveHumanTurnToAction(options: HumanTurnControllerOptions): HumanTurnControllerResult {
  let advancedPhases = 0;
  let stoppedByRejection = false;

  while (canPrepareHumanTurn(options.getState())) {
    const latest = options.getState();
    if (latest.phase === "ACTION") {
      break;
    }

    const result = options.dispatch({ type: "ADVANCE_PHASE", playerId: "P1", payload: {} });
    if (!result.validation.valid) {
      stoppedByRejection = true;
      return { state: result.state, advancedPhases, stoppedByRejection };
    }
    advancedPhases += 1;
  }

  return { state: options.getState(), advancedPhases, stoppedByRejection };
}

function canPrepareHumanTurn(state: MatchState): boolean {
  return state.status !== "FINISHED"
    && state.gameMode === "PVE_NORMAL"
    && state.currentPlayerId === "P1"
    && state.phase !== "ACTION"
    && (state.phase === "READY" || state.phase === "DRAW" || state.phase === "SCORE")
    && state.pregameStep === "COMPLETE";
}
