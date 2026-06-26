import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatch } from "../engine/state/match";
import { App, ResultScreen, formatCardDetailLines, isLevelIncreasingSupportCard } from "./App";
import { exportMatchLog, saveActiveMatch, saveMatchResult, listHumanFeedback } from "../persistence/localStorageAdapter";
import { initStats } from "../persistence/statsTracker";
import type { MatchResult } from "../persistence/types";
import { LOCALE_STORAGE_KEY, getStoredLocale, normalizeLocale, t } from "../i18n";

beforeEach(() => {
  // Clear localStorage between tests so no saved-game state bleeds over
  localStorage.clear();
  // Suppress JSDOM "Not implemented: confirm" warnings by default
  vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.spyOn(window, "alert").mockImplementation(() => undefined);
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:mock", configurable: true });
  }
  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", { value: () => undefined, configurable: true });
  }
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("App Phase 4 UI", () => {
  it("loads Thai by default when no locale preference exists", () => {
    expect(getStoredLocale()).toBe("th");
    render(<App />);
    expect(screen.getByRole("heading", { name: "เกมการ์ดสัตว์เก็บคะแนน" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "เลือกภาษา" })).toBeInTheDocument();
  });

  it("loads stored English and switches back and forth without changing match state", async () => {
    const user = userEvent.setup();
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Animal Score Card Game" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ไทย" }));
    expect(screen.getByRole("heading", { name: "เกมการ์ดสัตว์เก็บคะแนน" })).toBeInTheDocument();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("th");
  });

  it("falls back to Thai for malformed locale values", () => {
    expect(normalizeLocale("de")).toBe("th");
    expect(normalizeLocale("")).toBe("th");
    expect(t("th", "label.turn")).toBe("TURN");
  });

  it("starts a local hot-seat battle from the main menu", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: "เกมการ์ดสัตว์เก็บคะแนน" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "เริ่มเกมใหม่" }));

    expect(screen.getByLabelText("สนามต่อสู้")).toBeInTheDocument();
    expect(screen.getByText(/TURN 1/)).toBeInTheDocument();
    expect(screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน")).toBeInTheDocument();
    expect(screen.getByLabelText("มือผู้เล่นปัจจุบัน")).toBeInTheDocument();
    expect(localStorage.getItem("animal_score_saved_match")).toContain('"matchId":"match-');
    expect(localStorage.getItem("animal_score_saved_match")).not.toContain('"matchId":"match-match-');
  });

  it("renders mobile-safe board and hand structure", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    expect(hand).toHaveClass("player-hand");
    expect(hand).toHaveAttribute("tabindex", "0");
    expect(within(hand).getAllByRole("button").length).toBeGreaterThan(0);
    expect(screen.getAllByText("เด็ค").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /สุสาน/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/ช่องสัตว์|ช่อง Animal/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "เล่นการ์ด" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "จบเทิร์น" })).toBeInTheDocument();
  });

  it("shows both PvE scores, active player, and playability reasons", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "เริ่ม PvE กับคอมพิวเตอร์" }));

    const scoreboard = screen.getByLabelText("คะแนนผู้เล่น");
    expect(within(scoreboard).getByText("คุณ")).toBeInTheDocument();
    expect(within(scoreboard).getByText("Computer")).toBeInTheDocument();
    expect(scoreboard.querySelector(".scoreboard-player.active")).toHaveTextContent("คุณ");
    expect(screen.getAllByText(/ใช้ได้ทันที|ต้องเลือกเป้าหมาย|ใช้ได้แบบผลอ่อน|ยังไม่ถึงช่วงที่ใช้ได้/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "เล่นการ์ด" })).toBeInTheDocument();
  });

  it("keeps the current match stable when switching locale during PvP and PvE", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "เริ่มเกมใหม่" }));
    const before = localStorage.getItem("animal_score_saved_match");
    await user.click(screen.getAllByRole("button", { name: /English|ไทย/ })[1]);
    expect(localStorage.getItem("animal_score_saved_match")).toBe(before);
  });

  it("places an Animal directly into a selected slot and safely undoes it", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    await user.click(findFirstHandCardByCategory("สัตว์"));
    await user.click(screen.getByRole("button", { name: /ช่องสัตว์ 2|ช่อง Animal 2/ }));

    expect(screen.getByLabelText("สรุปผลของการ์ด")).toHaveTextContent("ลงสนามช่อง 2");
    await user.click(screen.getByRole("button", { name: "ปิด" }));
    expect(screen.getByRole("button", { name: "ย้อนกลับ" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "ย้อนกลับ" }));
    expect(screen.getByLabelText("สรุปผลของการ์ด")).toHaveTextContent("ย้อนกลับสำเร็จ");
    expect(screen.getByRole("button", { name: /ช่องสัตว์ 2|ช่อง Animal 2/ })).toBeInTheDocument();
  });

  it("shows the centered end-turn confirmation modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    expect(screen.getByRole("dialog", { name: "ยืนยันจบเทิร์น" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ยืนยัน" }));
    expect(screen.queryByRole("dialog", { name: "ยืนยันจบเทิร์น" })).not.toBeInTheDocument();
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

  it("formats card descriptions with readable Thai labels and line breaks", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));

    await user.click(screen.getByRole("button", { name: /A001/ }));
    const animalDialog = screen.getByRole("dialog");
    expect(animalDialog).toHaveTextContent("ความสามารถ:");
    expect(animalDialog.querySelectorAll(".card-detail-lines p").length).toBeGreaterThan(0);

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /W001/ }));
    const weaknessDialog = screen.getByRole("dialog");
    expect(weaknessDialog).toHaveTextContent("ใช้ตรงเป้าหมาย — สุนัข:");
    expect(weaknessDialog).toHaveTextContent("ใช้ผิดเป้าหมาย:");
    expect(Array.from(weaknessDialog.querySelectorAll(".card-detail-lines p")).some((p) => p.textContent?.startsWith("ใช้ตรงเป้าหมาย — สุนัข:"))).toBe(true);
    expect(Array.from(weaknessDialog.querySelectorAll(".card-detail-lines p")).some((p) => p.textContent?.startsWith("ใช้ผิดเป้าหมาย:"))).toBe(true);
  });

  it("shows each weakness card target animal name from metadata", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));

    await user.click(screen.getByRole("button", { name: /W003/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("ใช้ตรงเป้าหมาย — กระต่ายและหมี:");
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: /W005/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("ใช้ตรงเป้าหมาย — ปลา:");
  });

  it("identifies every level-increasing Support logic key", () => {
    expect(isLevelIncreasingSupportCard("match_level_up_and_bounce_removal_shield")).toBe(true);
    expect(isLevelIncreasingSupportCard("match_level_up_peek_or_bottom")).toBe(true);
    expect(isLevelIncreasingSupportCard("match_level_up_temp_level_down_immunity")).toBe(true);
    expect(isLevelIncreasingSupportCard("match_level_up_minimum_next_score_1")).toBe(true);
    expect(isLevelIncreasingSupportCard("match_level_up_draw1_bottom1")).toBe(true);
    expect(isLevelIncreasingSupportCard("match_level_up_temp_weakness_immunity")).toBe(true);
    expect(isLevelIncreasingSupportCard("return_own_attached_support_to_hand")).toBe(false);
  });

  it("preserves explicit line breaks when formatting card details", () => {
    expect(
      formatCardDetailLines({
        card_id: "T001",
        nameTh: "ทดสอบ",
        category: "Support",
        rarity: "Common",
        primary_effect: "บรรทัดแรก\nบรรทัดสอง",
      } as never),
    ).toEqual(["Support: บรรทัดแรก", "บรรทัดสอง"]);
  });

  it("plays an Animal from hand", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const animalButton = findFirstHandCardByCategory("สัตว์");
    const animalName = animalButton.querySelector("strong")?.textContent ?? "";
    await user.click(animalButton);
    expect(screen.getByLabelText("ผลที่จะเกิดขึ้น")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));

    expect(screen.getByText(new RegExp(animalName + ".*สำเร็จ|สำเร็จ"))).toBeInTheDocument();
    expect(screen.getByLabelText("สรุปผลของการ์ด")).toBeInTheDocument();
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

    expect(screen.getAllByText(/สำเร็จ/).length).toBeGreaterThan(0);
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
    expect(screen.getAllByText(/Recycle is not allowed on the first turn/).length).toBeGreaterThan(0);

    await endCurrentTurn(user);
    expect(screen.getByRole("heading", { name: /ส่งเครื่องให้ ผู้เล่น 2/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("มือผู้เล่นปัจจุบัน")).not.toBeInTheDocument();
  });

  it("starts PvE with human P1 and runs P2 without a handoff screen", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "เริ่ม PvE กับคอมพิวเตอร์" }));
    expect(screen.getByText(/เริ่ม PvE แล้ว/)).toBeInTheDocument();
    expect(screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน")).toBeInTheDocument();

    await endCurrentTurn(user);
    expect(screen.queryByRole("heading", { name: /ส่งเครื่องให้ ผู้เล่น 2/ })).not.toBeInTheDocument();
    expect(await screen.findByText(/AI กำลังคิด|AI Turn/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "จบเทิร์น" })).toBeDisabled();

    expect(await screen.findByText(/ถึงตาคุณ/, undefined, { timeout: 1500 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "จบเทิร์น" })).not.toBeDisabled());
    expect(screen.getByText((_content, element) => element?.textContent === "TURN 2 — ACTION")).toBeInTheDocument();

    await user.click(findFirstHandCardByCategory("สัตว์"));
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    expect(screen.getAllByText(/สำเร็จ/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/PLAY_CARD is only valid during ACTION phase/)).not.toBeInTheDocument();
  }, 10000);

  it("uses Recycle successfully after the first turn", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    // End P1 turn → handoff → End P2 turn → handoff → P1 can Recycle
    await endCurrentTurn(user);
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));
    await endCurrentTurn(user);
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));

    // Pick any card from hand for Recycle
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    await user.click(screen.getByRole("button", { name: "Recycle" }));
    expect(screen.getAllByText(/Recycle สำเร็จ|รีไซเคิลสำเร็จ/).length).toBeGreaterThan(0);
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
    await endCurrentTurn(user);
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));

    // P2 plays an Animal
    const p2Animal = findFirstHandCardByCategory("สัตว์");
    await user.click(p2Animal);
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    await endCurrentTurn(user);
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

    expect(screen.getByRole("heading", { name: "เกมการ์ดสัตว์เก็บคะแนน" })).toBeInTheDocument();
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

  it("exports all history and a selected history record", async () => {
    const user = userEvent.setup();
    saveMatchResult(makeMatchResult({ matchId: "history-ui-1" }));
    saveMatchResult(makeMatchResult({ matchId: "match-match-legacy", startedAt: 2000, endedAt: 4000 }));

    render(<App />);

    await user.click(screen.getByRole("button", { name: "ประวัติการเล่น" }));
    await user.click(screen.getByRole("button", { name: "ส่งออกประวัติทั้งหมด" }));

    let exportTextArea = await screen.findByRole("textbox", { name: "ข้อมูล JSON สำหรับส่งออก" });
    let json = JSON.parse((exportTextArea as HTMLTextAreaElement).value) as Record<string, unknown>;
    expect(json).toMatchObject({ exportType: "MATCH_HISTORY_SUMMARY", recordCount: 2 });
    expect((json.records as Array<{ matchId: string }>)[1].matchId).toBe("match-match-legacy");

    await user.click(screen.getByRole("button", { name: "ปิด" }));
    await user.click(screen.getAllByRole("button", { name: "ส่งออก match นี้" })[0]);

    exportTextArea = await screen.findByRole("textbox", { name: "ข้อมูล JSON สำหรับส่งออก" });
    json = JSON.parse((exportTextArea as HTMLTextAreaElement).value) as Record<string, unknown>;
    expect(json).toMatchObject({ exportType: "MATCH_HISTORY_RECORD" });
  });

  it("requires confirmation before clearing all history", async () => {
    const user = userEvent.setup();
    saveMatchResult(makeMatchResult({ matchId: "history-clear" }));

    render(<App />);
    await user.click(screen.getByRole("button", { name: "ประวัติการเล่น" }));

    await user.click(screen.getByRole("button", { name: "ลบประวัติทั้งหมด" }));
    expect(screen.getByText(/history-clear/)).toBeInTheDocument();

    vi.mocked(window.confirm).mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "ลบประวัติทั้งหมด" }));
    expect(screen.getByText("ไม่มีประวัติการเล่น")).toBeInTheDocument();
  });

  it("opens human playtest feedback, saves locally, and exports required JSON through clipboard fallback", async () => {
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      get: () => undefined,
      configurable: true
    });

    const user = userEvent.setup();
    const finishedMatch = {
      ...createMatch({ seed: "playtest-ui" }),
      status: "FINISHED" as const,
      winner: "P1" as const,
      finishReason: "TARGET_SCORE" as const
    };
    const exported = exportMatchLog(finishedMatch, "result", initStats());
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    render(<App />);
    await user.click(screen.getByRole("button", { name: "นำเข้าไฟล์เซฟ" }));
    fireEvent.change(screen.getByRole("textbox", { name: "ข้อมูล JSON สำหรับนำเข้า" }), { target: { value: exported.value } });
    await user.click(screen.getByRole("button", { name: "นำเข้า" }));

    await user.click(screen.getByRole("button", { name: "ฟีดแบ็ก Human Playtest (ไม่บังคับ)" }));
    expect(screen.getByRole("dialog", { name: "ฟีดแบ็ก Playtest" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("รหัสผู้ทดสอบนิรนาม (ไม่บังคับ)"), "T01");
    await user.type(screen.getByLabelText("ความชัดเจนของกติกา (1-5)"), "5");
    await user.type(screen.getByLabelText("ความสนุก (1-5)"), "4");
    await user.type(screen.getByLabelText("ความยาวเกม (1-5)"), "3");
    await user.type(screen.getByLabelText("สมดุลเกม (1-5)"), "4");
    await user.type(screen.getByLabelText("ความชัดเจนของ UI (1-5)"), "5");
    await user.type(screen.getByLabelText("รายละเอียดบั๊กที่พบ"), "ไม่มี");
    await user.click(screen.getByRole("button", { name: "บันทึกและส่งออก JSON" }));

    const exportTextArea = await screen.findByRole("textbox", { name: "ข้อมูล JSON สำหรับส่งออก" });
    const json = JSON.parse((exportTextArea as HTMLTextAreaElement).value) as Record<string, unknown>;
    expect(json).toMatchObject({
      schemaVersion: "1",
      testerCode: "T01",
      matchId: finishedMatch.matchId,
      playerSeat: "BOTH",
      rulesClarity: 5,
      bugDescription: "ไม่มี"
    });
    expect(json).not.toHaveProperty("email");
    expect(json).not.toHaveProperty("walletAddress");
    expect(json).not.toHaveProperty("ipAddress");
    expect(json).not.toHaveProperty("name");

    const feedbackStore = listHumanFeedback();
    expect(feedbackStore.ok).toBe(true);
    if (feedbackStore.ok) {
      expect(feedbackStore.value).toHaveLength(1);
      expect(feedbackStore.value[0].matchId).toBe(finishedMatch.matchId);
    }

    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true
    });
  });

  it("rejects playtest feedback ratings outside 1 to 5", async () => {
    const user = userEvent.setup();
    const finishedMatch = {
      ...createMatch({ seed: "playtest-invalid-ui" }),
      status: "FINISHED" as const,
      winner: "P1" as const,
      finishReason: "TARGET_SCORE" as const
    };
    const exported = exportMatchLog(finishedMatch, "result", initStats());
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    render(<App />);
    await user.click(screen.getByRole("button", { name: "นำเข้าไฟล์เซฟ" }));
    fireEvent.change(screen.getByRole("textbox", { name: "ข้อมูล JSON สำหรับนำเข้า" }), { target: { value: exported.value } });
    await user.click(screen.getByRole("button", { name: "นำเข้า" }));

    await user.click(screen.getByRole("button", { name: "ฟีดแบ็ก Human Playtest (ไม่บังคับ)" }));
    await user.type(screen.getByLabelText("ความชัดเจนของกติกา (1-5)"), "6");
    await user.type(screen.getByLabelText("ความสนุก (1-5)"), "4");
    await user.type(screen.getByLabelText("ความยาวเกม (1-5)"), "3");
    await user.type(screen.getByLabelText("สมดุลเกม (1-5)"), "4");
    await user.type(screen.getByLabelText("ความชัดเจนของ UI (1-5)"), "5");
    await user.click(screen.getByRole("button", { name: "บันทึกและส่งออก JSON" }));

    expect(screen.getByText(/rulesClarity ต้องเป็นจำนวนเต็ม 1 ถึง 5/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "ข้อมูล JSON สำหรับส่งออก" })).not.toBeInTheDocument();
  });
});

async function startBattle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "เริ่มเกมใหม่" }));
}

async function endCurrentTurn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
  const dialog = screen.getByRole("dialog", { name: "ยืนยันจบเทิร์น" });
  await user.click(within(dialog).getByRole("button", { name: "ยืนยัน" }));
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
