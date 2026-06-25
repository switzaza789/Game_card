import type { MatchState, Action, ValidationResult, PlayerId } from "../types/game";
import type { PersistedActiveMatch, MatchResult, MatchStats, ScreenType, StorageResult } from "./types";
import { saveActiveMatch, deleteActiveMatch, saveMatchResult } from "./localStorageAdapter";
import { initStats, updateStats, getHighestScoringCard } from "./statsTracker";
import { dispatchAction } from "../engine/actions/reducer";

export class PersistenceCoordinator {
  private state: MatchState | null = null;
  private screen: ScreenType = "menu";
  private stats: MatchStats = initStats();

  constructor() {}

  public initialize(state: MatchState, screen: ScreenType, stats?: MatchStats) {
    this.state = state;
    this.screen = screen;
    this.stats = stats || initStats();
  }

  public getState(): MatchState | null {
    return this.state;
  }

  public getScreen(): ScreenType {
    return this.screen;
  }

  public getStats(): MatchStats {
    return this.stats;
  }

  public setScreen(screen: ScreenType, timestamp: number): StorageResult<void> {
    this.screen = screen;
    if (this.state && this.state.status !== "FINISHED") {
      return saveActiveMatch(this.state, this.screen, this.stats, timestamp);
    }
    return { ok: true, value: undefined };
  }

  public dispatch(action: Action, timestamp: number): { state: MatchState; validation: ValidationResult; storageResult: StorageResult<void> } {
    if (!this.state) {
      throw new Error("PersistenceCoordinator not initialized");
    }

    const prevState = this.state;
    const envelope = { action, timestamp };

    const result = dispatchAction(prevState, envelope);

    if (!result.validation.valid) {
      return {
        state: result.state,
        validation: result.validation,
        storageResult: { ok: true, value: undefined }
      };
    }

    const nextState = result.state;
    this.state = nextState;
    this.stats = updateStats(this.stats, envelope, prevState, nextState);

    if (nextState.status === "FINISHED") {
      this.screen = "result";
    } else if (action.type === "END_TURN") {
      this.screen = "handoff";
    } else if (action.type === "ADVANCE_PHASE" && nextState.phase === "ACTION") {
      this.screen = "battle";
    }

    let storageResult: StorageResult<void> = { ok: true, value: undefined };

    if (nextState.status === "FINISHED") {
      storageResult = this.executeMatchFinishTransaction(timestamp);
    } else {
      storageResult = saveActiveMatch(nextState, this.screen, this.stats, timestamp);
    }

    return {
      state: nextState,
      validation: result.validation,
      storageResult
    };
  }

  private executeMatchFinishTransaction(timestamp: number): StorageResult<void> {
    if (!this.state) {
      return { ok: true, value: undefined };
    }

    const result = this.buildMatchResult(this.state, this.stats, timestamp);
    
    const historySaveResult = saveMatchResult(result);
    if (!historySaveResult.ok) {
      saveActiveMatch(this.state, this.screen, this.stats, timestamp);
      return historySaveResult;
    }

    const deleteResult = deleteActiveMatch();
    if (!deleteResult.ok) {
      return deleteResult;
    }

    return { ok: true, value: undefined };
  }

  public buildMatchResult(state: MatchState, stats: MatchStats, endedTimestamp: number): MatchResult {
    const startAction = state.actionLog.find((entry) => entry.action.type === "START_MATCH");
    const startedAt = startAction ? startAction.timestamp : endedTimestamp;

    let sentToGraveyard = 0;
    let returnedToHand = 0;
    let voluntarySwap = 0;

    const playerIds: PlayerId[] = ["P1", "P2"];
    for (const pid of playerIds) {
      for (const cardId in stats.sentToGraveyard[pid]) {
        sentToGraveyard += stats.sentToGraveyard[pid][cardId];
      }
      for (const cardId in stats.returnedToHand[pid]) {
        returnedToHand += stats.returnedToHand[pid][cardId];
      }
      for (const cardId in stats.voluntarySwap[pid]) {
        voluntarySwap += stats.voluntarySwap[pid][cardId];
      }
    }

    const highestScoringCard = getHighestScoringCard(stats, state.actionLog);

    return {
      matchId: state.matchId,
      gameMode: state.gameMode ?? "LOCAL_PVP",
      winner: state.winner ?? "DRAW",
      finalScores: {
        P1: state.players.P1.score,
        P2: state.players.P2.score
      },
      turnCount: state.turnNumber,
      startedAt,
      endedAt: endedTimestamp,
      duration: endedTimestamp - startedAt,
      recycleCount: (stats.recycleCount.P1 || 0) + (stats.recycleCount.P2 || 0),
      boardExitCount: {
        sentToGraveyard,
        returnedToHand,
        voluntarySwap
      },
      highestScoringCard,
      finishReason: state.finishReason ?? "TURN_LIMIT"
    };
  }

  public performRecoveryIfFinished(persisted: PersistedActiveMatch, timestamp: number): StorageResult<void> {
    const result = this.buildMatchResult(persisted.state, persisted.stats, timestamp);
    const historySaveResult = saveMatchResult(result);
    if (!historySaveResult.ok) {
      return historySaveResult;
    }
    return deleteActiveMatch();
  }
}
