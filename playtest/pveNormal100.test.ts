import { describe, expect, it } from "vitest";
import { runPveNormal100 } from "./pveNormal100";

describe("PvE Normal 100-match simulation", () => {
  it("completes deterministic PvE matches and writes summary artifacts", () => {
    const summary = runPveNormal100();
    expect(summary.completedMatches).toBe(100);
    expect(summary.stuckMatches).toBe(0);
    expect(summary.invalidAiActions).toBe(0);
  }, 20000);
});

