import type { ActionEnvelope, MatchState } from "../../types/game";
import { dispatchAction } from "../actions/reducer";
import { createMatch } from "../state/match";

export function replayFromActions(seed: string, actions: ActionEnvelope[], startingPlayerId?: "P1" | "P2"): MatchState {
  const initial = createMatch({ seed, startingPlayerId });
  const replayInitial = actions.some((envelope) => envelope.action.type === "ACKNOWLEDGE_STARTER")
    ? initial
    : { ...initial, pregameStep: "COMPLETE" as const };
  return actions.reduce(
    (state, envelope) => dispatchAction(state, envelope).state,
    replayInitial
  );
}
