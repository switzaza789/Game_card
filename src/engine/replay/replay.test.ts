import { describe, expect, it } from "vitest";
import { replayFromActions } from "./replay";

describe("replay", () => {
  it("replays action logs from a seed", () => {
    const state = replayFromActions("replay-seed", [
      {
        action: {
          type: "ADVANCE_PHASE",
          playerId: "P1",
          payload: {}
        },
        timestamp: 1000
      },
      {
        action: {
          type: "ADVANCE_PHASE",
          playerId: "P1",
          payload: {}
        },
        timestamp: 1001
      }
    ], "P1");

    expect(state.phase).toBe("SCORE");
    expect(state.actionLog).toHaveLength(2);
  });

  it("preserves starter reveal acknowledgement in modern replays", () => {
    const state = replayFromActions("modern-replay-seed", [
      {
        action: {
          type: "ACKNOWLEDGE_STARTER",
          playerId: "P2",
          payload: {}
        },
        timestamp: 1000
      }
    ], "P2");

    expect(state.startingPlayerId).toBe("P2");
    expect(state.currentPlayerId).toBe("P2");
    expect(state.pregameStep).toBe("COMPLETE");
    expect(state.phase).toBe("ACTION");
    expect(state.actionLog).toHaveLength(1);
  });

  it("does not reroll or block legacy replays without starter acknowledgement", () => {
    const state = replayFromActions("legacy-replay-seed", [
      {
        action: {
          type: "ADVANCE_PHASE",
          playerId: "P1",
          payload: {}
        },
        timestamp: 1000
      }
    ], "P1");

    expect(state.startingPlayerId).toBe("P1");
    expect(state.pregameStep).toBe("COMPLETE");
    expect(state.phase).toBe("DRAW");
    expect(state.actionLog).toHaveLength(1);
  });
});
