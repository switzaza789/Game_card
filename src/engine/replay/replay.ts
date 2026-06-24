import type { Action, MatchState } from "../../types/game";
import { dispatchAction } from "../actions/reducer";
import { createMatch } from "../state/match";

export function replayFromActions(seed: string, actions: Action[]): MatchState {
  return actions.reduce(
    (state, action) => dispatchAction(state, action).state,
    createMatch({ seed })
  );
}

