import type { ActionEnvelope, MatchState } from "../../types/game";
import { dispatchAction } from "../actions/reducer";
import { createMatch } from "../state/match";

export function replayFromActions(seed: string, actions: ActionEnvelope[], startingPlayerId?: "P1" | "P2"): MatchState {
  const initial = createMatch({ seed, startingPlayerId });
  const hasModernPregame = actions.some(
    (envelope) => envelope.action.type === "ACKNOWLEDGE_STARTER" || envelope.action.type === "DRAW_OPENING_CARD"
  );
  const replayInitial = hasModernPregame
    ? initial
    : {
        ...initial,
        pregameStep: "COMPLETE" as const,
        openingDrawPlayerId: initial.startingPlayerId,
        openingDrawRemaining: { P1: 0, P2: 0 } as Record<import("../../types/game").PlayerId, number>
      };
  return actions.reduce(
    (state, envelope) => dispatchAction(state, envelope).state,
    replayInitial
  );
}
