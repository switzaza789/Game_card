import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMatch } from "../engine/state/match";
import { App, ResultScreen } from "./App";

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
  });

  it("plays an Animal from hand", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    await clickHandCard(user, /สุนัขจอมซน/);
    await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));

    expect(screen.getAllByRole("button", { name: /สุนัขจอมซน/ }).length).toBeGreaterThan(0);
    expect(screen.getByText(/สำเร็จ/)).toBeInTheDocument();
  });

  it("plays Support by selecting a legal target", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await playDog(user);

    await clickHandCard(user, /เมล็ดพืชชั้นดี/);
    await clickEnabledTarget(user, /สุนัขจอมซน/);

    expect(screen.getByText(/เมล็ดพืชชั้นดี สำเร็จ/)).toBeInTheDocument();
  });

  it("validates Recycle and shows player handoff privacy screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);

    await clickHandCard(user, /ที่ครอบปาก/);
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

    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));
    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));

    await clickHandCard(user, /ที่ครอบปาก/);
    await user.click(screen.getByRole("button", { name: "Recycle" }));
    expect(screen.getByText(/Recycle สำเร็จ/)).toBeInTheDocument();
  });

  it("plays Weakness against an opponent target after handoff", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);
    await startBattle(user);
    await playDog(user);
    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));
    await playDog(user);
    await user.click(screen.getByRole("button", { name: "จบเทิร์น" }));
    await user.click(screen.getByRole("button", { name: "พร้อมเล่น" }));

    await clickHandCard(user, /ที่ครอบปาก/);
    await clickEnabledTarget(user, /สุนัขจอมซน/);

    expect(screen.getByText(/ที่ครอบปาก สำเร็จ/)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

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
    expect(screen.getByText("TARGET_SCORE")).toBeInTheDocument();
  });
});

async function startBattle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "เริ่มเกมใหม่" }));
}

async function playDog(user: ReturnType<typeof userEvent.setup>) {
  await clickHandCard(user, /สุนัขจอมซน/);
  await user.click(screen.getByRole("button", { name: "เล่นการ์ด" }));
}

async function clickHandCard(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const hand = screen.getByLabelText("มือผู้เล่นปัจจุบัน");
  const card = within(hand).getByRole("button", { name });
  await user.click(card);
}

async function clickEnabledTarget(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const targets = screen.getAllByRole("button", { name });
  const target = targets.find((button) => !button.hasAttribute("disabled"));

  if (!target) {
    throw new Error(`No enabled target for ${name}`);
  }

  await user.click(target);
}
