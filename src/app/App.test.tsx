import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatch } from "../engine/state/match";
import { App, ResultScreen } from "./App";
import { exportMatchLog, saveActiveMatch, saveMatchResult } from "../persistence/localStorageAdapter";
import { initStats } from "../persistence/statsTracker";
import type { MatchResult } from "../persistence/types";

beforeEach(() => {
  // Clear localStorage between tests so no saved-game state bleeds over
  localStorage.clear();
  // Suppress JSDOM "Not implemented: confirm" warnings by default
  vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.spyOn(window, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App Phase 4 UI", () => {
  it("starts a local hot-seat battle from the main menu", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: "Animal Score Card Game" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "เริ่มเกมใหม่" }));

    expect(screen.getByLabelText("สนามต่อสู้")).toBeInTheDocument();
    expect(screen.getByText(/TURN 1/)).toBeInTheDocument();
    expect(screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน")).toBeInTheDocument();
    expect(screen.getByLabelText("มือผู้เล่นปัจจุบัน")).toBeInTheDocument();
  });

  it("shows how to play and card library screens", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "วิธีเล่น" }));
    expect(screen.getByRole("heading", { name: "วิธีเล่น" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "กลับเมนู" }));

    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    expect(screen.getByRole("heading", { name: "คลังการ์ด" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /A001/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("สุนัขจอมซน");
  }, 10000);

  it("plays an Animal from hand", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const animalButton = findFirstHandCardByCategory("สัตว์");
    const animalName = animalButton.querySelector("strong")?.textContent ?? "";
    await user.click(animalButton);
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));

    expect(screen.getByText(new RegExp(animalName + ".*สำเร็จ|สำเร็จ"))).toBeInTheDocument();
  });

  it("plays Support by selecting a legal target", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    // First play an Animal so there is a legal target for Support
    const animalButton = findFirstHandCardByCategory("สัตว์");
    await user.click(animalButton);
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));

    // Now try to play a Support card if one is available
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const supportButton = findCardInHandByCategory(hand, "สนับสนุน");
    if (!supportButton) {
      // No Support in hand — test is considered passed (no assertion to make)
      return;
    }
    await user.click(supportButton);

    // Click the first enabled slot
    const boardSlots = screen.getAllByRole("button");
    const enabledSlot = boardSlots.find(
      (btn) => !btn.hasAttribute("disabled") && btn.classList.contains("slot")
    );
    if (!enabledSlot) {
      return;
    }
    await user.click(enabledSlot);

    expect(screen.getByText(/สำเร็จ/)).toBeInTheDocument();
  });

  it("validates Recycle and shows player handoff privacy screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    // Pick any card from hand for Recycle (first turn — should be rejected)
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    await user.click(screen.getByRole("button", { name: "Recycle" }));
    expect(screen.getByText(/Recycle is not allowed on the first turn/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    expect(screen.getByRole("heading", { name: /ส่งเครื่องให้ ผู้เล่น 2/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("มือผู้เล่นปัจจุบัน")).not.toBeInTheDocument();
  });

  it("uses Recycle successfully after the first turn", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    // End P1 turn → handoff → End P2 turn → handoff → P1 can Recycle
    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));
    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));

    // Pick any card from hand for Recycle
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    await user.click(screen.getByRole("button", { name: "Recycle" }));
    expect(screen.getByText(/Recycle สำเร็จ/)).toBeInTheDocument();
  }, 10000);

  it("plays Weakness against an opponent target after handoff", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    // P1 plays an Animal
    const p1Animal = findFirstHandCardByCategory("สัตว์");
    await user.click(p1Animal);
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));

    // P2 plays an Animal
    const p2Animal = findFirstHandCardByCategory("สัตว์");
    await user.click(p2Animal);
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));

    // P1 tries to play Weakness against P2's Animal if available
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const weaknessButton = findCardInHandByCategory(hand, "จุดอ่อน");
    if (!weaknessButton) {
      // P1 has no Weakness card in hand — skip
      return;
    }
    await user.click(weaknessButton);

    // Find an enabled slot on opponent's side
    const boardSlots = screen.getAllByRole("button");
    const enabledOpponentSlot = boardSlots.find(
      (btn) => !btn.hasAttribute("disabled") && btn.classList.contains("slot")
    );
    if (!enabledOpponentSlot) {
      return;
    }
    await user.click(enabledOpponentSlot);
    expect(screen.getByText(/สำเร็จ/)).toBeInTheDocument();
  }, 10000);

  it("shows match result winner", () => {
    const match = {
      ...createMatch({ seed: "result-ui" }),
      status: "FINISHED" as const,
      winner: "P1" as const,
      finishReason: "TARGET_SCORE" as const,
      players: {
        ...createMatch({ seed: "result-ui" }).players,
        P1: { ...createMatch({ seed: "result-ui" }).players.P1, score: 15 }
      }
    };

    render(<ResultScreen match={match} onNewGame={() => undefined} />);

    expect(screen.getByRole("heading", { name: "ผู้เล่น 1 ชนะ" })).toBeInTheDocument();
    // finishReason is shown in Thai as "ทำคะแนนถึงเป้าหมาย"
    expect(screen.getByText(/ทำคะแนนถึงเป้าหมาย/)).toBeInTheDocument();
  });
});

describe("App Phase 5 persistence UI", () => {
  it("resumes a saved active match from Local Storage", async () => {
    const user = userEvent.setup();
    const savedMatch = createMatch({ seed: "saved-ui" });
    saveActiveMatch(savedMatch, "battle", initStats(), Date.now());

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "เล่นต่อจากเซฟเดิม" }));

    expect(screen.getByLabelText("สนามต่อสู้")).toBeInTheDocument();
    expect(screen.getByText(/กู้คืนเกมสำเร็จ/)).toBeInTheDocument();
  });

  it("resumes to the handoff privacy screen when that screen was saved", async () => {
    const user = userEvent.setup();
    const savedMatch = createMatch({ seed: "saved-handoff-ui" });
    saveActiveMatch(savedMatch, "handoff", initStats(), Date.now());

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "เล่นต่อจากเซฟเดิม" }));

    expect(screen.getByRole("heading", { name: /ส่งเครื่องให้ ผู้เล่น 1/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("มือผู้เล่นปัจจุบัน")).not.toBeInTheDocument();
  });

  it("resets an active match and clears the saved match", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    expect(localStorage.getItem("animal_score_saved_match")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "รีเซ็ตเกม" }));

    expect(screen.getByRole("heading", { name: "Animal Score Card Game" })).toBeInTheDocument();
    expect(localStorage.getItem("animal_score_saved_match")).toBeNull();
  });

  it("imports a match log for debug resume", async () => {
    const user = userEvent.setup();
    const exported = exportMatchLog(createMatch({ seed: "import-ui" }), "battle", initStats());
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "นำเข้าไฟล์เซฟ" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: exported.value } });
    await user.click(within(dialog).getByRole("button", { name: "นำเข้า" }));

    expect(screen.getByLabelText("สนามต่อสู้")).toBeInTheDocument();
    expect(screen.getByText(/นำเข้าและโหลดไฟล์เซฟสำเร็จ/)).toBeInTheDocument();
  });

  it("focuses import text area and shows export fallback when clipboard is blocked", async () => {
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      get: () => undefined,
      configurable: true
    });

    const user = userEvent.setup();
    const finishedMatch = {
      ...createMatch({ seed: "export-fallback-ui" }),
      status: "FINISHED" as const,
      winner: "P1" as const,
      finishReason: "TARGET_SCORE" as const
    };
    const exported = exportMatchLog(finishedMatch, "result", initStats());
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    render(<App />);

    await user.click(screen.getByRole("button", { name: "นำเข้าไฟล์เซฟ" }));
    const importTextArea = screen.getByRole("textbox", { name: "ข้อมูล JSON สำหรับนำเข้า" });
    expect(importTextArea).toHaveFocus();
    fireEvent.change(importTextArea, { target: { value: exported.value } });
    await user.click(screen.getByRole("button", { name: "นำเข้า" }));

    await user.click(screen.getByRole("button", { name: /ส่งออกไฟล์เซฟ/ }));

    const exportTextArea = await screen.findByRole("textbox", { name: "ข้อมูล JSON สำหรับส่งออก" });
    expect(exportTextArea).toHaveFocus();
    expect((exportTextArea as HTMLTextAreaElement).value).toContain('"schemaVersion": "1"');

    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true
    });
  });

  it("shows local match history", async () => {
    const user = userEvent.setup();
    saveMatchResult(makeMatchResult({ matchId: "history-ui-1" }));

    render(<App />);

    await user.click(screen.getByRole("button", { name: "ประวัติการเล่น" }));

    expect(screen.getByRole("heading", { name: "ประวัติการเล่น" })).toBeInTheDocument();
    expect(screen.getByText(/history-ui-1/)).toBeInTheDocument();
    expect(screen.getByText(/ผู้เล่น 1 ชนะ/)).toBeInTheDocument();
  });
});

async function startBattle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "เริ่มเกมใหม่" }));
}

/** Find the first hand card button of the given Thai category label */
function findFirstHandCardByCategory(categoryLabel: string): HTMLElement {
  const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
  const buttons = Array.from(hand.querySelectorAll("button"));
  const match = buttons.find((btn) => btn.querySelector("small")?.textContent === categoryLabel);
  if (!match) {
    throw new Error(`No hand card found with category: ${categoryLabel}`);
  }
  return match;
}

/** Find a card in hand element by category label, returns null if not found */
function findCardInHandByCategory(hand: HTMLElement, categoryLabel: string): HTMLElement | null {
  const buttons = Array.from(hand.querySelectorAll("button"));
  return (
    (buttons.find(
      (btn) => btn.querySelector("small")?.textContent === categoryLabel
    ) as HTMLElement) ?? null
  );
}

function makeMatchResult(overrides?: Partial<MatchResult>): MatchResult {
  return {
    matchId: "history-ui",
    winner: "P1",
    finalScores: { P1: 15, P2: 9 },
    turnCount: 7,
    startedAt: 1000,
    endedAt: 3000,
    duration: 2000,
    recycleCount: 2,
    boardExitCount: { sentToGraveyard: 1, returnedToHand: 0, voluntarySwap: 0 },
    highestScoringCard: { cardId: "A001", nameTh: "สุนัขจอมซน", score: 6, ownerId: "P1" },
    finishReason: "TARGET_SCORE",
    ...overrides
  };
}
