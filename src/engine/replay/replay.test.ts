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
    ]);

    expect(state.phase).toBe("SCORE");
    expect(state.actionLog).toHaveLength(2);
  });
});
