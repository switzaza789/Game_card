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
    expect(state.pregameStep).toBe("OPENING_DRAW");
    expect(state.phase).toBe("READY");
    expect(state.openingDrawPlayerId).toBe("P2");
    expect(state.openingDrawRemaining).toEqual({ P1: 5, P2: 5 });
    expect(state.actionLog).toHaveLength(1);
  });

  it("replays opening draw deterministically", () => {
    const actions = [
      { action: { type: "ACKNOWLEDGE_STARTER" as const, playerId: "P2" as const, payload: {} }, timestamp: 1001 },
      { action: { type: "DRAW_OPENING_CARD" as const, playerId: "P2" as const, payload: {} }, timestamp: 1002 },
      { action: { type: "DRAW_OPENING_CARD" as const, playerId: "P2" as const, payload: {} }, timestamp: 1003 },
      { action: { type: "DRAW_OPENING_CARD" as const, playerId: "P2" as const, payload: {} }, timestamp: 1004 },
      { action: { type: "DRAW_OPENING_CARD" as const, playerId: "P2" as const, payload: {} }, timestamp: 1005 },
      { action: { type: "DRAW_OPENING_CARD" as const, playerId: "P2" as const, payload: {} }, timestamp: 1006 },
      { action: { type: "DRAW_OPENING_CARD" as const, playerId: "P1" as const, payload: {} }, timestamp: 1007 },
      { action: { type: "DRAW_OPENING_CARD" as const, playerId: "P1" as const, payload: {} }, timestamp: 1008 }
    ];
    const a = replayFromActions("replay-od", actions, "P2");
    const b = replayFromActions("replay-od", actions, "P2");
    expect(a.players.P1.hand).toEqual(b.players.P1.hand);
    expect(a.players.P2.hand).toEqual(b.players.P2.hand);
    expect(a.startingPlayerId).toBe(b.startingPlayerId);
    expect(a.pregameStep).toBe("OPENING_DRAW");
    expect(a.players.P2.hand).toHaveLength(5);
    expect(a.players.P1.hand).toHaveLength(2);
  });

  it("rejects duplicate or invalid opening draw action in replay", () => {
    const actions = [
      { action: { type: "ACKNOWLEDGE_STARTER" as const, playerId: "P2" as const, payload: {} }, timestamp: 1000 },
      { action: { type: "DRAW_OPENING_CARD" as const, playerId: "P2" as const, payload: {} }, timestamp: 1001 },
      { action: { type: "DRAW_OPENING_CARD" as const, playerId: "P2" as const, payload: {} }, timestamp: 1002 }
    ];
    const state = replayFromActions("replay-reject-od", actions, "P2");
    expect(state.pregameStep).toBe("OPENING_DRAW");
    expect(state.players.P2.hand).toHaveLength(2);
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
