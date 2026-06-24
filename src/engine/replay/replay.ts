import type { ActionEnvelope, MatchState } from "../../types/game";
import { dispatchAction } from "../actions/reducer";
import { createMatch } from "../state/match";

export function replayFromActions(seed: string, actions: ActionEnvelope[]): MatchState {
  return actions.reduce(
    (state, envelope) => dispatchAction(state, envelope).state,
    createMatch({ seed })
  );
}
