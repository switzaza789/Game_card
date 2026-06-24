import { describe, expect, it } from "vitest";
import { replayFromActions } from "./replay";

describe("replay", () => {
  it("replays action logs from a seed", () => {
    const state = replayFromActions("replay-seed", [
      {
        type: "ADVANCE_PHASE",
        playerId: "P1",
        payload: {}
      },
      {
        type: "ADVANCE_PHASE",
        playerId: "P1",
        payload: {}
      }
    ]);

    expect(state.phase).toBe("SCORE");
    expect(state.actionLog).toHaveLength(2);
  });
});
