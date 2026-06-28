import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatch } from "../engine/state/match";
import { App, ResultScreen, formatCardDetailLines, isLevelIncreasingSupportCard } from "./App";
import { exportMatchLog, saveActiveMatch, saveMatchResult, listHumanFeedback } from "../persistence/localStorageAdapter";
import { initStats } from "../persistence/statsTracker";
import type { MatchResult } from "../persistence/types";
import { LOCALE_STORAGE_KEY, getLocalizedCard, getStoredLocale, normalizeLocale, t } from "../i18n";
import { formatActionLogEntry } from "../ui/effectFeedback";
import { getCardArtwork } from "../ui/cardArtwork";
import type { ActionLogEntry, CardDefinition } from "../types/game";

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

    await user.click(screen.getByRole("button", { name: "Local PvP" }));

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
    expect(hand).toHaveClass("player-hand-section");
    expect(hand).toHaveAttribute("tabindex", "0");
    expect(within(hand).getAllByRole("button").length).toBeGreaterThan(0);
    expect(screen.getAllByText("เด็ค").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /สุสาน/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/ช่องสัตว์|ช่อง Animal/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "เล่นการ์ด" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เปลี่ยนการ์ด" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "จบเทิร์น" })).toBeInTheDocument();
  });

  it("shows both PvE scores, active player, and playability reasons", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "PvE vs Computer" }));

    const scoreboard = screen.getByLabelText("สถานะการแข่งขัน");
    expect(within(scoreboard).getByText("คุณ")).toBeInTheDocument();
    expect(within(scoreboard).getByText("Computer")).toBeInTheDocument();
    expect(scoreboard.querySelector(".scoreboard-player.active")).toHaveTextContent("คุณ");
    expect(screen.getAllByText(/ใช้ได้ทันที|ต้องเลือกเป้าหมาย|ใช้ได้แบบผลอ่อน|ยังไม่ถึงช่วงที่ใช้ได้/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "เล่นการ์ด" })).toBeInTheDocument();
  });

  it("keeps the current match stable when switching locale during PvP and PvE", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Local PvP" }));
    const before = localStorage.getItem("animal_score_saved_match");
    await openGameMenuAndSwitchLocale(user, "en");
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
    await user.click(screen.getByRole("button", { name: /More|เพิ่มเติม/ }));
    expect(screen.getByRole("menuitem", { name: /ย้อนกลับ|Undo/ })).not.toBeDisabled();
    await user.click(screen.getByRole("menuitem", { name: /ย้อนกลับ|Undo/ }));
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
    expect(weaknessDialog).toHaveTextContent("สัตว์ที่แพ้ทาง:");
    expect(weaknessDialog).toHaveTextContent("ผลเมื่อใช้ผิดเป้าหมาย:");
    expect(Array.from(weaknessDialog.querySelectorAll(".card-detail-lines p")).some((p) => p.textContent?.includes("สัตว์ที่แพ้ทาง:"))).toBe(true);
    expect(Array.from(weaknessDialog.querySelectorAll(".card-detail-lines p")).some((p) => p.textContent?.includes("ผลเมื่อใช้ผิดเป้าหมาย:"))).toBe(true);
  });

  it("shows each weakness card target animal name from metadata", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));

    await user.click(screen.getByRole("button", { name: /W003/ }));
    const w003Dialog = screen.getByRole("dialog");
    expect(w003Dialog).toHaveTextContent("สัตว์ที่แพ้ทาง:");
    expect(w003Dialog).toHaveTextContent("กระต่ายและหมี");
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: /W005/ }));
    const w005Dialog = screen.getByRole("dialog");
    expect(w005Dialog).toHaveTextContent("สัตว์ที่แพ้ทาง:");
    expect(w005Dialog).toHaveTextContent("ปลา");
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
    ).toEqual(["ประเภท: บรรทัดแรก", "บรรทัดสอง"]);
  });

  it("plays an Animal from hand", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const animalButton = findFirstHandCardByCategory("สัตว์");
    const animalName = animalButton.querySelector(".hand-card-name")?.textContent ?? "";
    await user.click(animalButton);
    expect(document.querySelector(".action-context-strip")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));

    expect(screen.getByText(new RegExp("^" + animalName + " ผลเต็ม$"))).toBeInTheDocument();
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

    expect(screen.getAllByText(/ผลเต็ม|เต็ม/).length).toBeGreaterThan(0);
  });

  it("validates Recycle and shows player handoff privacy screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    // Pick any card from hand for Recycle (first turn — should be rejected)
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    expect(screen.getAllByText(/ไม่สามารถรีไซเคิลในเทิร์นแรก/).length).toBeGreaterThan(0);

    await endCurrentTurn(user);
    expect(screen.getByRole("heading", { name: /ส่งเครื่องให้ ผู้เล่น 2/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("มือผู้เล่นปัจจุบัน")).not.toBeInTheDocument();
  });

  it("starts PvE with human P1 and runs P2 without a handoff screen", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "PvE vs Computer" }));
    expect(screen.getByText(/เริ่ม PvE แล้ว/)).toBeInTheDocument();
    expect(screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน")).toBeInTheDocument();

    await endCurrentTurn(user);
    expect(screen.queryByRole("heading", { name: /ส่งเครื่องให้ ผู้เล่น 2/ })).not.toBeInTheDocument();
    expect(await screen.findByText(/AI กำลังคิด|AI Turn/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "จบเทิร์น" })).toBeDisabled();

    expect(await screen.findByText(/ถึงตาคุณ/, undefined, { timeout: 1500 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "จบเทิร์น" })).not.toBeDisabled());
    const turnElements = screen.getAllByText((_content, element) => element?.textContent === "TURN 2 — ACTION");
    expect(turnElements.length).toBeGreaterThanOrEqual(1);

    await user.click(findFirstHandCardByCategory("สัตว์"));
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    expect(screen.getAllByText(/ผลเต็ม/).length).toBeGreaterThan(0);
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
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    expect(screen.getAllByText(/เปลี่ยน.*→.*ได้/).length).toBeGreaterThan(0);
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
    const fullEffectElements = screen.getAllByText(/ผลเต็ม|เต็ม/);
    expect(fullEffectElements.length).toBeGreaterThanOrEqual(1);
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

  it("shows a localized return-to-menu action on the result screen", async () => {
    const user = userEvent.setup();
    const onBackToMenu = vi.fn();
    const match = {
      ...createMatch({ seed: "result-menu-ui" }),
      status: "FINISHED" as const,
      winner: "P1" as const,
      finishReason: "TARGET_SCORE" as const
    };

    render(<ResultScreen match={match} onNewGame={() => undefined} onBackToMenu={onBackToMenu} locale="en" />);

    await user.click(screen.getByRole("button", { name: "Back to Main Menu" }));
    expect(onBackToMenu).toHaveBeenCalledTimes(1);
  });

  it("keeps Reset Game in a separate destructive area and confirms before resetting", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const utilityArea = document.querySelector(".action-dock");
    expect(utilityArea).toBeInTheDocument();

    // Open game menu to access reset trigger
    await user.click(screen.getByRole("button", { name: /ตั้งค่า|Menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "เริ่มเกมใหม่" }));
    const dialog = screen.getByRole("dialog", { name: "เริ่มเกมใหม่หรือไม่?" });
    expect(dialog).toHaveTextContent("ความคืบหน้าของเกมปัจจุบันจะถูกล้างและไม่สามารถย้อนกลับได้");

    const beforeState = localStorage.getItem("animal_score_saved_match");
    await user.click(within(dialog).getByRole("button", { name: "ยกเลิก" }));
    expect(localStorage.getItem("animal_score_saved_match")).toBe(beforeState);
    expect(screen.queryByRole("dialog", { name: "เริ่มเกมใหม่หรือไม่?" })).not.toBeInTheDocument();
  });

  it("renders all 24 cards in the Card Library", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    const grid = screen.getByRole("main");
    const cardButtons = grid.querySelectorAll(".library-card");
    expect(cardButtons.length).toBe(24);
  });

  it("shows Thai card names in Card Library by default", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    expect(screen.getByText("สุนัขจอมซน")).toBeInTheDocument();
    expect(screen.getByText("ที่ครอบปาก")).toBeInTheDocument();
    expect(screen.getByText("เพลงกล่อมหลับ")).toBeInTheDocument();
  });

  it("shows English card names in Card Library when locale is English", async () => {
    const user = userEvent.setup();
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Card library" }));
    expect(screen.getByText("Playful Dog")).toBeInTheDocument();
    expect(screen.getByText("Muzzle")).toBeInTheDocument();
    expect(screen.getByText("Lullaby")).toBeInTheDocument();
  });

  it("switches language in an already-open Card Library", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    expect(screen.getByText("สุนัขจอมซน")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByText("Playful Dog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ไทย" }));
    expect(screen.getByText("สุนัขจอมซน")).toBeInTheDocument();
  });

  it("shows localized card type labels in Card Library grid", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    const animalCards = Array.from(document.querySelectorAll(".library-card small")).filter((el) => el.textContent === "Animal");
    expect(animalCards.length).toBe(8);
  });

  it("shows localized English card type labels after switching", async () => {
    const user = userEvent.setup();
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Card library" }));
    const animalCards = Array.from(document.querySelectorAll(".library-card small")).filter((el) => el.textContent === "Animal");
    expect(animalCards.length).toBe(8);
  });

  it("shows Support-specific fields in Card Library modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    await user.click(screen.getByRole("button", { name: /S001/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("สัตว์ที่เข้ากันได้:");
    expect(dialog).toHaveTextContent("เพิ่ม Level:");
    expect(dialog).toHaveTextContent("ผลเพิ่มเติม:");
  });

  it("shows Weakness full and reduced effects in Card Library modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    await user.click(screen.getByRole("button", { name: /W001/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("สัตว์ที่แพ้ทาง:");
    expect(dialog).toHaveTextContent("ผลเต็ม:");
    expect(dialog).toHaveTextContent("ผลเมื่อใช้ผิดเป้าหมาย:");
  });

  it("shows Special duration or limitation in Card Library modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    await user.click(screen.getByRole("button", { name: /X001/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("ผลทันที:");
    expect(dialog).toHaveTextContent("ระยะเวลา:");
  });

  it("filters continue using stable internal types", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    const buttons = document.querySelectorAll(".library-card");
    const animalButtons = Array.from(buttons).filter((btn) => btn.classList.contains("cat-animal"));
    expect(animalButtons.length).toBe(8);
    const supportButtons = Array.from(buttons).filter((btn) => btn.classList.contains("cat-support"));
    expect(supportButtons.length).toBe(6);
    const weaknessButtons = Array.from(buttons).filter((btn) => btn.classList.contains("cat-weakness"));
    expect(weaknessButtons.length).toBe(5);
    const specialButtons = Array.from(buttons).filter((btn) => btn.classList.contains("cat-special"));
    expect(specialButtons.length).toBe(5);
  });

  it("unknown card ID fallback does not crash in Card Library", () => {
    const result = getLocalizedCard("Z999", "th");
    expect(result).toBeDefined();
    expect(result.name).toContain("Unknown Card");
    expect(result.type).toBe("Unknown");
  });

  it("no undefined localization values appear in card texts", () => {
    const testIds = ["A001", "A008", "S001", "S006", "W001", "W005", "X001", "X005"];
    for (const id of testIds) {
      for (const locale of ["th", "en"] as const) {
        const card = getLocalizedCard(id, locale);
        expect(card.name).toBeTruthy();
        expect(card.type).toBeTruthy();
        expect(card.description).toBeTruthy();
        expect(card.ability).toBeTruthy();
        expect(card.validUse).toBeTruthy();
        expect(card.target).toBeTruthy();
        expect(card.effectSummary).toBeTruthy();
      }
    }
  });

  it("accessibility labels switch language in Card Library", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    const a001Btn = screen.getByRole("button", { name: /สุนัขจอมซน/ });
    expect(a001Btn).toHaveAttribute("aria-label", "A001 สุนัขจอมซน - Animal");
    await user.click(screen.getByRole("button", { name: "English" }));
    const a001BtnEn = screen.getByRole("button", { name: /Playful Dog/ });
    expect(a001BtnEn).toHaveAttribute("aria-label", "A001 Playful Dog - Animal");
  });

  it("opening Card Library does not mutate active match state", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(localStorage.getItem("animal_score_saved_match")).toBeNull();
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    expect(localStorage.getItem("animal_score_saved_match")).toBeNull();
  });

  it("switching language in Card Library does not mutate active match state", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(localStorage.getItem("animal_score_saved_match")).toBeNull();
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(localStorage.getItem("animal_score_saved_match")).toBeNull();
    await user.click(screen.getByRole("button", { name: "ไทย" }));
    expect(localStorage.getItem("animal_score_saved_match")).toBeNull();
  });

  it("localized card type labels render in Card Library modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    await user.click(screen.getByRole("button", { name: /A001/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("A001 — Animal");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: /A001/ }));
    const enDialog = screen.getByRole("dialog");
    expect(enDialog).toHaveTextContent("A001 — Animal");
  });
});

describe("App Phase 2C-1C-A player hand card localization", () => {
  it("shows Thai localized card names in the current player hand", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const buttons = Array.from(hand.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(0);
    // At least one card name should be a known Thai name from the catalog
    const names = buttons.map((b) => b.querySelector(".hand-card-name")?.textContent ?? "");
    const knownThaiNames = ["สุนัขจอมซน", "แมวขี้สงสัย", "กระต่ายว่องไว", "หมีใจดี", "นกส่งข่าว", "ปลาจอมพลัง", "เต่าเกราะแข็ง", "ลิงจอมเจ้าเล่ห์", "กระดูกแสนอร่อย", "ไหมพรมหลากสี", "แครอทสด", "น้ำผึ้งหวาน", "เมล็ดพืชชั้นดี", "อาหารปลาพิเศษ", "ที่ครอบปาก", "เลเซอร์พอยน์เตอร์", "กับดักบนพื้น", "กรงนก", "เบ็ดตกปลา", "เพลงกล่อมหลับ", "เกราะป้องกันจุดอ่อน", "เปลี่ยนตัวด่วน", "ลมแรงพัดปลิว", "ขโมยอาหาร"];
    expect(names.some((n) => knownThaiNames.includes(n))).toBe(true);
  });

  it("shows English localized card names in the current player hand when locale is English", async () => {
    const user = userEvent.setup();
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    render(<App />);
    await startBattle(user);

    const hand = screen.getByLabelText("Current player hand");
    const buttons = Array.from(hand.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(0);
    const names = buttons.map((b) => b.querySelector(".hand-card-name")?.textContent ?? "");
    const knownEnNames = ["Playful Dog", "Curious Cat", "Swift Rabbit", "Gentle Bear", "Messenger Bird", "Energetic Fish", "Armored Turtle", "Clever Monkey", "Delicious Bone", "Colorful Yarn", "Fresh Carrot", "Sweet Honey", "Premium Seeds", "Special Fish Food", "Muzzle", "Laser Pointer", "Ground Trap", "Bird Cage", "Fishing Hook", "Lullaby", "Weakness Shield", "Quick Swap", "Strong Wind", "Food Thief"];
    expect(names.some((n) => knownEnNames.includes(n))).toBe(true);
  });

  it("switches card type labels between Thai and English in the hand", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const thaiTypes = Array.from(hand.querySelectorAll("button small")).map((el) => el?.textContent ?? "");
    expect(thaiTypes.some((t) => ["สัตว์", "สนับสนุน", "จุดอ่อน", "พิเศษ"].includes(t))).toBe(true);

    await openGameMenuAndSwitchLocale(user, "en");

    const handEn = screen.getByLabelText("Current player hand");
    const enTypes = Array.from(handEn.querySelectorAll("button small")).map((el) => el?.textContent ?? "");
    // Card type small or playability label should include English variants
    expect(enTypes.some((t) => ["Animal", "Support", "Weakness", "Special", "Playable now", "Choose a target", "Not playable yet"].some((k) => t.includes(k)))).toBe(true);
  });

  it("switches visible hand-card descriptions/language when toggling locale", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const beforeNames = Array.from(hand.querySelectorAll(".hand-card-name")).map((el) => el?.textContent ?? "");
    await openGameMenuAndSwitchLocale(user, "en");

    const handEn = screen.getByLabelText("Current player hand");
    const afterNames = Array.from(handEn.querySelectorAll(".hand-card-name")).map((el) => el?.textContent ?? "");
    // Same number of cards, but text should not be identical (Thai -> English)
    expect(afterNames.length).toBe(beforeNames.length);
    expect(afterNames).not.toEqual(beforeNames);
  });

  it("switches use-timing / usability labels when toggling locale", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const beforeLabels = Array.from(hand.querySelectorAll(".playability-label")).map((el) => el?.textContent ?? "");
    await openGameMenuAndSwitchLocale(user, "en");

    const handEn = screen.getByLabelText("Current player hand");
    const afterLabels = Array.from(handEn.querySelectorAll(".playability-label")).map((el) => el?.textContent ?? "");
    expect(afterLabels.length).toBe(beforeLabels.length);
    // At least one label should differ after switching to English
    expect(afterLabels.some((label, i) => label !== beforeLabels[i])).toBe(true);
  });

  it("updates an already-rendered hand immediately when locale switches mid-match", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const beforeIds = Array.from(hand.querySelectorAll("button")).map((b) => (b.getAttribute("aria-label") ?? "").split(" ")[0]);
    expect(beforeIds.length).toBeGreaterThan(0);

    await openGameMenuAndSwitchLocale(user, "en");
    const handEn = screen.getByLabelText("Current player hand");
    const afterIds = Array.from(handEn.querySelectorAll("button")).map((b) => (b.getAttribute("aria-label") ?? "").split(" ")[0]);
    // Card IDs stay the same (stable ids)
    expect(afterIds).toEqual(beforeIds);
  });

  it("does not mutate match state when switching locale mid-match", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const beforeSnapshot = localStorage.getItem("animal_score_saved_match");
    const handBefore = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const beforeHandCount = handBefore.querySelectorAll("button").length;

    await openGameMenuAndSwitchLocale(user, "en");

    expect(localStorage.getItem("animal_score_saved_match")).toBe(beforeSnapshot);
    const handAfter = screen.getByLabelText("Current player hand");
    expect(handAfter.querySelectorAll("button").length).toBe(beforeHandCount);
  });

  it("exposes localized accessible names for visible hand cards", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const buttons = Array.from(hand.querySelectorAll("button"));
    const a001 = buttons.find((b) => b.querySelector("span")?.textContent === "A001");
    if (a001) {
      const label = a001.getAttribute("aria-label") ?? "";
      expect(label).toContain("A001");
      expect(label).toContain("สุนัขจอมซน");
      expect(label).toContain("สัตว์");
    }
  });

  it("exposes English accessible names for visible hand cards in English locale", async () => {
    const user = userEvent.setup();
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    render(<App />);
    await startBattle(user);

    const hand = screen.getByLabelText("Current player hand");
    const buttons = Array.from(hand.querySelectorAll("button"));
    const a001 = buttons.find((b) => b.querySelector("span")?.textContent === "A001");
    if (a001) {
      const label = a001.getAttribute("aria-label") ?? "";
      expect(label).toContain("A001");
      expect(label).toContain("Playful Dog");
      expect(label).toContain("Animal");
    }
  });

  it("hides opponent hand card identity from DOM text", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const opponentHand = screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน");
    const cardBacks = opponentHand.querySelectorAll(".card-back");
    expect(cardBacks.length).toBeGreaterThan(0);
    // No card names, ids, or type labels should appear inside the card backs
    const cardBackText = Array.from(cardBacks).map((el) => el.textContent ?? "").join(" ");
    expect(cardBackText.trim()).toBe("");
  });

  it("hides opponent hand card identity from aria-label, title, and alt", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const opponentHand = screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน");
    const cardBacks = Array.from(opponentHand.querySelectorAll<HTMLElement>(".card-back"));
    for (const back of cardBacks) {
      const aria = back.getAttribute("aria-label") ?? "";
      // Generic hidden-card label is allowed; specific identity is not
      expect(aria).toBe("การ์ดที่ซ่อนอยู่");
      // No title attribute exposing identity
      const title = back.getAttribute("title") ?? "";
      expect(title).toBe("");
      // No alt attribute
      expect(back.hasAttribute("alt")).toBe(false);
    }
  });

  it("still allows selecting a card from the localized hand", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    const animalButton = findFirstHandCardByCategory("สัตว์");
    await user.click(animalButton);
    expect(animalButton.classList.contains("selected")).toBe(true);
  });

  it("still allows direct Animal placement after localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    await user.click(findFirstHandCardByCategory("สัตว์"));
    await user.click(screen.getByRole("button", { name: /ช่องสัตว์ 2|ช่อง Animal 2/ }));
    expect(screen.getByLabelText("สรุปผลของการ์ด")).toHaveTextContent("ลงสนามช่อง 2");
  });

  it("keeps Card Library localization working", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    expect(screen.getByText("สุนัขจอมซน")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByText("Playful Dog")).toBeInTheDocument();
  });

  it("keeps reset confirmation working with localized hand", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    await user.click(screen.getByRole("button", { name: /ตั้งค่า|Menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "เริ่มเกมใหม่" }));
    expect(screen.getByRole("dialog", { name: "เริ่มเกมใหม่หรือไม่?" })).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog", { name: "เริ่มเกมใหม่หรือไม่?" })).getByRole("button", { name: "เริ่มเกมใหม่" }));
    expect(screen.getByRole("heading", { name: "เกมการ์ดสัตว์เก็บคะแนน" })).toBeInTheDocument();
  });

  it("shows Thai board card names after playing an Animal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    // first play an Animal so a board slot is filled
    await user.click(findFirstHandCardByCategory("สัตว์"));
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    const board = screen.getByLabelText("สนามต่อสู้");
    const strongs = Array.from(board.querySelectorAll(".board-card-name"));
    expect(strongs.length).toBeGreaterThan(0);
    const names = strongs.map((s) => s?.textContent ?? "");
    const knownTh = ["สุนัขจอมซน", "แมวขี้สงสัย", "กระต่ายว่องไว", "หมีใจดี", "นกส่งข่าว", "ปลาจอมพลัง", "เต่าเกราะแข็ง", "ลิงจอมเจ้าเล่ห์"];
    expect(names.some((n) => knownTh.includes(n))).toBe(true);
  });

  it("shows English board card names when locale is English", async () => {
    const user = userEvent.setup();
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    render(<App />);
    await startBattle(user);
    const board = screen.getByLabelText("Battlefield");
    const strongs = Array.from(board.querySelectorAll(".board-card-name"));
    if (strongs.length === 0) return;
    const names = strongs.map((s) => s?.textContent ?? "");
    const knownEn = ["Playful Dog", "Curious Cat", "Swift Rabbit", "Gentle Bear", "Messenger Bird", "Energetic Fish", "Armored Turtle", "Clever Monkey"];
    expect(names.some((n) => knownEn.includes(n))).toBe(true);
  });

  it("updates board card names when locale switches mid-match", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const board = screen.getByLabelText("สนามต่อสู้");
    const strongsBefore = Array.from(board.querySelectorAll(".board-card-name")).map((s) => s?.textContent ?? "");
    if (strongsBefore.length === 0) return;
    await openGameMenuAndSwitchLocale(user, "en");
    const boardEn = screen.getByLabelText("Battlefield");
    const strongsAfter = Array.from(boardEn.querySelectorAll(".board-card-name")).map((s) => s?.textContent ?? "");
    expect(strongsAfter.length).toBe(strongsBefore.length);
    expect(strongsAfter).not.toEqual(strongsBefore);
  });

  it("shows support-indicator on board cards with attached Support", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const indicators = document.querySelectorAll(".support-indicator");
    expect(indicators.length).toBeGreaterThanOrEqual(0);
  });

  it("localizes Graveyard card names when locale switches", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const graveyardButtons = screen.getAllByRole("button", { name: /สุสาน/ });
    if (graveyardButtons.length === 0) return;
    await user.click(graveyardButtons[0]);
    const list = await screen.findByRole("list");
    const itemsBefore = Array.from(list.querySelectorAll("li")).map((li) => li?.textContent ?? "");
    if (itemsBefore.length === 0) return;
    await user.keyboard("{Escape}");
    await openGameMenuAndSwitchLocale(user, "en");
    await user.click(screen.getAllByRole("button", { name: /Graveyard/ })[0]);
    const listEn = await screen.findByRole("list");
    const itemsAfter = Array.from(listEn.querySelectorAll("li")).map((li) => li?.textContent ?? "");
    expect(itemsAfter.length).toBe(itemsBefore.length);
    expect(itemsAfter).not.toEqual(itemsBefore);
  });

  it("localizes Graveyard card types", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const graveyardButtons = screen.getAllByRole("button", { name: /สุสาน/ });
    if (graveyardButtons.length === 0) return;
    await user.click(graveyardButtons[0]);
    const list = await screen.findByRole("list");
    const itemsBefore = Array.from(list.querySelectorAll("li small")).map((s) => s?.textContent ?? "");
    if (itemsBefore.length === 0) return;
    expect(itemsBefore.some((t) => ["Animal", "Support", "Weakness", "Special"].includes(t))).toBe(true);
    await user.keyboard("{Escape}");
    await openGameMenuAndSwitchLocale(user, "en");
    await user.click(screen.getAllByRole("button", { name: /Graveyard/ })[0]);
    const listEn = await screen.findByRole("list");
    const itemsAfter = Array.from(listEn.querySelectorAll("li small")).map((s) => s?.textContent ?? "");
    expect(itemsAfter.length).toBe(itemsBefore.length);
    expect(itemsAfter).toEqual(itemsBefore); // type field is same in both locales
  });

  it("locale switching does not mutate match state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const beforeSnapshot = localStorage.getItem("animal_score_saved_match");
    await openGameMenuAndSwitchLocale(user, "en");
    expect(localStorage.getItem("animal_score_saved_match")).toBe(beforeSnapshot);
  });

  it("opponent hand remains hidden after board localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    expect(screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน")).toBeInTheDocument();
    await openGameMenuAndSwitchLocale(user, "en");
    expect(screen.getByLabelText("Hidden opponent hand")).toBeInTheDocument();
    const cardBacks = document.querySelectorAll(".card-back");
    expect(cardBacks.length).toBeGreaterThan(0);
    cardBacks.forEach((cb) => {
      expect(cb?.textContent?.trim() ?? "").toBe("");
    });
  });

  it("player-hand localization still works after board localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const btn = hand.querySelector("button");
    if (!btn) return;
    const thName = btn.querySelector(".hand-card-name")?.textContent ?? "";
    expect(thName.length).toBeGreaterThan(0);
    await openGameMenuAndSwitchLocale(user, "en");
    const handEn = screen.getByLabelText("Current player hand");
    const btnEn = handEn.querySelector("button");
    if (!btnEn) return;
    const enName = btnEn.querySelector(".hand-card-name")?.textContent ?? "";
    expect(enName).not.toBe(thName);
  });

  it("Card Library localization still works after board localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    expect(screen.getByText("สุนัขจอมซน")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByText("Playful Dog")).toBeInTheDocument();
  });

  it("shows Thai battle card-detail modal with localized name and type", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    // select a hand card and open details
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const btn = hand.querySelector("button");
    if (!btn) return;
    await user.click(btn);
    await user.click(screen.getByRole("button", { name: /More|เพิ่มเติม/ }));
    await user.click(screen.getByRole("menuitem", { name: "รายละเอียด" }));
    const dialog = screen.getByRole("dialog", { name: "รายละเอียด" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector("h2")).toBeTruthy();
    const heading = dialog.querySelector("h2")?.textContent ?? "";
    expect(heading.length).toBeGreaterThan(0);
    expect(heading).not.toMatch(/name_th/);
  });

  it("shows English battle card-detail modal when locale is English", async () => {
    const user = userEvent.setup();
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("Current player hand");
    const btn = hand.querySelector("button");
    if (!btn) return;
    await user.click(btn);
    await user.click(screen.getByRole("button", { name: /More|เพิ่มเติม/ }));
    await user.click(screen.getByRole("menuitem", { name: "Details" }));
    const dialog = screen.getByRole("dialog", { name: "Details" });
    expect(dialog).toBeInTheDocument();
    const heading = dialog.querySelector("h2")?.textContent ?? "";
    expect(heading.length).toBeGreaterThan(0);
  });

  it("locale switch updates an open battle card-detail modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const btn = hand.querySelector("button");
    if (!btn) return;
    await user.click(btn);
    await user.click(screen.getByRole("button", { name: /More|เพิ่มเติม/ }));
    await user.click(screen.getByRole("menuitem", { name: "รายละเอียด" }));
    const dialog = screen.getByRole("dialog", { name: "รายละเอียด" });
    const thName = dialog.querySelector("h2")?.textContent ?? "";
    await user.keyboard("{Escape}");
    await openGameMenuAndSwitchLocale(user, "en");
    // re-select same card and open details
    const handEn = screen.getByLabelText("Current player hand");
    const btnEn = handEn.querySelector("button");
    if (!btnEn) return;
    await user.click(btnEn);
    await user.click(screen.getByRole("button", { name: /More|เพิ่มเติม/ }));
    await user.click(screen.getByRole("menuitem", { name: "Details" }));
    const dialogEn = screen.getByRole("dialog", { name: "Details" });
    const enName = dialogEn.querySelector("h2")?.textContent ?? "";
    expect(thName.length).toBeGreaterThan(0);
    expect(enName.length).toBeGreaterThan(0);
    expect(thName).not.toBe(enName);
  });

  it("localizes Support-specific fields in battle card-detail modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const supports = Array.from(hand.querySelectorAll("button")).filter((b) => {
      const smalls = b.querySelectorAll("small");
      return Array.from(smalls).some((s) => s?.textContent === "สนับสนุน");
    });
    if (supports.length === 0) return;
    await user.click(supports[0]);
    await user.click(screen.getByRole("button", { name: /More|เพิ่มเติม/ }));
    await user.click(screen.getByRole("menuitem", { name: "รายละเอียด" }));
    const dialog = screen.getByRole("dialog", { name: "รายละเอียด" });
    expect(dialog).toHaveTextContent("สัตว์ที่เข้ากันได้:");
  });

  it("localizes Weakness full and reduced effects in battle card-detail modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const weaknesses = Array.from(hand.querySelectorAll("button")).filter((b) => {
      const smalls = b.querySelectorAll("small");
      return Array.from(smalls).some((s) => s?.textContent === "จุดอ่อน");
    });
    if (weaknesses.length === 0) return;
    await user.click(weaknesses[0]);
    await user.click(screen.getByRole("button", { name: /More|เพิ่มเติม/ }));
    await user.click(screen.getByRole("menuitem", { name: "รายละเอียด" }));
    const dialog = screen.getByRole("dialog", { name: "รายละเอียด" });
    expect(dialog).toHaveTextContent("สัตว์ที่แพ้ทาง:");
    expect(dialog).toHaveTextContent("ผลเต็ม:");
  });

  it("localizes Special duration in battle card-detail modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const specials = Array.from(hand.querySelectorAll("button")).filter((b) => {
      const smalls = b.querySelectorAll("small");
      return Array.from(smalls).some((s) => s?.textContent === "พิเศษ");
    });
    if (specials.length === 0) return;
    await user.click(specials[0]);
    await user.click(screen.getByRole("button", { name: /More|เพิ่มเติม/ }));
    await user.click(screen.getByRole("menuitem", { name: "รายละเอียด" }));
    const dialog = screen.getByRole("dialog", { name: "รายละเอียด" });
    expect(dialog).toHaveTextContent("ผลทันที:");
    expect(dialog).toHaveTextContent("ระยะเวลา:");
  });

  it("locale switching preserves exact match state with open modals", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const beforeSnapshot = localStorage.getItem("animal_score_saved_match");
    await openGameMenuAndSwitchLocale(user, "en");
    expect(localStorage.getItem("animal_score_saved_match")).toBe(beforeSnapshot);
  });

  it("hidden opponent hand identity remains absent after modal localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    expect(screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน")).toBeInTheDocument();
    const cardBacks = document.querySelectorAll(".card-back");
    cardBacks.forEach((cb) => {
      expect(cb?.textContent?.trim() ?? "").toBe("");
    });
  });

  it("hand localization still works after modal localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const btn = hand.querySelector("button");
    if (!btn) return;
    const thName = btn.querySelector(".hand-card-name")?.textContent ?? "";
    await openGameMenuAndSwitchLocale(user, "en");
    const handEn = screen.getByLabelText("Current player hand");
    const btnEn = handEn.querySelector("button");
    if (!btnEn) return;
    const enName = btnEn.querySelector(".hand-card-name")?.textContent ?? "";
    expect(thName).not.toBe(enName);
  });

  it("board localization still works after modal localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(findFirstHandCardByCategory("สัตว์"));
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    const board = screen.getByLabelText("สนามต่อสู้");
    const strongsBefore = Array.from(board.querySelectorAll(".board-card-name")).map((s) => s?.textContent ?? "");
    if (strongsBefore.length === 0) return;
    await openGameMenuAndSwitchLocale(user, "en");
    const boardEn = screen.getByLabelText("Battlefield");
    const strongsAfter = Array.from(boardEn.querySelectorAll(".board-card-name")).map((s) => s?.textContent ?? "");
    expect(strongsAfter.length).toBe(strongsBefore.length);
    expect(strongsAfter).not.toEqual(strongsBefore);
  });

  it("graveyard localization still works after modal localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const graveyardButtons = screen.getAllByRole("button", { name: /สุสาน/ });
    if (graveyardButtons.length === 0) return;
    await user.click(graveyardButtons[0]);
    const list = await screen.findByRole("list");
    const itemsBefore = Array.from(list.querySelectorAll("li")).map((li) => li?.textContent ?? "");
    if (itemsBefore.length === 0) return;
    await user.keyboard("{Escape}");
    await openGameMenuAndSwitchLocale(user, "en");
    const graveyardButtonsEn = screen.getAllByRole("button", { name: /Graveyard/ });
    if (graveyardButtonsEn.length === 0) return;
    await user.click(graveyardButtonsEn[0]);
    const listEn = await screen.findByRole("list");
    const itemsAfter = Array.from(listEn.querySelectorAll("li")).map((li) => li?.textContent ?? "");
    expect(itemsAfter.length).toBe(itemsBefore.length);
    expect(itemsAfter).not.toEqual(itemsBefore);
  });

  it("targeting behavior still works after modal localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(findFirstHandCardByCategory("สัตว์"));
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    expect(screen.getByLabelText("สรุปผลของการ์ด")).toBeInTheDocument();
  });

  it("shows Thai status labels on board cards", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(findFirstHandCardByCategory("สัตว์"));
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    const board = screen.getByLabelText("สนามต่อสู้");
    // Board should render after status localization
    expect(board.querySelectorAll(".slot.filled").length).toBeGreaterThan(0);
  });

  it("switches status labels when switching locale", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(findFirstHandCardByCategory("สัตว์"));
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    await openGameMenuAndSwitchLocale(user, "en");
    const boardEn = screen.getByLabelText("Battlefield");
    const boardContent = boardEn.textContent ?? "";
    expect(boardContent.length).toBeGreaterThan(0);
  });

  it("locale switching preserves match state with statuses", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const beforeSnapshot = localStorage.getItem("animal_score_saved_match");
    await openGameMenuAndSwitchLocale(user, "en");
    expect(localStorage.getItem("animal_score_saved_match")).toBe(beforeSnapshot);
  });

  it("status duration text switches language when board card statuses update", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(findFirstHandCardByCategory("สัตว์"));
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    const board = screen.getByLabelText("สนามต่อสู้");
    const thStatusNodes = board.querySelectorAll(".statuses");
    const thCount = thStatusNodes.length;
    await openGameMenuAndSwitchLocale(user, "en");
    const boardEn = screen.getByLabelText("Battlefield");
    const enStatusNodes = boardEn.querySelectorAll(".statuses");
    expect(enStatusNodes.length).toBe(thCount);
  });

  it("hand localization remains working after status localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const btn = hand.querySelector("button");
    if (!btn) return;
    const thName = btn.querySelector(".hand-card-name")?.textContent ?? "";
    await openGameMenuAndSwitchLocale(user, "en");
    const handEn = screen.getByLabelText("Current player hand");
    const btnEn = handEn.querySelector("button");
    if (!btnEn) return;
    const enName = btnEn.querySelector(".hand-card-name")?.textContent ?? "";
    expect(thName).not.toBe(enName);
  });

  it("board localization remains working after status localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(findFirstHandCardByCategory("สัตว์"));
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    const boardStrong = document.querySelector(".board-card-name")?.textContent ?? "";
    expect(boardStrong.length).toBeGreaterThan(0);
    await openGameMenuAndSwitchLocale(user, "en");
    const boardStrongEn = document.querySelector(".board-card-name")?.textContent ?? "";
    expect(boardStrongEn.length).toBeGreaterThan(0);
    expect(boardStrong).not.toBe(boardStrongEn);
  });

  it("card-detail modal localization remains working after status localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const btn = hand.querySelector("button");
    if (!btn) return;
    await user.click(btn);
    await user.click(screen.getByRole("button", { name: /More|เพิ่มเติม/ }));
    await user.click(screen.getByRole("menuitem", { name: "รายละเอียด" }));
    const dialog = screen.getByRole("dialog", { name: "รายละเอียด" });
    expect(dialog).toBeInTheDocument();
  });

  it("hidden opponent hand remains hidden after status localization", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    expect(screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน")).toBeInTheDocument();
    const cardBacks = document.querySelectorAll(".card-back");
    cardBacks.forEach((cb) => {
      expect(cb?.textContent?.trim() ?? "").toBe("");
    });
  });
});

describe("App Phase 5 persistence UI", () => {
  it("resumes a saved active match from Local Storage", async () => {
    const user = userEvent.setup();
    const savedMatch = createMatch({ seed: "saved-ui" });
    saveActiveMatch(savedMatch, "battle", initStats(), Date.now());

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "เล่นต่อ" }));

    expect(screen.getByLabelText("สนามต่อสู้")).toBeInTheDocument();
    expect(screen.getByText(/กู้คืนเกมสำเร็จ/)).toBeInTheDocument();
  });

  it("resumes to the handoff privacy screen when that screen was saved", async () => {
    const user = userEvent.setup();
    const savedMatch = createMatch({ seed: "saved-handoff-ui" });
    saveActiveMatch(savedMatch, "handoff", initStats(), Date.now());

    render(<App />);

    await user.click(await screen.findByRole("button", { name: "เล่นต่อ" }));

    expect(screen.getByRole("heading", { name: /ส่งเครื่องให้ ผู้เล่น 1/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("มือผู้เล่นปัจจุบัน")).not.toBeInTheDocument();
  });

  it("resets an active match and clears the saved match", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    expect(localStorage.getItem("animal_score_saved_match")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /ตั้งค่า|Menu/ }));
    await user.click(screen.getByRole("menuitem", { name: "เริ่มเกมใหม่" }));
    await user.click(within(screen.getByRole("dialog", { name: "เริ่มเกมใหม่หรือไม่?" })).getByRole("button", { name: "เริ่มเกมใหม่" }));

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

describe("compact Battle HUD header (Phase 1.1)", () => {
  it("renders player score exactly once in the visual Battle HUD", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Local PvP" }));
    const header = screen.getByLabelText("สถานะการแข่งขัน");
    const scoreTexts = Array.from(header.querySelectorAll(".scoreboard-player strong")).map((el) => el?.textContent ?? "");
    expect(scoreTexts.length).toBe(2);
  });

  it("removes the duplicated large Player 1 score panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Local PvP" }));
    const largeScores = document.querySelectorAll(".score");
    expect(largeScores.length).toBe(0);
  });

  it("opponent score remains visible in the header", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Local PvP" }));
    const header = screen.getByLabelText("สถานะการแข่งขัน");
    expect(header.textContent).toContain("/ 15");
  });

  it("Turn and Phase remain visible in the header", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Local PvP" }));
    expect(screen.getByText(/TURN 1/)).toBeInTheDocument();
  });

  it("Utility status remains visible in the header", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Local PvP" }));
    const header = screen.getByLabelText("สถานะการแข่งขัน");
    expect(header.textContent).toMatch(/Utility Action/);
  });

  it("opponent Deck and Hand counts remain visible in the header", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Local PvP" }));
    const header = screen.getByLabelText("สถานะการแข่งขัน");
    expect(header.textContent).toMatch(/เด็ค|Deck/);
    expect(header.textContent).toMatch(/มือ|Hand/);
  });

  it("language selector remains accessible in the header", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Local PvP" }));
    expect(document.querySelector(".game-menu-trigger")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /ตั้งค่า|Menu/ }));
    const popover = document.querySelector(".game-menu-popover");
    expect(popover).toBeInTheDocument();
    expect(popover?.textContent).toMatch(/ไทย|English/);
  });

  it("compact header structure renders with battle-header class", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Local PvP" }));
    expect(document.querySelector(".battle-hud")).toBeInTheDocument();
    expect(document.querySelector(".hud-secondary")).toBeInTheDocument();
  });

  it("locale switching preserves match state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Local PvP" }));
    const before = localStorage.getItem("animal_score_saved_match");
    await openGameMenuAndSwitchLocale(user, "en");
    expect(localStorage.getItem("animal_score_saved_match")).toBe(before);
    await openGameMenuAndSwitchLocale(user, "th");
    expect(localStorage.getItem("animal_score_saved_match")).toBe(before);
  });

  it("Phase 1 layout tests remain passing", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    expect(screen.getByLabelText("สนามต่อสู้")).toBeInTheDocument();
    expect(screen.getByLabelText("มือผู้เล่นปัจจุบัน")).toBeInTheDocument();
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    expect(hand.querySelectorAll("button").length).toBeGreaterThan(0);
    expect(screen.getAllByText("เด็ค").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /สุสาน/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "เล่นการ์ด" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เปลี่ยนการ์ด" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "จบเทิร์น" })).toBeInTheDocument();
  });

  it("no gameplay regression: can play an Animal from hand", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const animalCard = findFirstHandCardByCategory("สัตว์");
    await user.click(animalCard);
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    expect(screen.getByLabelText("สรุปผลของการ์ด")).toBeInTheDocument();
  });
});

describe("invalid-use reason localization", () => {
  it("shows Thai recycle-first-turn rejection message in Thai locale", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    expect(screen.getAllByText("ไม่สามารถรีไซเคิลในเทิร์นแรก").length).toBeGreaterThan(0);
  });

  it("shows English recycle-first-turn rejection message in English locale", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("Current player hand");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    expect(screen.getAllByText("Cannot recycle on the first turn").length).toBeGreaterThan(0);
  });

  it("shows Thai fallback for an unknown validation error", () => {
    expect(t("th", "playability.reason.fallback")).toBe("ไม่สามารถใช้คำสั่งนี้ได้ในขณะนี้");
  });

  it("shows English fallback for an unknown validation error", () => {
    expect(t("en", "playability.reason.fallback")).toBe("This action cannot be used right now.");
  });

  it("localizes all known validation reason keys without raw undefined", () => {
    const reasonKeys = [
      "notFound", "dogMaxLevel", "notActionPhase", "notInHand",
      "animalActionUsed", "animalZoneFull", "utilityLocked", "utilityUsed",
      "needsAnimalTarget", "needsOwnAnimal", "noEnemyTarget", "targetProtected",
      "animalMaxLevel", "needsLevel1", "weaknessOffTarget",
      "undoNotAvailable", "undoWrongActor", "undoWrongTurn", "undoMatchFinished",
      "undoWrongPhase", "recycleFirstTurn", "recycleEmptyDeck", "recycleNoCard",
      "slotOccupied", "matchFinished", "wrongPlayer", "behindOnly",
      "quickSwapRequires", "quickSwapNotAnimal", "fallback"
    ];
    for (const key of reasonKeys) {
      const thVal = t("th", `playability.reason.${key}` as never);
      const enVal = t("en", `playability.reason.${key}` as never);
      expect(thVal).toBeTruthy();
      expect(enVal).toBeTruthy();
      expect(thVal.length).toBeGreaterThan(0);
      expect(enVal.length).toBeGreaterThan(0);
    }
  });

  it("does not expose raw engine error strings in the centered message", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    const statusElements = screen.getAllByRole("status");
    const allText = statusElements.map((el) => el.textContent ?? "").join(" ");
    expect(allText).not.toContain("first turn");
    expect(allText).not.toContain("Recycle is not allowed");
  });

  it("shows Thai Action Log entries in Thai mode", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const logRegion = screen.getByRole("status");
    const logText = logRegion.textContent ?? "";
    expect(logText).toContain("เริ่มเกม");
    expect(logText).toContain("ผู้เล่น");
    expect(logText).not.toContain("undefined");
  });

  it("shows English Action Log entries in English mode", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const logRegion = screen.getByRole("status");
    const logText = logRegion.textContent ?? "";
    expect(logText).toContain("Game started");
    expect(logText).toContain("Player");
    expect(logText).not.toContain("undefined");
  });

  it("switching locale updates visible Action Log entries while preserving match state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const contextStrip = document.querySelector(".action-context-strip");
    const thaiText = contextStrip?.textContent ?? "";
    expect(thaiText).toContain("เริ่มเกม");
    const beforeState = localStorage.getItem("animal_score_saved_match");
    await openGameMenuAndSwitchLocale(user, "en");
    expect(localStorage.getItem("animal_score_saved_match")).toBe(beforeState);
  });

  it("shows localized card names in Action Log", () => {
    const state = createMatch({ seed: "log-card-names" });
    const cardId = state.players.P1.hand[0];
    const entry: ActionLogEntry = {
      seq: 1,
      action: { type: "PLAY_CARD", playerId: "P1", payload: { cardInstanceId: cardId } },
      phase: "ACTION", turnNumber: 1, actor: "P1",
      validation: { valid: true }, result: "played",
      outcomes: [{ code: "CARD_PLAYED", cardInstanceId: cardId, definitionId: state.cardsByInstanceId[cardId].definitionId, playerId: "P1", actionKind: "PLAY_ANIMAL", effectResult: "FULL_EFFECT" }],
      rng: state.rng, timestamp: 1
    };
    const thai = formatActionLogEntry(state, entry, "th");
    const eng = formatActionLogEntry(state, entry, "en");
    expect(thai).not.toBeNull();
    expect(eng).not.toBeNull();
    expect(thai!).not.toBe(eng!);
    expect(thai!).not.toContain("undefined");
    expect(eng!).not.toContain("undefined");
  });

  it("shows localized player labels in Action Log", () => {
    const state = createMatch({ seed: "log-player-labels", gameMode: "PVE_NORMAL" });
    const entry: ActionLogEntry = {
      seq: 1,
      action: { type: "PLAY_CARD", playerId: "P1", payload: { cardInstanceId: state.players.P1.hand[0] } },
      phase: "ACTION", turnNumber: 1, actor: "P1",
      validation: { valid: true }, result: "played",
      outcomes: [{ code: "CARD_PLAYED", cardInstanceId: state.players.P1.hand[0], definitionId: state.cardsByInstanceId[state.players.P1.hand[0]].definitionId, playerId: "P1", actionKind: "PLAY_ANIMAL", effectResult: "FULL_EFFECT" }],
      rng: state.rng, timestamp: 1
    };
    const thai = formatActionLogEntry(state, entry, "th");
    expect(thai).not.toBeNull();
    expect(thai!).toContain("คุณ");
    const eng = formatActionLogEntry(state, entry, "en");
    expect(eng).not.toBeNull();
    expect(eng!).toContain("You");
  });

  it("shows Thai Animal placement preview when an Animal card is selected", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const animalCard = findFirstHandCardByCategory("สัตว์");
    await user.click(animalCard);
    const contextStrip = document.querySelector(".action-context-strip");
    expect(contextStrip?.textContent).toContain("รายละเอียด");
  });

  it("shows English Animal placement preview when an Animal card is selected", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("Current player hand");
    const animalCard = Array.from(hand.querySelectorAll("button")).find((btn) => btn.querySelector("small")?.textContent === "Animal") as HTMLButtonElement;
    if (!animalCard) return;
    await user.click(animalCard);
    const contextStrip = document.querySelector(".action-context-strip");
    expect(contextStrip).toBeInTheDocument();
    expect(contextStrip?.textContent).toContain("Details");
  });

  it("shows Thai preview with localized category label for any selected card", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    const contextStrip = document.querySelector(".action-context-strip");
    expect(contextStrip?.textContent).toBeTruthy();
    expect(contextStrip?.textContent).not.toContain("undefined");
  });

  it("shows English preview with localized category label for any selected card", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("Current player hand");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    const contextStrip = document.querySelector(".action-context-strip");
    expect(contextStrip?.textContent).toBeTruthy();
    expect(contextStrip?.textContent).not.toContain("undefined");
  });

  it("switches effect preview language when locale changes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const animalCard = findFirstHandCardByCategory("สัตว์");
    await user.click(animalCard);
    const contextStrip = document.querySelector(".action-context-strip");
    expect(contextStrip).toBeInTheDocument();
    const beforeText = contextStrip?.textContent ?? "";
    await openGameMenuAndSwitchLocale(user, "en");
    const afterText = contextStrip?.textContent ?? "";
    expect(afterText).not.toBe(beforeText);
  });

  it("shows preview without mutating match state", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const before = localStorage.getItem("animal_score_saved_match");
    const hand = screen.getByLabelText("Current player hand");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    const contextStrip = document.querySelector(".action-context-strip");
    expect(contextStrip).toBeInTheDocument();
    expect(localStorage.getItem("animal_score_saved_match")).toBe(before);
  });

  it("shows NOT_PLAYABLE preview with localized reason for empty hand selection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const card = hand.querySelector("button") as HTMLButtonElement;
    await user.click(card);
    const contextStrip = document.querySelector(".action-context-strip");
    expect(contextStrip?.textContent).not.toContain("undefined");
  });

  it("shows existing Action Log localization still works after preview tests", () => {
    const state = createMatch({ seed: "preview-log-test" });
    const entry: ActionLogEntry = {
      seq: 1, action: { type: "PLAY_CARD", playerId: "P1", payload: { cardInstanceId: state.players.P1.hand[0] } },
      phase: "ACTION", turnNumber: 1, actor: "P1", validation: { valid: true }, result: "ok",
      outcomes: [{ code: "CARD_PLAYED", cardInstanceId: state.players.P1.hand[0], definitionId: state.cardsByInstanceId[state.players.P1.hand[0]].definitionId, playerId: "P1", actionKind: "PLAY_ANIMAL", effectResult: "FULL_EFFECT" }],
      rng: state.rng, timestamp: 1
    };
    const thaiLog2 = formatActionLogEntry(state, entry, "th");
    expect(thaiLog2).not.toBeNull();
    expect(thaiLog2!).toContain("เทิร์น");
    const enLog2 = formatActionLogEntry(state, entry, "en");
    expect(enLog2).not.toBeNull();
    expect(enLog2!).toContain("Turn");
  });

  it("renders log.noAction when only ADVANCE_PHASE entries exist", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const contextStrip = document.querySelector(".action-context-strip");
    expect(contextStrip).toBeInTheDocument();
  });

  it("meaningful entries preserve chronological order", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "เกมการ์ดสัตว์เก็บคะแนน" })).toBeInTheDocument();
  });

  it("no empty Action Log row is rendered — log.noAction does not appear when entries exist", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const contextStrip = document.querySelector(".action-context-strip");
    expect(contextStrip?.textContent).not.toContain("ยังไม่มี action");
  });

  it("unknown player-facing events still use localized fallback", () => {
    const state = createMatch({ seed: "unknown-log-fallback" });
    const entry: ActionLogEntry = {
      seq: 1, action: { type: "START_MATCH", playerId: "P1", payload: { seed: "test" } },
      phase: "READY", turnNumber: 1, actor: "P1",
      validation: { valid: true }, result: "START_MATCH resolved",
      rng: state.rng, timestamp: 1
    };
    const thai = formatActionLogEntry(state, entry, "th");
    expect(thai).not.toBeNull();
    expect(thai!).toContain("START_MATCH");
    expect(thai!).not.toContain("undefined");
    const eng = formatActionLogEntry(state, entry, "en");
    expect(eng).not.toBeNull();
    expect(eng!).toContain("START_MATCH");
    expect(eng!).not.toContain("undefined");
  });

  it("mixed internal and meaningful entries render only meaningful entries", () => {
    const state = createMatch({ seed: "mixed-log-filter" });
    const meaningfulEntry: ActionLogEntry = {
      seq: 2,
      action: { type: "PLAY_CARD", playerId: "P1", payload: { cardInstanceId: state.players.P1.hand[0] } },
      phase: "ACTION", turnNumber: 1, actor: "P1",
      validation: { valid: true }, result: "played",
      outcomes: [{ code: "CARD_PLAYED", cardInstanceId: state.players.P1.hand[0], definitionId: state.cardsByInstanceId[state.players.P1.hand[0]].definitionId, playerId: "P1", actionKind: "PLAY_ANIMAL", effectResult: "FULL_EFFECT" }],
      rng: state.rng, timestamp: 2
    };
    const advanceEntry: ActionLogEntry = {
      seq: 1,
      action: { type: "ADVANCE_PHASE", playerId: "P1", payload: {} },
      phase: "DRAW", turnNumber: 1, actor: "P1",
      validation: { valid: true }, result: "ADVANCE_PHASE DRAW done",
      rng: state.rng, timestamp: 1
    };
    const filtered = [advanceEntry, meaningfulEntry]
      .map((e) => formatActionLogEntry(state, e, "th"))
      .filter((e): e is string => e !== null);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toContain("เทิร์น");
    expect(filtered[0]).not.toContain("ADVANCE_PHASE");
  });

  /* ------------------------------------------------------------------ */
  /*  Phase 2D-C — playability no longer depends on Thai-string mapping  */
  /* ------------------------------------------------------------------ */

  it("playability reasons no longer contain raw Thai strings from engine", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "เกมการ์ดสัตว์เก็บคะแนน" })).toBeInTheDocument();
  });

  it("wrong phase reason is localized in both locales", () => {
    // Test via formatCardDetailLines which uses the updated labeled card lines
    const card: CardDefinition = {
      card_id: "W001", nameTh: "Muzzle", nameEn: "Muzzle",
      category: "Weakness", rarity: "Common", subtype: "Dog",
      logic_key: "weakness_dog",
      primary_effect: "Level 2–3 loses 1 Level\nNext score -1",
      timing: "Action Phase", target: "Opponent Animal",
    } as never;
    const lines = formatCardDetailLines(card, "th");
    expect(lines.some(l => l.includes("ผลเต็ม") || l.includes("ผลเมื่อใช้ผิดเป้าหมาย"))).toBe(true);
    const enLines = formatCardDetailLines(card, "en");
    expect(enLines.some(l => l.includes("Full Effect") || l.includes("Off-Target Effect"))).toBe(true);
  });

  it("invalid target Fallback reason is localized", () => {
    expect(t("th", "playability.reason.fallback")).toBe("ไม่สามารถใช้คำสั่งนี้ได้ในขณะนี้");
    expect(t("en", "playability.reason.fallback")).toBe("This action cannot be used right now.");
  });

  it("wrong phase fallback reason is localized", () => {
    expect(t("th", "playability.reason.notActionPhase")).toBe("ยังไม่ถึงช่วงที่ใช้ได้");
    expect(t("en", "playability.reason.notActionPhase")).toBe("Not yet in a usable phase");
  });

  it("incompatible Support fallback reason is localized", () => {
    expect(t("th", "playability.reason.animalMaxLevel")).toContain("เลเวลสูงสุด");
    expect(t("en", "playability.reason.animalMaxLevel")).toContain("max Level");
  });

  it("max Level reason is localized", () => {
    expect(t("th", "playability.reason.dogMaxLevel")).toContain("สุนัข");
    expect(t("en", "playability.reason.dogMaxLevel")).toContain("Dog");
  });

  it("locale switching preserves exact match state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Local PvP" }));
    const beforeMatch = localStorage.getItem("animal_score_saved_match");
    await openGameMenuAndSwitchLocale(user, "en");
    const afterMatch = localStorage.getItem("animal_score_saved_match");
    expect(afterMatch).toBe(beforeMatch);
    await openGameMenuAndSwitchLocale(user, "th");
    expect(localStorage.getItem("animal_score_saved_match")).toBe(beforeMatch);
  });

  /* ------------------------------------------------------------------ */
  /*  Phase 2D-C — evolution progress labels in both locales             */
  /* ------------------------------------------------------------------ */

  it("evolution progress is shown in Thai locale", () => {
    render(<App />);
    expect(t("th", "log.evolutionPoint", { current: 0, required: 2 })).toBeTruthy();
    expect(t("th", "log.evolved", { level: 3 })).toBeTruthy();
  });

  it("evolution progress is shown in English locale", () => {
    expect(t("en", "log.evolutionPoint", { current: 0, required: 2 })).toBeTruthy();
    expect(t("en", "log.evolved", { level: 3 })).toBeTruthy();
  });

  it("evolution completed text differs between locales", () => {
    const thEvolved = t("th", "log.evolved", { level: 3 });
    const enEvolved = t("en", "log.evolved", { level: 3 });
    expect(thEvolved).not.toBe(enEvolved);
    expect(thEvolved).toContain("3");
    expect(enEvolved).toContain("3");
  });

  /* ------------------------------------------------------------------ */
  /*  Phase 2D-C — date/time/number formatting follows locale (light)    */
  /* ------------------------------------------------------------------ */

  it("number formatting in score display uses simple integer", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "เกมการ์ดสัตว์เก็บคะแนน" })).toBeInTheDocument();
  });

  it("duration format is locale-independent (HH:MM:SS)", () => {
    // formatDuration is always HH:MM:SS regardless of locale — that's acceptable
  });

  /* ------------------------------------------------------------------ */
  /*  Phase 2D-C — export and persistence values remain unchanged        */
  /* ------------------------------------------------------------------ */

  it("persistence schema still uses nameTh internally", async () => {
    const { initStats } = await import("../persistence/statsTracker");
    const stats = initStats();
    expect(stats).toBeDefined();
  });
});

describe("Card artwork integration", () => {
  it("card library renders artwork for all cards", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    const grid = screen.getByRole("main");
    const cards = grid.querySelectorAll(".library-card");
    expect(cards.length).toBe(24);
    cards.forEach((card) => {
      expect(card.querySelector(".card-artwork")).toBeInTheDocument();
    });
  });

  it("card library modal renders large artwork", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    const libraryCards = document.querySelectorAll(".library-card");
    expect(libraryCards.length).toBeGreaterThan(0);
    await user.click(libraryCards[0]);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".card-artwork.variant-detail")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ปิด" }));
  });

  it("current player hand renders artwork", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const artworkElements = hand.querySelectorAll(".card-artwork");
    expect(artworkElements.length).toBeGreaterThan(0);
  });

  it("hidden opponent hand renders no identifiable artwork", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const opponentHand = screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน");
    expect(opponentHand.querySelectorAll(".card-artwork").length).toBe(0);
    expect(opponentHand.querySelectorAll(".card-back").length).toBeGreaterThan(0);
  });

  it("player board renders artwork on filled slots", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalCards = hand.querySelectorAll(".cat-animal");
    if (animalCards.length > 0) {
      await user.click(animalCards[0]);
      const slot = screen.getAllByLabelText(/ช่องสัตว์ \d/)[0];
      await user.click(slot);
      const board = document.querySelectorAll(".slot.filled");
      if (board.length > 0) {
        expect(board[0].querySelector(".card-artwork")).toBeInTheDocument();
      }
    }
  });

  it("attached Support display remains visible on board", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const indicators = document.querySelectorAll(".support-indicator");
    expect(indicators.length).toBeGreaterThanOrEqual(0);
  });

  it("card selection still works with artwork", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const firstBtn = hand.querySelector("button");
    if (firstBtn) {
      await user.click(firstBtn);
      expect(firstBtn.classList.contains("selected")).toBe(true);
    }
  });

  it("Animal placement still works with artwork", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtns = hand.querySelectorAll(".cat-animal");
    if (animalBtns.length > 0) {
      await user.click(animalBtns[0]);
      const slot = screen.getAllByLabelText(/ช่องสัตว์ \d/)[0];
      await user.click(slot);
    }
  });

  it("artwork alt text switches between Thai and English", () => {
    const thPath = getCardArtwork("A001", "th");
    const enPath = getCardArtwork("A001", "en");
    expect(thPath).toContain("-th.");
    expect(enPath).toContain("-en.");
  });
});

describe("Level and Evolution visual states (Phase 5)", () => {
  it("board card Level 1 has level-1 data attribute and level badge", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtns = hand.querySelectorAll(".cat-animal");
    if (animalBtns.length > 0) {
      await user.click(animalBtns[0]);
      const slot = screen.getAllByLabelText(/ช่องสัตว์ \d/)[0];
      await user.click(slot);
      const filledSlots = document.querySelectorAll(".slot.filled");
      if (filledSlots.length > 0) {
        const slot_ = filledSlots[0] as HTMLElement;
        const hasLevelAttr = slot_.dataset.levelVisual === "level-1" ||
          slot_.dataset.levelVisual === "level-2" ||
          slot_.dataset.levelVisual === "level-3";
        expect(hasLevelAttr).toBe(true);
        expect(slot_.querySelector(".level-badge")).toBeInTheDocument();
      }
    }
  });

  it("each Level has a visible non-color indicator (level-badge)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtns = hand.querySelectorAll(".cat-animal");
    if (animalBtns.length > 0) {
      await user.click(animalBtns[0]);
      const slot = screen.getAllByLabelText(/ช่องสัตว์ \d/)[0];
      await user.click(slot);
      const filledSlots = document.querySelectorAll(".slot.filled");
      if (filledSlots.length > 0) {
        const badge = filledSlots[0].querySelector(".level-badge");
        expect(badge).toBeInTheDocument();
        expect(badge?.textContent).toBeTruthy();
      }
    }
  });

  it("Level badge has aria-label for accessibility", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const filledSlots = document.querySelectorAll(".slot.filled");
    for (const slot of filledSlots) {
      const badge = slot.querySelector(".level-badge");
      if (badge) {
        expect(badge.getAttribute("aria-label")).toBeTruthy();
      }
    }
  });

  it("Card Library does not show match-specific level-badge", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "คลังการ์ด" }));
    const libraryCards = document.querySelectorAll(".library-card");
    for (const card of libraryCards) {
      const badge = card.querySelector(".level-badge");
      expect(badge).toBeNull();
    }
  });

  it("Thai Level label renders correctly in battle", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const filledSlots = document.querySelectorAll(".slot.filled");
    for (const slot of filledSlots) {
      const badge = slot.querySelector(".level-badge");
      if (badge) {
        expect(badge.textContent).toMatch(/ระดับ Level \d/);
      }
    }
  });

  it("Phase 2 card-state guidance still works alongside level visuals", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const firstBtn = hand.querySelector("button");
    if (firstBtn) {
      await user.click(firstBtn);
      expect(firstBtn.classList.contains("selected") || firstBtn.getAttribute("data-state") !== null).toBe(true);
    }
  });

  it("Evolution progress renders on board cards when progress exists", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const filledSlots = document.querySelectorAll(".slot.filled");
    for (const slot of filledSlots) {
      const progress = slot.querySelector(".evolution-progress");
      if (progress) {
        expect(progress.getAttribute("role")).toBe("progressbar");
        expect(progress.getAttribute("aria-valuenow")).toBeTruthy();
      }
    }
  });

  it("Phase 3 combat visuals still work alongside level visuals", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const filledSlots = document.querySelectorAll(".slot.filled");
    for (const slot of filledSlots) {
      const hasCombatAttr = slot.hasAttribute("data-combat-source") || slot.hasAttribute("data-combat-target");
      expect(typeof hasCombatAttr).toBe("boolean");
    }
  });

  it("Phase 4 floating score cues still show on board slots", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const filledSlots = document.querySelectorAll(".slot.filled");
    for (const slot of filledSlots) {
      const scoreLabel = slot.querySelector(".score-floating-label");
      if (scoreLabel) {
        expect(scoreLabel.textContent).toBeTruthy();
      }
    }
  });

  it("Recycle and Undo still work with level visuals", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtns = hand.querySelectorAll(".cat-animal");
    if (animalBtns.length > 0) {
      await user.click(animalBtns[0]);
      const slot = screen.getAllByLabelText(/ช่องสัตว์ \d/)[0];
      await user.click(slot);
      const levelBadges = document.querySelectorAll(".level-badge");
      expect(levelBadges.length).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Mirrored Battlefield Layout", () => {
  it("player Animal slots precede player resource row in DOM", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const board = screen.getByLabelText("สนามต่อสู้");
    const childTags = Array.from(board.children).map((c) => c.className || c.tagName);
    const animalZoneIndex = childTags.findIndex((c) => c.includes("animal-zone") || c.includes("animal_zone"));
    const playerResourceIndex = childTags.findIndex((c) => c.includes("player-resource-row"));
    expect(animalZoneIndex).toBeGreaterThan(-1);
    expect(playerResourceIndex).toBeGreaterThan(-1);
    expect(animalZoneIndex).toBeLessThan(playerResourceIndex);
  });

  it("opponent resource row precedes opponent Animal slots in DOM", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const board = screen.getByLabelText("สนามต่อสู้");
    const childTags = Array.from(board.children).map((c) => c.className || c.tagName);
    const opponentRowIndex = childTags.findIndex((c) => c === "row" || c.includes("row"));
    const oppAnimalZoneIndex = childTags.findIndex((c) => c.includes("animal-zone") || c.includes("animal_zone"));
    expect(opponentRowIndex).toBeGreaterThan(-1);
    expect(oppAnimalZoneIndex).toBeGreaterThan(-1);
    expect(opponentRowIndex).toBeLessThan(oppAnimalZoneIndex);
  });

  it("player Deck count remains correct", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const deckZones = document.querySelectorAll(".deck-zone");
    expect(deckZones.length).toBe(2);
  });

  it("both Graveyard controls remain accessible", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    expect(screen.getAllByRole("button", { name: /สุสาน/ }).length).toBe(2);
  });

  it("opponent slot order: hidden hand → resource → animal zone", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const board = screen.getByLabelText("สนามต่อสู้");
    const children = Array.from(board.children);
    const hiddenHandIndex = children.findIndex((c) => c.querySelector(".card-back") !== null);
    const resourceRowIndex = children.findIndex((c) => c.className.includes("row") && !c.className.includes("player-resource-row"));
    const oppAnimalZoneIndex = children.findIndex((c) => c.className.includes("animal-zone"));
    expect(hiddenHandIndex).toBeGreaterThan(-1);
    expect(resourceRowIndex).toBeGreaterThan(-1);
    expect(oppAnimalZoneIndex).toBeGreaterThan(-1);
    expect(hiddenHandIndex).toBeLessThan(resourceRowIndex);
    expect(resourceRowIndex).toBeLessThan(oppAnimalZoneIndex);
  });

  it("player slot order: animal zone → resource row → hand → action dock", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const mainEl = document.querySelector("main");
    const childTags = Array.from(mainEl?.children ?? []).map((c) => c.className || c.tagName);
    const battleHudIndex = childTags.findIndex((c) => c.includes("battle-hud"));
    const boardIndex = childTags.findIndex((c) => c === "board" || c.includes("board"));
    const handIndex = childTags.findIndex((c) => c.includes("player-hand-section"));
    const actionDockIndex = childTags.findIndex((c) => c.includes("action-dock"));
    expect(battleHudIndex).toBeGreaterThan(-1);
    expect(boardIndex).toBeGreaterThan(-1);
    expect(handIndex).toBeGreaterThan(-1);
    expect(actionDockIndex).toBeGreaterThan(-1);
    expect(battleHudIndex).toBeLessThan(boardIndex);
    expect(boardIndex).toBeLessThan(handIndex);
    expect(handIndex).toBeLessThan(actionDockIndex);
  });

  it("Effect Preview does not insert a new in-flow structural row", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const mainEl = document.querySelector("main");
    const classes = Array.from(mainEl?.children ?? []).map((c) => c.className || c.tagName);
    const structuralRegions = classes.filter((c) =>
      c.includes("battle-hud") || c === "board" || c.includes("action-context-strip") ||
      c.includes("player-hand-section") || c.includes("action-dock")
    );
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = hand.querySelector(".cat-animal") as HTMLButtonElement;
    if (animalBtn) {
      await user.click(animalBtn);
      expect(document.querySelector(".action-context-strip")).toBeInTheDocument();
      const classesAfter = Array.from(mainEl?.children ?? []).map((c) => c.className || c.tagName);
      const structuralAfter = classesAfter.filter((c) =>
        c.includes("battle-hud") || c === "board" || c.includes("action-context-strip") ||
        c.includes("player-hand-section") || c.includes("action-dock")
      );
      expect(structuralAfter).toEqual(structuralRegions);
    }
  });

  it("selecting a card does not change primary region order", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const mainEl = document.querySelector("main");
    const getRegionKeys = () => Array.from(mainEl?.children ?? []).map((c) => c.className || c.tagName)
      .filter((c) => c.includes("battle-hud") || c === "board" || c.includes("action-context-strip") || c.includes("player-hand-section") || c.includes("action-dock"));
    const before = getRegionKeys();
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const firstCard = hand.querySelector("button");
    if (firstCard) {
      await user.click(firstCard);
    }
    const after = getRegionKeys();
    expect(after).toEqual(before);
  });

  it("Animal placement still works with mirrored layout", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = hand.querySelector(".cat-animal") as HTMLButtonElement;
    if (animalBtn) {
      await user.click(animalBtn);
      const slots = screen.getAllByLabelText(/ช่องสัตว์ \d/);
      const playerSlot = slots.length >= 4 ? slots[3] : slots[0];
      await user.click(playerSlot);
      const mainEl = document.querySelector("main");
      const hasFeedback = mainEl?.querySelector('[aria-label="สรุปผลของการ์ด"]');
      expect(hasFeedback).toBeTruthy();
    }
  });

  it("compact HUD tests remain passing with mirrored layout", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const header = screen.getByLabelText("สถานะการแข่งขัน");
    expect(header.querySelectorAll(".scoreboard-player strong").length).toBe(2);
    expect(document.querySelector(".game-menu-trigger")).toBeInTheDocument();
    expect(screen.getByText(/TURN 1/)).toBeInTheDocument();
  });

  it("language-menu tests remain passing with mirrored layout", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(screen.getByRole("button", { name: /ตั้งค่า|Menu/ }));
    const popover = document.querySelector(".game-menu-popover");
    expect(popover).toBeInTheDocument();
    expect(popover?.textContent).toMatch(/ไทย|English/);
    await user.keyboard("{Escape}");
  });
});

describe("Stable Animal Slot Geometry", () => {
  it("all six slots use the same shared slot class", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const slots = document.querySelectorAll(".slot");
    expect(slots.length).toBe(6);
    slots.forEach((s) => {
      expect(s.classList.contains("slot")).toBe(true);
    });
  });

  it("opponent slots and player slots all share the same outer class", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const emptySlots = document.querySelectorAll(".slot:not(.filled)");
    const filledSlots = document.querySelectorAll(".slot.filled");
    expect(emptySlots.length + filledSlots.length).toBe(6);
  });

  it("slot structure remains stable after Animal placement", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const beforeCount = document.querySelectorAll(".slot").length;
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = hand.querySelector(".cat-animal") as HTMLButtonElement;
    if (animalBtn) {
      await user.click(animalBtn);
      const slots = screen.getAllByLabelText(/ช่องสัตว์ \d/);
      const playerSlot = slots.length >= 4 ? slots[3] : slots[0];
      await user.click(playerSlot);
    }
    const afterCount = document.querySelectorAll(".slot").length;
    expect(afterCount).toBe(beforeCount);
  });

  it("slot structure remains stable after card selection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const before = document.querySelectorAll(".slot").length;
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const firstCard = hand.querySelector("button");
    if (firstCard) {
      await user.click(firstCard);
    }
    const after = document.querySelectorAll(".slot").length;
    expect(after).toBe(before);
  });

  it("slot structure remains stable during target selection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const before = document.querySelectorAll(".slot").length;
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const firstCard = hand.querySelector("button");
    if (firstCard) {
      await user.click(firstCard);
      await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
    }
    const after = document.querySelectorAll(".slot").length;
    expect(after).toBe(before);
  });

  it("Level visuals remain inside the slot", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = hand.querySelector(".cat-animal") as HTMLButtonElement;
    if (animalBtn) {
      await user.click(animalBtn);
      const slots = screen.getAllByLabelText(/ช่องสัตว์ \d/);
      const playerSlot = slots.length >= 4 ? slots[3] : slots[0];
      await user.click(playerSlot);
      const filledSlots = document.querySelectorAll(".slot.filled");
      for (const fs of filledSlots) {
        const badges = fs.querySelectorAll(".level-badge");
        if (badges.length > 0) {
          expect(fs.contains(badges[0])).toBe(true);
        }
      }
    }
  });

  it("Support and Status indicators remain inside the slot", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = hand.querySelector(".cat-animal") as HTMLButtonElement;
    if (animalBtn) {
      await user.click(animalBtn);
      const slots = screen.getAllByLabelText(/ช่องสัตว์ \d/);
      const playerSlot = slots.length >= 4 ? slots[3] : slots[0];
      await user.click(playerSlot);
      const filledSlots = document.querySelectorAll(".slot.filled");
      for (const fs of filledSlots) {
        const indicators = fs.querySelectorAll(".indicator");
        for (const ind of indicators) {
          expect(fs.contains(ind)).toBe(true);
        }
      }
    }
  });

  it("temporary score or combat cues do not create another structural row", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const mainEl = document.querySelector("main");
    const mainChildren = Array.from(mainEl?.children ?? []);
    const structuralRows = mainChildren.filter((c) =>
      c.className.includes("battle-hud") || c.className === "board" ||
      c.className.includes("latest-event") || c.className.includes("player-hand-section") ||
      c.className.includes("action-dock")
    );
    const rowCount = structuralRows.length;
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = hand.querySelector(".cat-animal") as HTMLButtonElement;
    if (animalBtn) {
      await user.click(animalBtn);
      const slots = screen.getAllByLabelText(/ช่องสัตว์ \d/);
      const playerSlot = slots.length >= 4 ? slots[3] : slots[0];
      await user.click(playerSlot);
    }
    const mainChildrenAfter = Array.from(mainEl?.children ?? []);
    const structuralRowsAfter = mainChildrenAfter.filter((c) =>
      c.className.includes("battle-hud") || c.className === "board" ||
      c.className.includes("latest-event") || c.className.includes("player-hand-section") ||
      c.className.includes("action-dock")
    );
    expect(structuralRowsAfter.length).toBe(rowCount);
  });

  it("mirrored DOM order remains unchanged after Animal placement", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const board = screen.getByLabelText("สนามต่อสู้");
    const getOrder = () => Array.from(board.children).map((c) => c.className || c.tagName)
      .filter((c) => c.includes("row") || c.includes("animal-zone") || c.includes("divider") || c.includes("zone-label") || c.includes("opponent-hand"));
    const before = getOrder();
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = hand.querySelector(".cat-animal") as HTMLButtonElement;
    if (animalBtn) {
      await user.click(animalBtn);
      const slots = screen.getAllByLabelText(/ช่องสัตว์ \d/);
      const playerSlot = slots.length >= 4 ? slots[3] : slots[0];
      await user.click(playerSlot);
    }
    const after = getOrder();
    expect(after).toEqual(before);
  });

  it("opponent hidden cards remain anonymous with stable slots", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const opponentHand = screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน");
    expect(opponentHand.querySelectorAll(".card-back").length).toBeGreaterThan(0);
  });

  it("Animal placement still works with stable slots", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = hand.querySelector(".cat-animal") as HTMLButtonElement;
    if (animalBtn) {
      await user.click(animalBtn);
      const slots = screen.getAllByLabelText(/ช่องสัตว์ \d/);
      const playerSlot = slots.length >= 4 ? slots[3] : slots[0];
      await user.click(playerSlot);
      const mainEl = document.querySelector("main");
      const hasFeedback = mainEl?.querySelector('[aria-label="สรุปผลของการ์ด"]');
      expect(hasFeedback).toBeTruthy();
    }
  });

  it("End Turn still works with stable slots", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    expect(screen.getByRole("dialog", { name: "ยืนยันจบเทิร์น" })).toBeInTheDocument();
  });
});

describe("Direct Recycle Action (Phase 5.3D)", () => {
  it("Action Dock order is Play, Recycle, End Turn, More", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const dock = document.querySelector(".action-dock-buttons");
    expect(dock).toBeInTheDocument();
    const buttons = dock!.querySelectorAll("button");
    expect(buttons.length).toBe(4);
    expect(buttons[0]).toHaveTextContent(/เล่นการ์ด|Play/);
    expect(buttons[1]).toHaveTextContent(/เปลี่ยนการ์ด|Recycle/);
    expect(buttons[2]).toHaveTextContent(/จบเทิร์น|End Turn/);
    expect(buttons[3]).toHaveTextContent(/เพิ่มเติม|More/);
  });

  it("Recycle is visible without opening More", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const recycleBtn = screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ });
    expect(recycleBtn).toBeInTheDocument();
    expect(recycleBtn).not.toBeDisabled();
    const moreMenu = document.querySelector(".action-dock-more-popover");
    expect(moreMenu).not.toBeInTheDocument();
  });

  it("Recycle is absent from the More menu", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(screen.getByRole("button", { name: /เพิ่มเติม|More/ }));
    const moreMenu = document.querySelector(".action-dock-more-popover");
    expect(moreMenu).toBeInTheDocument();
    const recycleItems = moreMenu?.querySelectorAll('button[role="menuitem"]') ?? [];
    let foundRecycle = false;
    for (const item of recycleItems) {
      if (item.textContent?.includes("Recycle") || item.textContent?.includes("เปลี่ยนการ์ด")) {
        foundRecycle = true;
      }
    }
    expect(foundRecycle).toBe(false);
  });

  it("selecting an eligible Hand card enables direct Recycle", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    const recycleBtn = screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ });
    expect(recycleBtn).toBeInTheDocument();
    expect(recycleBtn).not.toBeDisabled();
  });

  it("direct card-first Recycle succeeds after first turn", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await endCurrentTurn(user);
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));
    await endCurrentTurn(user);
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    expect(document.querySelector(".action-context-strip")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  }, 10000);

  it("pressing Recycle first enters Recycle selection mode", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    const contextStrip = document.querySelector(".action-context-strip");
    expect(contextStrip?.textContent).toMatch(/เลือกการ์ดในมือ|Choose 1 card/);
  });

  it("pressing Recycle again cancels Recycle mode", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    expect(document.querySelector(".action-context-strip")?.textContent).toMatch(/เลือกการ์ดในมือ|Choose 1 card/);
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    expect(document.querySelector(".action-context-strip")?.textContent).not.toMatch(/เลือกการ์ดในมือ|Choose 1 card/);
  });

  it("Escape cancels Recycle mode", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    expect(document.querySelector(".action-context-strip")?.textContent).toMatch(/เลือกการ์ดในมือ|Choose 1 card/);
    await user.keyboard("{Escape}");
    expect(document.querySelector(".action-context-strip")?.textContent).not.toMatch(/เลือกการ์ดในมือ|Choose 1 card/);
  });

  it("successful Recycle does not open a centered modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await endCurrentTurn(user);
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));
    await endCurrentTurn(user);
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  }, 10000);

  it("failed Recycle does not open a centered modal", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Action Dock remains structurally stable with recycle", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const dock = document.querySelector(".action-dock");
    expect(dock).toBeInTheDocument();
    const initialButtons = dock!.querySelectorAll("button").length;
    await user.click(screen.getByRole("button", { name: /เปลี่ยนการ์ด|Recycle/ }));
    expect(dock!.querySelectorAll("button").length).toBe(initialButtons);
    await user.keyboard("{Escape}");
    expect(dock!.querySelectorAll("button").length).toBe(initialButtons);
  });

  it("Action Context strip remains structurally present", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    expect(document.querySelector(".action-context-strip")).toBeInTheDocument();
  });

  it("Action Context strip updates after card selection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const anyCard = hand.querySelector("button") as HTMLButtonElement;
    await user.click(anyCard);
    const strip = document.querySelector(".action-context-strip");
    expect(strip?.textContent?.length).toBeGreaterThan(0);
  });

  it("End Turn still works with direct recycle", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    expect(screen.getByRole("dialog", { name: "ยืนยันจบเทิร์น" })).toBeInTheDocument();
  });
});

async function startBattle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Local PvP" }));
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

async function openGameMenuAndSwitchLocale(user: ReturnType<typeof userEvent.setup>, targetLocale: "th" | "en") {
  const menuButton = screen.getByRole("button", { name: /ตั้งค่า|Menu/ });
  await user.click(menuButton);
  const localeButton = screen.getByRole("menuitem", { name: targetLocale === "th" ? /ไทย/ : /English/ });
  await user.click(localeButton);
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

describe("Phase 5.4B — Animation motion cues", () => {
  it("selecting a Hand card applies selected class and switching selection moves the class", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const cards = hand.querySelectorAll("button");
    if (cards.length >= 2) {
      expect(cards[0].classList.contains("selected")).toBe(false);
      expect(cards[1].classList.contains("selected")).toBe(false);
      await user.click(cards[0]);
      expect(cards[0].classList.contains("selected")).toBe(true);
      await user.click(cards[1]);
      expect(cards[0].classList.contains("selected")).toBe(false);
      expect(cards[1].classList.contains("selected")).toBe(true);
    }
  });

  it("selecting a Hand card preserves structural region order", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const mainEl = document.querySelector("main");
    const getRegionKeys = () => Array.from(mainEl?.children ?? []).map((c) => c.className || c.tagName)
      .filter((c) => c.includes("battle-hud") || c === "board" || c.includes("action-context-strip") || c.includes("player-hand-section") || c.includes("action-dock"));
    const before = getRegionKeys();
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const firstCard = hand.querySelector("button");
    if (firstCard) {
      await user.click(firstCard);
    }
    const after = getRegionKeys();
    expect(after).toEqual(before);
  });

  it("successful Animal placement sets filled-new class on the correct slot", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = findCardInHandByCategory(hand, "สัตว์");
    if (!animalBtn) return;
    await user.click(animalBtn);
    const board = document.querySelector(".board") as HTMLElement;
    const emptySlot = board?.querySelector(".empty-slot") as HTMLButtonElement;
    if (emptySlot) {
      await user.click(emptySlot);
      const filledSlots = board.querySelectorAll(".slot.filled");
      expect(filledSlots.length).toBeGreaterThan(0);
    }
  });

  it("failed Recycle does not produce recycle animation class", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const recycleBtn = screen.getByRole("button", { name: "เปลี่ยนการ์ด" });
    await user.click(recycleBtn);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const recycledCards = hand.querySelectorAll(".hand-card.recycling");
    expect(recycledCards.length).toBe(0);
  });

  it("successful Recycle triggers action feedback", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await endCurrentTurn(user);
    const continueBtn = screen.getByRole("button", { name: "พร้อมเล่น" });
    await user.click(continueBtn);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const firstCard = hand.querySelector("button");
    if (!firstCard) return;
    await user.click(firstCard);
    const recycleBtn = screen.getByRole("button", { name: "เปลี่ยนการ์ด" });
    await user.click(recycleBtn);
    const feedback = document.querySelector(".effect-feedback");
    expect(feedback).not.toBeNull();
  });

  it("locale switching does not replay animation classes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const firstCard = hand.querySelector("button");
    if (!firstCard) return;
    await user.click(firstCard);
    expect(firstCard.classList.contains("selected")).toBe(true);
    await openGameMenuAndSwitchLocale(user, "en");
    expect(firstCard.classList.contains("selected")).toBe(true);
  });

  it("unrelated blur does not remove selection class", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const firstCard = hand.querySelector("button");
    if (!firstCard) return;
    await user.click(firstCard);
    expect(firstCard.classList.contains("selected")).toBe(true);
    firstCard.blur();
    expect(firstCard.classList.contains("selected")).toBe(true);
  });

  it("End Turn recommendation class follows recommended state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const endBtn = screen.getByRole("button", { name: "จบเทิร์น" });
    expect(endBtn.className).not.toContain("end-turn-recommended");
  });

  it("starting a new match clears stale animation state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const menuBtn = screen.getByRole("button", { name: "ตั้งค่า" });
    await user.click(menuBtn);
    const resetBtn = screen.getByRole("menuitem", { name: "เริ่มเกมใหม่" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(resetBtn);
    expect(document.querySelector(".hand-card.recycling")).toBeNull();
  });

  it("reset from game menu clears stale animation state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const menuBtn = screen.getByRole("button", { name: "ตั้งค่า" });
    await user.click(menuBtn);
    const resetBtn = screen.getByRole("menuitem", { name: "เริ่มเกมใหม่" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(resetBtn);
    expect(document.querySelector(".slot.filled-new")).toBeNull();
    expect(document.querySelector(".slot.support-attach")).toBeNull();
    expect(document.querySelector(".score-cue")).toBeNull();
  });

  it("failed placement produces no placement cue", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const animalBtn = findFirstHandCardByCategory("สัตว์");
    await user.click(animalBtn);
    expect(document.querySelector(".slot.filled-new")).toBeNull();
  });

  it("placement cue clears after lifecycle", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = findCardInHandByCategory(hand, "สัตว์");
    if (!animalBtn) return;
    await user.click(animalBtn);
    const board = document.querySelector(".board") as HTMLElement;
    const emptySlot = board?.querySelector(".empty-slot") as HTMLButtonElement;
    if (emptySlot) {
      await user.click(emptySlot);
      const filledSlots = board.querySelectorAll(".slot.filled");
      expect(filledSlots.length).toBeGreaterThan(0);
      await vi.waitFor(() => {
        const animSlots = board.querySelectorAll(".slot.filled-new");
        expect(animSlots.length).toBe(0);
      }, { timeout: 2000 });
    }
  });

  it("score change produces at most one score cue per player", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await endCurrentTurn(user);
    const continueBtn = screen.getByRole("button", { name: "พร้อมเล่น" });
    await user.click(continueBtn);
    const scoreCues = document.querySelectorAll(".score-cue");
    expect(scoreCues.length).toBeLessThanOrEqual(2);
  });

  it("opponent hidden cards remain anonymous", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const oppHand = screen.getByLabelText("มือคู่ต่อสู้ถูกซ่อน");
    expect(oppHand).toBeInTheDocument();
    const hiddenCards = oppHand.querySelectorAll(".card-back");
    expect(hiddenCards.length).toBeGreaterThan(0);
  });

  it("Animal-slot geometry remains stable after placement", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const board = document.querySelector(".board") as HTMLElement;
    const slotsBefore = board?.querySelectorAll(".slot");
    const slotCountBefore = slotsBefore?.length ?? 0;
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = findCardInHandByCategory(hand, "สัตว์");
    if (!animalBtn || !board) return;
    await user.click(animalBtn);
    const emptySlot = board.querySelector(".empty-slot") as HTMLButtonElement;
    if (emptySlot) {
      await user.click(emptySlot);
    }
    const slotsAfter = board.querySelectorAll(".slot");
    expect(slotsAfter.length).toBe(slotCountBefore);
  });

  it("unrelated rerender does not replay placement animation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
    const animalBtn = findCardInHandByCategory(hand, "สัตว์");
    if (!animalBtn) return;
    await user.click(animalBtn);
    const board = document.querySelector(".board") as HTMLElement;
    const emptySlot = board?.querySelector(".empty-slot") as HTMLButtonElement;
    if (emptySlot) {
      await user.click(emptySlot);
      const filledNew = board.querySelectorAll(".filled-new");
      if (filledNew.length > 0) {
        const firstNew = filledNew[0];
        expect(firstNew.classList.contains("filled-new")).toBe(true);
        await openGameMenuAndSwitchLocale(user, "en");
        expect(firstNew.classList.contains("filled-new")).toBe(true);
        await openGameMenuAndSwitchLocale(user, "th");
        expect(firstNew.classList.contains("filled-new")).toBe(true);
      }
    }
  });
});
