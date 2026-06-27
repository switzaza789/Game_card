import { useMemo, useState, useEffect, useRef, type RefObject } from "react";
import { runPveNormalAiTurn } from "../ai/aiTurnController";
import { preparePveHumanTurnToAction } from "./pveHumanTurnController";
import { cardCatalog } from "../data/cardsSeed";
import { gameConfig } from "../data/gameConfig";
import { getCardDefinition, isAnimalInstance } from "../engine/cards/deck";
import { createMatch } from "../engine/state/match";
import { otherPlayerId } from "../engine/state/selectors";
import type { Action, ActionLogEntry, AnimalInstance, CardCategory, CardDefinition, GameMode, MatchState, PlayerId, Target } from "../types/game";
import { validateAction } from "../engine/validation/validation";
import { PersistenceCoordinator } from "../persistence/persistenceCoordinator";
import {
  loadActiveMatch,
  deleteActiveMatch,
  listMatchHistory,
  clearMatchHistory,
  exportMatchLog,
  importMatchLog,
  saveActiveMatch,
  saveHumanFeedback,
  exportAllMatchHistory,
  exportSingleMatchHistoryRecord,
  matchHistoryFilename,
  singleMatchHistoryFilename
} from "../persistence/localStorageAdapter";
import { initStats, getHighestScoringCard } from "../persistence/statsTracker";
import type { MatchResult, MatchStats, StorageError } from "../persistence/types";
import { formatActionLogEntry, localizedStatusLabel, renderActionFeedback, type ActionFeedback, type ToastFeedback } from "../ui/effectFeedback";
import { mapEntryToCombatVisuals, type CombatVisualEvent, type CombatVisualKind } from "../ui/combatVisuals";
import { mapScoreResolutionToBreakdown, type AnimalScoreContribution, type ScoreComponent, type TeamScoreAdjustment, type TurnScoreBreakdown } from "../ui/turnScoreBreakdown";
import { getLocalizedCard, getStoredLocale, localeOptions, setStoredLocale, t, type Locale, type TranslationKey } from "../i18n";
import { getCardArtwork, getArtworkAltText, ARTWORK_PLACEHOLDER, resolveCardArtwork } from "../ui/cardArtwork";
import { getCardLevelVisualState } from "../ui/cardLevelVisuals";
import {
  buildPlaytestFeedbackPayload,
  humanFeedbackFilename,
  type FeedbackRatingKey,
  type FeedbackTextKey,
  type PlayerSeat,
  type PlaytestFeedbackInput
} from "../playtest/playtestFeedback";

/** Convert any StorageError to a displayable string */
function storageErrorMessage(err: StorageError): string {
  if ("message" in err) {
    return err.message;
  }
  return err.errors.join("; ");
}

type Screen = "menu" | "howToPlay" | "library" | "battle" | "handoff" | "result" | "history";
type PersistableScreen = Exclude<Screen, "history">;

type ModalState =
  | { type: "card"; card: CardDefinition }
  | { type: "graveyard"; playerId: PlayerId }
  | null;

const categoryLabels: Record<Locale, Record<CardCategory, string>> = {
  th: {
    Animal: "สัตว์",
    Support: "สนับสนุน",
    Weakness: "จุดอ่อน",
    Special: "พิเศษ"
  },
  en: {
    Animal: "Animal",
    Support: "Support",
    Weakness: "Weakness",
    Special: "Special"
  }
};

function localizedCategoryLabel(category: CardCategory, locale: Locale): string {
  return categoryLabels[locale][category];
}

export function App() {
  const coordinator = useMemo(() => new PersistenceCoordinator(), []);
  const [locale, setLocale] = useState<Locale>(() => getStoredLocale());
  const [screen, setScreen] = useState<Screen>("menu");
  const [match, setMatch] = useState<MatchState | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [message, setMessage] = useState(t(locale, "feedback.unknown"));
  const [modal, setModal] = useState<ModalState>(null);
  const [hasSavedGame, setHasSavedGame] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  const [playtestFeedbackOpen, setPlaytestFeedbackOpen] = useState(false);
  const [playtestError, setPlaytestError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [pendingAnimalSlot, setPendingAnimalSlot] = useState<Target | null>(null);
  const [endTurnConfirmOpen, setEndTurnConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const lastFeedbackExportRef = useRef<string | null>(null);
  const aiExecutionRef = useRef<string | null>(null);
  const humanTurnPrepRef = useRef<string | null>(null);
  const [toastFeedback, setToastFeedback] = useState<ToastFeedback | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showMinorToast(key: ToastFeedback["key"], params?: Record<string, string | number>) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastFeedback({ key, params, severity: "minor" });
    toastTimerRef.current = setTimeout(() => {
      setToastFeedback(null);
      toastTimerRef.current = null;
    }, 3000);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setStoredLocale(locale);
  }, [locale]);

  useEffect(() => {
    const loadResult = loadActiveMatch();
    if (loadResult.ok) {
      const persisted = loadResult.value;
      if (persisted) {
        if (persisted.state.status === "FINISHED") {
          const recoveryResult = coordinator.performRecoveryIfFinished(
            persisted,
            persisted.state.actionLog[persisted.state.actionLog.length - 1]?.timestamp ?? Date.now()
          );
          coordinator.initialize(persisted.state, "result", persisted.stats);
          setMatch(persisted.state);
          setScreen("result");
          if (recoveryResult.ok) {
            setMessage(t(locale, "feedback.recoverySuccess"));
          } else {
            setMessage(t(locale, "feedback.recoveryFailed", { reason: storageErrorMessage(recoveryResult.error) }));
          }
        } else {
          setHasSavedGame(true);
        }
      }
    } else {
      setMessage(t(locale, "feedback.loadError", { reason: storageErrorMessage(loadResult.error) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator]);

  function startGame(gameMode: GameMode = "LOCAL_PVP") {
    if (hasSavedGame && !window.confirm(t(locale, "confirm.overwriteSave"))) {
      return;
    }

    const timestamp = Date.now();
    const freshMatch = createMatch({ matchId: `match-${timestamp}`, seed: `match-${timestamp}`, gameMode });
    coordinator.initialize(freshMatch, "battle", initStats());

    const dispatchResult = coordinator.dispatch({
      type: "START_MATCH",
      playerId: "P1",
      payload: { seed: freshMatch.rng.seed }
    }, timestamp);

    let currentMatch = dispatchResult.state;
    let loopRes = dispatchResult;
    while (currentMatch.status !== "FINISHED" && currentMatch.phase !== "ACTION") {
      loopRes = coordinator.dispatch({
        type: "ADVANCE_PHASE",
        playerId: currentMatch.currentPlayerId,
        payload: {}
      }, Date.now());
      currentMatch = loopRes.state;
    }

    setMatch(currentMatch);
    setSelectedCardId(null);
    setMessage(gameMode === "PVE_NORMAL" ? t(locale, "feedback.pveStarted") : t(locale, "feedback.gameStarted"));
    setScreen("battle");
    setHasSavedGame(false);
  }

  function resumeGame() {
    const loadResult = loadActiveMatch();
    if (loadResult.ok && loadResult.value) {
      const persisted = loadResult.value;
      coordinator.initialize(persisted.state, persisted.screen, persisted.stats);
      setMatch(persisted.state);
      setScreen(persisted.state.gameMode === "PVE_NORMAL" && persisted.state.currentPlayerId === "P2" && persisted.screen === "handoff" ? "battle" : persisted.screen);
      setSelectedCardId(null);
      setMessage(t(locale, "feedback.gameResumed", { player: playerName(persisted.state.currentPlayerId, locale) }));
    } else {
      setMessage(loadResult.ok ? t(locale, "feedback.saveNotFound") : t(locale, "feedback.loadFailed", { reason: storageErrorMessage(loadResult.error) }));
    }
  }

  function clearSave() {
    if (window.confirm(t(locale, "confirm.deleteSave"))) {
      const delResult = deleteActiveMatch();
      if (delResult.ok) {
        setHasSavedGame(false);
        setMessage(t(locale, "feedback.saveDeleted"));
      } else {
        setMessage(t(locale, "feedback.saveDeleteFailed", { reason: storageErrorMessage(delResult.error) }));
      }
    }
  }

  function handleImport(jsonText: string) {
    if (match && match.status !== "FINISHED" && !window.confirm(t(locale, "confirm.importOverwrite"))) {
      return;
    }

    const impResult = importMatchLog(jsonText);
    if (impResult.ok) {
      const persisted = impResult.value;
      coordinator.initialize(persisted.state, persisted.screen, persisted.stats);
      setMatch(persisted.state);
      setScreen(persisted.screen);
      setHasSavedGame(false);
      setSelectedCardId(null);
      setMessage(t(locale, "feedback.importSuccess"));
      saveActiveMatch(persisted.state, persisted.screen, persisted.stats, Date.now());
      setShowImport(false);
      setImportError(null);
    } else {
      setImportError(t(locale, "feedback.importFailed", { reason: storageErrorMessage(impResult.error) }));
    }
  }

  function handleExport() {
    if (!match) return;
    const expResult = exportMatchLog(match, toPersistableScreen(screen), coordinator.getStats());
    if (expResult.ok) {
      if (!navigator.clipboard?.writeText || !window.isSecureContext) {
        setExportText(expResult.value);
        setMessage(t(locale, "feedback.clipboardUnavailable"));
        return;
      }

      void navigator.clipboard.writeText(expResult.value)
        .then(() => {
          alert(t(locale, "feedback.clipboardSuccess"));
        })
        .catch(() => {
          setExportText(expResult.value);
          setMessage(t(locale, "feedback.clipboardUnavailable"));
        });
    } else {
      alert(t(locale, "feedback.exportFailed", { reason: storageErrorMessage(expResult.error) }));
    }
  }

  function handlePlaytestExport(input: PlaytestFeedbackInput) {
    if (!match) return;
    const timestamp = Date.now();
    const feedbackResult = buildPlaytestFeedbackPayload(match, input, timestamp);
    if (!feedbackResult.ok) {
      setPlaytestError(feedbackResult.errors.join("; "));
      return;
    }

    const duplicateKey = JSON.stringify({ matchId: match.matchId, input });
    if (lastFeedbackExportRef.current === duplicateKey) {
      setPlaytestError(t(locale, "feedback.playtestDuplicateError"));
      return;
    }

    const saveResult = saveHumanFeedback(feedbackResult.value);
    if (!saveResult.ok) {
      setPlaytestError(t(locale, "feedback.playtestSaveFailed", { reason: storageErrorMessage(saveResult.error) }));
      return;
    }

    const json = JSON.stringify(feedbackResult.value, null, 2);
    lastFeedbackExportRef.current = duplicateKey;
    setPlaytestError(null);
    setPlaytestFeedbackOpen(false);
    downloadJson(json, humanFeedbackFilename(match.matchId, timestamp));
    setMessage(t(locale, "feedback.playtestSaved"));
    if (!navigator.clipboard?.writeText || !window.isSecureContext) {
      setExportText(json);
      return;
    }

    void navigator.clipboard.writeText(json)
      .then(() => {
        alert(t(locale, "feedback.clipboardPlaytestSuccess"));
      })
      .catch(() => {
        setExportText(json);
      });
  }

  function resetMatch() {
    const deleteResult = deleteActiveMatch();
    setMatch(null);
    setSelectedCardId(null);
    setActionFeedback(null);
    setModal(null);
    setPendingAnimalSlot(null);
    setEndTurnConfirmOpen(false);
    setResetConfirmOpen(false);
    setPlaytestFeedbackOpen(false);
    setHasSavedGame(false);
    setScreen("menu");
    setMessage(deleteResult.ok ? t(locale, "feedback.gameReset") : t(locale, "feedback.resetButDeleteFailed", { reason: storageErrorMessage(deleteResult.error) }));
  }

  function requestResetMatch() {
    setResetConfirmOpen(true);
  }

  function cancelResetMatch() {
    setResetConfirmOpen(false);
  }

  function returnToMenu() {
    const deleteResult = deleteActiveMatch();
    setMatch(null);
    setSelectedCardId(null);
    setActionFeedback(null);
    setModal(null);
    setPendingAnimalSlot(null);
    setEndTurnConfirmOpen(false);
    setResetConfirmOpen(false);
    setPlaytestFeedbackOpen(false);
    setHasSavedGame(false);
    setScreen("menu");
    if (!deleteResult.ok) {
      setMessage(t(locale, "feedback.returnedToMenuButDeleteFailed", { reason: storageErrorMessage(deleteResult.error) }));
    }
  }

  function continueFromHandoff() {
    if (!match) {
      return;
    }

    let currentMatch = match;
    const startingLogLength = currentMatch.actionLog.length;
    let loopRes = { state: currentMatch };
    while (currentMatch.status !== "FINISHED" && currentMatch.phase !== "ACTION") {
      loopRes = coordinator.dispatch({
        type: "ADVANCE_PHASE",
        playerId: currentMatch.currentPlayerId,
        payload: {}
      }, Date.now());
      currentMatch = loopRes.state;
    }

    setMatch(currentMatch);
    setSelectedCardId(null);
    const scoreEntry = findLatestScoreEntry(currentMatch.actionLog, startingLogLength);
    setActionFeedback(scoreEntry ? { type: "combat", entry: scoreEntry } : null);
    setMessage(t(locale, "feedback.turnResumed", { player: playerName(currentMatch.currentPlayerId, locale) }));
    setScreen(currentMatch.status === "FINISHED" ? "result" : "battle");
  }

  function endTurn() {
    if (!match) {
      return;
    }

    const result = coordinator.dispatch({
      type: "END_TURN",
      playerId: match.currentPlayerId,
      payload: {}
    }, Date.now());

    setMatch(result.state);
    setSelectedCardId(null);
    if (!result.validation.valid) {
      setMessage(result.validation.errors.map(e => localizeValidationReason(e, locale)).join(", "));
    } else {
      setMessage(t(locale, "feedback.turnEnded"));
      if (result.state.status === "FINISHED") {
        setScreen("result");
      } else if (result.state.gameMode === "PVE_NORMAL" && result.state.currentPlayerId === "P2") {
        setScreen("battle");
      } else {
        setScreen("handoff");
      }
    }

    const sr1 = result.storageResult;
    if (!sr1.ok) {
      setMessage((prev) => `${prev}${t(locale, "feedback.saveFailedSuffix", { reason: storageErrorMessage(sr1.error) })}`);
    }
  }

  useEffect(() => {
    if (!match || screen !== "battle" || match.gameMode !== "PVE_NORMAL" || match.currentPlayerId !== "P2" || match.status === "FINISHED") {
      return;
    }
    const aiTurnKey = `${match.matchId}:${match.turnNumber}:${match.currentPlayerId}`;
    if (aiExecutionRef.current === aiTurnKey) {
      return;
    }
    aiExecutionRef.current = aiTurnKey;
    const timer = window.setTimeout(() => {
      try {
        const result = runPveNormalAiTurn({
          getState: () => coordinator.getState() ?? match,
          dispatch: (action) => coordinator.dispatch(action, Date.now())
        });
        const currentMatch = result.state;
        const botEntry = [...currentMatch.actionLog].reverse().find((entry) => entry.actor === "P2" && entry.action.type === "PLAY_CARD" && entry.validation.valid);
        setMatch(currentMatch);
        setSelectedCardId(null);
        setActionFeedback(botEntry ? { type: "combat", entry: botEntry } : null);
        setScreen(currentMatch.status === "FINISHED" ? "result" : "battle");
        if (currentMatch.status === "FINISHED") {
          setMessage(t(locale, "feedback.matchFinished"));
        } else if (currentMatch.currentPlayerId === "P1") {
          setMessage(t(locale, "feedback.pveTurnEnded"));
        } else if (result.actionLimitFallback) {
          setMessage(t(locale, "feedback.pveActionLimitReached"));
        }
      } finally {
        if (aiExecutionRef.current === aiTurnKey) {
          aiExecutionRef.current = null;
        }
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      if (aiExecutionRef.current === aiTurnKey) {
        aiExecutionRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator, match, screen]);

  useEffect(() => {
    if (!match || screen !== "battle" || match.gameMode !== "PVE_NORMAL" || match.currentPlayerId !== "P1" || match.status === "FINISHED" || match.phase === "ACTION") {
      return;
    }
    const prepKey = `${match.matchId}:${match.turnNumber}:${match.currentPlayerId}`;
    if (humanTurnPrepRef.current === prepKey) {
      return;
    }
    humanTurnPrepRef.current = prepKey;
    const timer = window.setTimeout(() => {
      try {
        const result = preparePveHumanTurnToAction({
          getState: () => coordinator.getState() ?? match,
          dispatch: (action) => coordinator.dispatch(action, Date.now())
        });
        const currentMatch = result.state;
        setMatch(currentMatch);
        setSelectedCardId(null);
        setScreen(currentMatch.status === "FINISHED" ? "result" : "battle");
        if (currentMatch.status === "FINISHED") {
          setMessage(t(locale, "feedback.matchFinished"));
        } else if (currentMatch.phase === "ACTION") {
          setMessage(t(locale, "feedback.yourTurn"));
        } else if (result.stoppedByRejection) {
          setMessage(t(locale, "feedback.turnStartFailed"));
        } else {
          setMessage(t(locale, "feedback.preparingTurn"));
        }
      } finally {
        if (humanTurnPrepRef.current === prepKey) {
          humanTurnPrepRef.current = null;
        }
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (humanTurnPrepRef.current === prepKey) {
        humanTurnPrepRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinator, match, screen]);

  function recycleSelected() {
    if (!match || !selectedCardId) {
      const reason = t(locale, "playability.reason.recycleNoCard");
      setMessage(reason);
      setActionFeedback({ type: "recycle", success: false, reason });
      return;
    }
    const before = match;

    const result = coordinator.dispatch({
      type: "RECYCLE",
      playerId: match.currentPlayerId,
      payload: { cardInstanceId: selectedCardId }
    }, Date.now());

    setMatch(result.state);
    setSelectedCardId(null);
    if (!result.validation.valid) {
      const reason = result.validation.errors.map(e => localizeValidationReason(e, locale)).join(", ");
      setMessage(reason);
      showMinorToast("toast.recycleFailed");
      setActionFeedback(null);
    } else {
      setMessage(t(locale, "feedback.recycle.success"));
      const drawnId = result.state.players[match.currentPlayerId].hand.find((id) => !before.players[match.currentPlayerId].hand.includes(id));
      setActionFeedback({
        type: "recycle",
        success: true,
        selectedCardInstanceId: selectedCardId,
        drawnCardInstanceId: drawnId ?? undefined,
        deckCount: result.state.players[match.currentPlayerId].deck.length
      });
    }

    const sr2 = result.storageResult;
    if (!sr2.ok) {
      setMessage((prev) => `${prev}${t(locale, "feedback.saveFailedSuffix", { reason: storageErrorMessage(sr2.error) })}`);
    }
  }

  function playSelected(target?: Target) {
    if (!match || !selectedCardId) {
      return;
    }
    playCardFromHand(selectedCardId, target);
  }

  function playCardFromHand(cardInstanceId: string, target?: Target) {
    if (!match) {
      return;
    }

    const card = match.cardsByInstanceId[cardInstanceId];
    const definition = getCardDefinition(card.definitionId);

    const payload: Extract<Action, { type: "PLAY_CARD" }>["payload"] = {
      cardInstanceId,
      target
    };

    if (definition.category === "Weakness" && target?.instanceId) {
      const targetCard = match.cardsByInstanceId[target.instanceId];
      const shieldId = findHandCard(match, targetCard.ownerId, "X002");

      if (shieldId && window.confirm(t(locale, "confirm.weaknessShield", { player: playerName(targetCard.ownerId, locale) }))) {
        payload.reactionCardInstanceId = shieldId;
      }
    }

    if (definition.card_id === "X003") {
      const replacement = match.players[match.currentPlayerId].hand.find((id) => {
        if (id === cardInstanceId) {
          return false;
        }
        return getCardDefinition(match.cardsByInstanceId[id].definitionId).category === "Animal";
      });
      payload.replacementCardInstanceId = replacement;
    }

    if (definition.card_id === "A008") {
      payload.selectedSupportInstanceId = findOwnAttachedSupport(match, match.currentPlayerId);
    }

    payload.bottomCardInstanceId = match.players[match.currentPlayerId].hand.find((id) => id !== cardInstanceId);

    const result = coordinator.dispatch({
      type: "PLAY_CARD",
      playerId: match.currentPlayerId,
      payload
    }, Date.now());

    setMatch(result.state);
    setSelectedCardId(null);
    setPendingAnimalSlot(null);
    if (!result.validation.valid) {
      const errors = result.validation.errors;
      const reason = errors.map(e => localizeValidationReason(e, locale)).join(", ");
      setMessage(reason);
      showMinorToast("toast.playFailed");
      setActionFeedback(null);
    } else {
      const localizedCard = getLocalizedCard(definition.card_id, locale);
      setMessage(`${localizedCard.name} ${t(locale, "log.result.full")}`);
      setActionFeedback({ type: "combat", entry: result.state.actionLog[result.state.actionLog.length - 1] });
      if (result.state.status === "FINISHED") {
        setScreen("result");
      }
    }

    const sr3 = result.storageResult;
    if (!sr3.ok) {
      setMessage((prev) => `${prev}${t(locale, "feedback.saveFailedSuffix", { reason: storageErrorMessage(sr3.error) })}`);
    }
  }

  function selectCard(id: string) {
    if (match && pendingAnimalSlot) {
      const definition = getCardDefinition(match.cardsByInstanceId[id].definitionId);
      if (definition.category === "Animal") {
        playCardFromHand(id, pendingAnimalSlot);
        return;
      }
    }
    setSelectedCardId(id);
  }

  function requestEndTurn() {
    setEndTurnConfirmOpen(true);
  }

  function undoLastAction() {
    if (!match) return;
    const result = coordinator.dispatch({ type: "UNDO_LAST_REVERSIBLE_ACTION", playerId: match.currentPlayerId, payload: {} }, Date.now());
    setMatch(result.state);
    const success = result.validation.valid;
    const text = success ? t(locale, "feedback.undo.success") : result.validation.errors.map(e => localizeValidationReason(e, locale)).join(", ");
    setMessage(text);
    if (success) {
      setActionFeedback({ type: "undo", success, lastLogResult: result.state.actionLog[result.state.actionLog.length - 1]?.result ?? "" });
    } else {
      showMinorToast("toast.undoFailed");
      setActionFeedback(null);
    }
  }

  const selectedDefinition = useMemo(() => {
    if (!match || !selectedCardId) {
      return null;
    }
    return getCardDefinition(match.cardsByInstanceId[selectedCardId].definitionId);
  }, [match, selectedCardId]);

  if (screen === "howToPlay") {
      return <HowToPlay onBack={() => setScreen("menu")} locale={locale} />;
  }

  if (screen === "library") {
      return <CardLibrary onBack={() => setScreen("menu")} onOpenCard={(card) => setModal({ type: "card", card })} modal={modal} onCloseModal={() => setModal(null)} locale={locale} onLocaleChange={setLocale} />;
  }

  if (screen === "history") {
    return (
      <>
        <HistoryScreen onBack={() => setScreen("menu")} onShowExport={(json) => setExportText(json)} onMessage={setMessage} locale={locale} />
        {exportText && (
          <ExportModal
            value={exportText}
            onClose={() => setExportText(null)}
            locale={locale}
          />
        )}
      </>
    );
  }

  if (screen === "handoff" && match && !(match.gameMode === "PVE_NORMAL" && match.currentPlayerId === "P2")) {
    return <HandoffScreen nextPlayerId={match.currentPlayerId} onContinue={continueFromHandoff} locale={locale} />;
  }

  if ((screen === "result" || match?.status === "FINISHED") && match) {
    return (
      <>
        <ResultScreen
          match={match}
          stats={coordinator.getStats()}
          onNewGame={startGame}
          onBackToMenu={returnToMenu}
          onExport={() => { void handleExport(); }}
          onOpenPlaytestFeedback={() => {
            setPlaytestError(null);
            setPlaytestFeedbackOpen(true);
          }}
          locale={locale}
        />
        {playtestFeedbackOpen && (
          <PlaytestFeedbackModal
            onClose={() => setPlaytestFeedbackOpen(false)}
            onExport={handlePlaytestExport}
            error={playtestError}
            locale={locale}
          />
        )}
        {exportText && (
          <ExportModal
            value={exportText}
            onClose={() => setExportText(null)}
            locale={locale}
          />
        )}
      </>
    );
  }

  if (screen === "battle" && match) {
    return (
        <BattleScreen
          match={match}
        activePlayerId={match.currentPlayerId}
        opponentId={otherPlayerId(match.currentPlayerId)}
        selectedCardId={selectedCardId}
        selectedDefinition={selectedDefinition}
        message={message}
        modal={modal}
        onSelectCard={selectCard}
        onPlaySelected={playSelected}
        onSelectEmptySlot={(target) => {
          if (selectedDefinition?.category === "Animal") {
            playSelected(target);
          } else {
            setPendingAnimalSlot(target);
            setMessage(t(locale, "feedback.selectCardForSlot"));
          }
        }}
        onRecycle={recycleSelected}
        onEndTurn={requestEndTurn}
        onUndo={undoLastAction}
        onOpenCard={(card) => setModal({ type: "card", card })}
        onOpenGraveyard={(playerId) => setModal({ type: "graveyard", playerId })}
        onCloseModal={() => setModal(null)}
        onResetMatch={requestResetMatch}
        controlsDisabled={(match.gameMode === "PVE_NORMAL" && match.currentPlayerId === "P2") || match.phase !== "ACTION"}
        actionFeedback={actionFeedback}
        onDismissFeedback={() => setActionFeedback(null)}
        endTurnConfirmOpen={endTurnConfirmOpen}
        onCancelEndTurn={() => setEndTurnConfirmOpen(false)}
          onConfirmEndTurn={() => {
            setEndTurnConfirmOpen(false);
            endTurn();
          }}
          locale={locale}
          onLocaleChange={setLocale}
          toastFeedback={toastFeedback}
          resetConfirmOpen={resetConfirmOpen}
          onCancelReset={cancelResetMatch}
          onConfirmReset={resetMatch}
        />
    );
  }

  return (
    <>
      <MainMenu
        onStart={startGame}
        onHowToPlay={() => setScreen("howToPlay")}
        onLibrary={() => setScreen("library")}
        hasSavedGame={hasSavedGame}
        onContinue={resumeGame}
        onClearSave={clearSave}
        onViewHistory={() => setScreen("history")}
        onOpenImport={() => {
          setImportError(null);
          setShowImport(true);
        }}
        locale={locale}
        onLocaleChange={setLocale}
      />
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={handleImport}
          error={importError}
          locale={locale}
        />
      )}
      {exportText && (
        <ExportModal
          value={exportText}
          onClose={() => setExportText(null)}
          locale={locale}
        />
      )}
    </>
  );
}

function MainMenu({
  onStart,
  onHowToPlay,
  onLibrary,
  hasSavedGame,
  onContinue,
  onClearSave,
  onViewHistory,
  onOpenImport,
  locale,
  onLocaleChange
}: {
  onStart: (gameMode?: GameMode) => void;
  onHowToPlay: () => void;
  onLibrary: () => void;
  hasSavedGame: boolean;
  onContinue: () => void;
  onClearSave: () => void;
  onViewHistory: () => void;
  onOpenImport: () => void;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <main className="app-shell" aria-labelledby="game-title">
      <section className="start-panel">
        <LocaleSelector locale={locale} onChange={onLocaleChange} />
        <p className="eyebrow">{t(locale, "app.subtitle")}</p>
        <h1 id="game-title">{t(locale, "app.title")}</h1>
        <dl className="summary-grid" aria-label={t(locale, "menu.savedGameAria")}>
          <div><dt>{t(locale, "menu.version")}</dt><dd>{gameConfig.version}</dd></div>
          <div><dt>{t(locale, "menu.cardCount")}</dt><dd>{cardCatalog.cards.length}</dd></div>
          <div><dt>{t(locale, "menu.players")}</dt><dd>{gameConfig.players}</dd></div>
          <div><dt>{t(locale, "menu.targetScore")}</dt><dd>{gameConfig.target_score}</dd></div>
        </dl>
        <div className="menu-actions">
          {hasSavedGame && (
            <>
              <button type="button" onClick={onContinue} aria-label={t(locale, "menu.continue")}>{t(locale, "menu.continue")}</button>
              <button type="button" className="danger-button" onClick={onClearSave} aria-label={t(locale, "menu.deleteAria")}>{t(locale, "menu.clearSave")}</button>
            </>
          )}
          <button type="button" onClick={() => onStart("LOCAL_PVP")} aria-label={hasSavedGame ? t(locale, "menu.newGame", { mode: t(locale, "menu.localPvp") }) : t(locale, "menu.localPvp")}>
            {hasSavedGame ? t(locale, "menu.newGame", { mode: t(locale, "menu.localPvp") }) : t(locale, "menu.localPvp")}
          </button>
          <button type="button" onClick={() => onStart("PVE_NORMAL")} aria-label={t(locale, "menu.pveNormal")}>
            {t(locale, "menu.pveNormal")} <small>{t(locale, "menu.aiLabel")}</small>
          </button>
          <button type="button" className="secondary-button" onClick={onViewHistory}>{t(locale, "menu.viewHistory")}</button>
          <button type="button" className="secondary-button" onClick={onOpenImport}>{t(locale, "menu.importSave")}</button>
          <button type="button" className="secondary-button" onClick={onHowToPlay}>{t(locale, "menu.howToPlay")}</button>
          <button type="button" className="secondary-button" onClick={onLibrary}>{t(locale, "menu.cardLibrary")}</button>
        </div>
      </section>
    </main>
  );
}

function LocaleSelector({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  const labels: Record<Locale, string> = { th: t(locale, "locale.th"), en: t(locale, "locale.en") };
  return (
    <div className="locale-selector" role="group" aria-label={t(locale, "selector.aria")}>
      {localeOptions().map((option) => (
        <button
          key={option}
          type="button"
          className={locale === option ? "locale-option active" : "locale-option"}
          aria-pressed={locale === option}
          onClick={() => onChange(option)}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

function HowToPlay({ onBack, locale }: { onBack: () => void; locale: Locale }) {
  return (
    <main className="page-shell">
      <header className="page-header">
        <h1>{t(locale, "howToPlay.title")}</h1>
        <button type="button" className="secondary-button" onClick={onBack}>{t(locale, "history.back")}</button>
      </header>
      <section className="rule-list" aria-label={t(locale, "howToPlay.title")}>
        <p>{t(locale, "howToPlay.rule1")}</p>
        <p>{t(locale, "howToPlay.rule2")}</p>
        <p>{t(locale, "howToPlay.rule3")}</p>
      </section>
    </main>
  );
}

function CardLibrary({
  onBack,
  onOpenCard,
  modal,
  onCloseModal,
  locale,
  onLocaleChange
}: {
  onBack: () => void;
  onOpenCard: (card: CardDefinition) => void;
  modal: ModalState;
  onCloseModal: () => void;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <main className="page-shell">
      <header className="page-header">
        <h1>{t(locale, "library.title")}</h1>
        <button type="button" className="secondary-button" onClick={onBack}>{t(locale, "menu.backToMenu")}</button>
      </header>
      <LocaleSelector locale={locale} onChange={onLocaleChange} />
      <div className="library-grid">
        {cardCatalog.cards.map((card) => {
          const localized = getLocalizedCard(card.card_id, locale);
          return (
            <button key={card.card_id} type="button" className={`library-card ${categoryClass(card.category)}`} onClick={() => onOpenCard(card)} aria-label={`${card.card_id} ${localized.name} - ${localized.type}`}>
              <CardArtwork cardId={card.card_id} locale={locale} variant="compact" />
              <span>{card.card_id}</span>
              <strong>{localized.name}</strong>
              <small>{localized.type}</small>
            </button>
          );
        })}
      </div>
      <Modal modal={modal} onClose={onCloseModal} locale={locale} />
    </main>
  );
}

function getInteractionGuidanceState(match: MatchState, selectedCardId: string | null): {
  recommendedAction: "play" | "target" | "end-turn" | null;
  guidanceKey: TranslationKey | null;
} {
  if (match.phase !== "ACTION" || match.status === "FINISHED") {
    return { recommendedAction: null, guidanceKey: null };
  }
  const playerId = match.currentPlayerId;

  if (selectedCardId) {
    const playability = getCardPlayability(match, playerId, selectedCardId);
    if (playability.state === "PLAYABLE_AFTER_TARGET") {
      return { recommendedAction: "target", guidanceKey: "guidance.selectTarget" };
    }
    if (playability.state === "PLAYABLE_NOW") {
      return { recommendedAction: "play", guidanceKey: null };
    }
  }

  const player = match.players[playerId];
  const hasPlayable = player.hand.some((id) => {
    const p = getCardPlayability(match, playerId, id);
    return p.state === "PLAYABLE_NOW" || p.state === "PLAYABLE_AFTER_TARGET";
  });

  if (!hasPlayable) {
    return { recommendedAction: "end-turn", guidanceKey: "label.actionsComplete" };
  }

  return { recommendedAction: null, guidanceKey: null };
}

function BattleScreen(props: {
  match: MatchState;
  activePlayerId: PlayerId;
  opponentId: PlayerId;
  selectedCardId: string | null;
  selectedDefinition: CardDefinition | null;
  message: string;
  modal: ModalState;
  onSelectCard: (id: string) => void;
  onPlaySelected: (target?: Target) => void;
  onSelectEmptySlot: (target: Target) => void;
  onRecycle: () => void;
  onEndTurn: () => void;
  onUndo: () => void;
  onOpenCard: (card: CardDefinition) => void;
  onOpenGraveyard: (playerId: PlayerId) => void;
  onCloseModal: () => void;
  onResetMatch: () => void;
  controlsDisabled?: boolean;
  actionFeedback: ActionFeedback | null;
  onDismissFeedback: () => void;
  endTurnConfirmOpen: boolean;
  onCancelEndTurn: () => void;
  onConfirmEndTurn: () => void;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  toastFeedback: ToastFeedback | null;
  resetConfirmOpen: boolean;
  onCancelReset: () => void;
  onConfirmReset: () => void;
}) {
  const { match, activePlayerId, opponentId, selectedCardId, selectedDefinition } = props;
  const controlsDisabled = Boolean(props.controlsDisabled);
  const isAiTurn = match.gameMode === "PVE_NORMAL" && match.currentPlayerId === "P2";
  const isPreparingHumanTurn = match.gameMode === "PVE_NORMAL" && match.currentPlayerId === "P1" && match.phase !== "ACTION";
  const resetConfirmButtonRef = useRef<HTMLButtonElement>(null);
const visibleLogEntries = match.actionLog
  .map((entry) => ({ entry, formatted: formatActionLogEntry(match, entry, props.locale) }))
  .filter((item) => item.formatted !== null)
  .map((item) => item as { entry: ActionLogEntry; formatted: string });
const lastLogEntry = visibleLogEntries.length > 0 ? visibleLogEntries[visibleLogEntries.length - 1].entry : undefined;
const scoreDeltas = scoreDeltaByPlayer(lastLogEntry);
  const selectedPlayability = selectedCardId ? getCardPlayability(match, activePlayerId, selectedCardId) : null;
  const feedbackLines = props.actionFeedback ? renderActionFeedback(match, props.actionFeedback, props.locale) : null;
  const incomingScoreBreakdown = useMemo(() => props.actionFeedback?.type === "combat" && props.actionFeedback.entry.action.type === "ADVANCE_PHASE"
    ? mapScoreResolutionToBreakdown({ after: match, entry: props.actionFeedback.entry })
    : null, [match, props.actionFeedback]);
  const [scoreBreakdown, setScoreBreakdown] = useState<TurnScoreBreakdown | null>(incomingScoreBreakdown);
  const [scoreDetailsOpen, setScoreDetailsOpen] = useState(false);
  const scoreContributionByAnimalId = useMemo(() => {
    const map = new Map<string, AnimalScoreContribution>();
    for (const contribution of scoreBreakdown?.animalContributions ?? []) {
      map.set(contribution.animalInstanceId, contribution);
    }
    return map;
  }, [scoreBreakdown]);
  const guidance = getInteractionGuidanceState(match, selectedCardId);
  let firstPlayableFound = false;

  const [combatVisualEvents, setCombatVisualEvents] = useState<CombatVisualEvent[]>([]);
  const prevFeedbackSeqRef = useRef<number | null>(null);
  useEffect(() => {
    if (props.actionFeedback?.type === "combat") {
      const seq = props.actionFeedback.entry.seq;
      if (prevFeedbackSeqRef.current === seq) return;
      prevFeedbackSeqRef.current = seq;
      const events = mapEntryToCombatVisuals(match, props.actionFeedback.entry);
      setCombatVisualEvents(events);
      if (events.length > 0) {
        const timer = window.setTimeout(() => setCombatVisualEvents([]), 1400);
        return () => window.clearTimeout(timer);
      }
    } else {
      const wasCombat = prevFeedbackSeqRef.current !== null;
      if (wasCombat) {
        setCombatVisualEvents([]);
        prevFeedbackSeqRef.current = null;
      }
    }
  }, [props.actionFeedback, match]);

  useEffect(() => {
    if (incomingScoreBreakdown) {
      setScoreBreakdown(incomingScoreBreakdown);
      setScoreDetailsOpen(false);
    }
  }, [incomingScoreBreakdown]);

  const activeSourceInstanceIds = useMemo(() => {
    const s = new Set<string>();
    for (const ev of combatVisualEvents) {
      if (ev.source?.instanceId) s.add(ev.source.instanceId);
    }
    return s;
  }, [combatVisualEvents]);
  const activeTargetInstanceIds = useMemo(() => {
    const s = new Set<string>();
    for (const ev of combatVisualEvents) {
      if (ev.target?.instanceId) s.add(ev.target.instanceId);
    }
    return s;
  }, [combatVisualEvents]);
  const eventByInstanceId = useMemo(() => {
    const m = new Map<string, CombatVisualEvent>();
    for (const ev of combatVisualEvents) {
      if (ev.target?.instanceId) m.set(ev.target.instanceId, ev);
      if (ev.source?.instanceId && !m.has(ev.source.instanceId)) m.set(ev.source.instanceId, ev);
    }
    return m;
  }, [combatVisualEvents]);

  useEffect(() => {
    if (props.resetConfirmOpen) {
      resetConfirmButtonRef.current?.focus();
    }
  }, [props.resetConfirmOpen]);

  return (
    <main className="battle-app">
      <section className="battle-header" aria-label={t(props.locale, "label.matchStatus")}>
        <section className="scoreboard" aria-label={t(props.locale, "label.scoreboard")} aria-live="polite">
          <div className={`scoreboard-player ${match.currentPlayerId === "P1" ? "active" : ""}`}>
            <span>{playerNameForMode("P1", match.gameMode, props.locale)}</span>
            <strong>{match.players.P1.score} / {gameConfig.target_score}</strong>
            {scoreDeltas.P1 !== 0 && <em>{scoreDeltas.P1 > 0 ? "+" : ""}{scoreDeltas.P1}</em>}
          </div>
          <div className="phase-panel">
            <strong>{t(props.locale, "label.turn")} {match.turnNumber} — {phaseLabel(match.phase, props.locale)}</strong>
          </div>
          <div className={`scoreboard-player ${match.currentPlayerId === "P2" ? "active" : ""}`}>
            <span>{playerNameForMode("P2", match.gameMode, props.locale)}</span>
            <strong>{match.players.P2.score} / {gameConfig.target_score}</strong>
            {scoreDeltas.P2 !== 0 && <em>{scoreDeltas.P2 > 0 ? "+" : ""}{scoreDeltas.P2}</em>}
          </div>
        </section>
        <div className="header-row-2">
          <div className="header-left">
            <LocaleSelector locale={props.locale} onChange={props.onLocaleChange} />
          </div>
          <div className="header-center utility-status">
            <span>{match.players[activePlayerId].utilityLocked ? t(props.locale, "label.utilityUsed") : match.players[activePlayerId].utilityActionUsed ? t(props.locale, "label.utilityUsed") : t(props.locale, "label.utilityAvailable")}</span>
          </div>
          <div className="header-right opponent-summary">
            <span>{t(props.locale, "label.deck")} {match.players[opponentId].deck.length} | {t(props.locale, "label.hand")} {match.players[opponentId].hand.length}</span>
          </div>
        </div>
      </section>

      <section className="board" aria-label={t(props.locale, "label.battlefield")}>
        {isAiTurn && <div className="ai-banner" role="status" aria-live="polite">{t(props.locale, "label.aiThinking")} — {t(props.locale, "label.computer")} is thinking...</div>}
        {isPreparingHumanTurn && <div className="ai-banner" role="status" aria-live="polite">{t(props.locale, "label.preparingTurn")}</div>}
        <HiddenHand count={match.players[opponentId].hand.length} locale={props.locale} />
        <div className="zone-label">{t(props.locale, "label.player2")}</div>
        <BoardRow match={match} ownerId={opponentId} viewerId={activePlayerId} selectedDefinition={controlsDisabled ? null : selectedDefinition} onTarget={props.onPlaySelected} onSelectEmptySlot={props.onSelectEmptySlot} onOpenGraveyard={props.onOpenGraveyard} locale={props.locale} activeSourceInstanceIds={activeSourceInstanceIds} activeTargetInstanceIds={activeTargetInstanceIds} eventByInstanceId={eventByInstanceId} scoreContributionByAnimalId={scoreContributionByAnimalId} />
        <div className="divider" />
        <BoardRow match={match} ownerId={activePlayerId} viewerId={activePlayerId} selectedDefinition={controlsDisabled ? null : selectedDefinition} onTarget={props.onPlaySelected} onSelectEmptySlot={props.onSelectEmptySlot} onOpenGraveyard={props.onOpenGraveyard} locale={props.locale} activeSourceInstanceIds={activeSourceInstanceIds} activeTargetInstanceIds={activeTargetInstanceIds} eventByInstanceId={eventByInstanceId} scoreContributionByAnimalId={scoreContributionByAnimalId} />
        <div className="zone-label">{t(props.locale, "label.you")} — {t(props.locale, "label.score")} {match.players[activePlayerId].score} / {gameConfig.target_score}</div>
      </section>

      <section className="battle-bottom">
        {scoreBreakdown && (
          <ScoreBreakdownBanner
            breakdown={scoreBreakdown}
            gameMode={match.gameMode}
            locale={props.locale}
            expanded={scoreDetailsOpen}
            onToggle={() => setScoreDetailsOpen((open) => !open)}
          />
        )}
        <div className="log" role="status">
          <strong>{t(props.locale, "label.actionLog")}</strong>
          <p>{props.message}</p>
          {visibleLogEntries.length === 0
            ? <small>{t(props.locale, "log.noAction")}</small>
            : visibleLogEntries.map((item, i) => <small key={i} className="log-entry">{item.formatted}</small>)
          }
        </div>
        <div className="bottom-right">
          <div className="player-hand" aria-label={t(props.locale, "label.playerHand")} tabIndex={0}>
            {match.players[activePlayerId].hand.map((id) => {
              const definition = getCardDefinition(match.cardsByInstanceId[id].definitionId);
              const playability = getCardPlayability(match, activePlayerId, id);
              const localizedCard = getLocalizedCard(definition.card_id, props.locale);
              const localizedPlayabilityLabel = localizePlayabilityLabel(playability, props.locale);
              const localizedCategory = localizedCategoryLabel(definition.category, props.locale);
              const playerState = match.players[activePlayerId];
              const isAnimal = definition.category === "Animal";
              const usedThisTurn = isAnimal ? playerState.animalActionUsed : (playerState.utilityActionUsed || playerState.utilityLocked);
              const isSelected = id === selectedCardId;
              let cardState: string;
              if (isSelected) {
                cardState = playability.state === "PLAYABLE_AFTER_TARGET" ? "needs-target" : "selected";
              } else if (usedThisTurn) {
                cardState = "used-this-turn";
              } else if (playability.state === "PLAYABLE_NOW") {
                cardState = "playable";
              } else if (playability.state === "PLAYABLE_AFTER_TARGET") {
                cardState = "needs-target";
              } else {
                cardState = "unavailable";
              }
              const isRecommended = !isSelected && cardState === "playable" && !firstPlayableFound;
              if (isRecommended) firstPlayableFound = true;
              const stateClasses = `hand-card ${categoryClass(definition.category)} ${isSelected ? "selected" : ""}`;
              const sourceEvent = eventByInstanceId.get(id);
              return (
                <button key={id} type="button" className={stateClasses} onClick={() => props.onSelectCard(id)} disabled={controlsDisabled} aria-disabled={cardState === "unavailable" || cardState === "used-this-turn"} aria-selected={isSelected} data-state={cardState} data-recommended={isRecommended ? "true" : undefined} aria-describedby={`playability-${id}`} aria-label={`${definition.card_id} ${localizedCard.name}, ${localizedCategory} ${t(props.locale, "card.type")}`} data-combat-source={sourceEvent && !controlsDisabled ? sourceEvent.kind : undefined}>
                  <CardArtwork cardId={definition.card_id} locale={props.locale} variant="compact" alt="" />
                  <span>{definition.card_id}</span>
                  <strong>{localizedCard.name}</strong>
                  <small>{localizedCategory}</small>
                  <small id={`playability-${id}`} className="playability-label">{localizedPlayabilityLabel}</small>
                  {sourceEvent && !controlsDisabled && <span className="combat-floating-label" role="status" aria-live="polite">{t(props.locale, visualLabelKey(sourceEvent.kind), visualLabelParams(sourceEvent))}</span>}
                </button>
              );
            })}
          </div>
          <div className="action-controls">
            <div className="buttons">
              <button type="button" onClick={() => selectedDefinition?.category === "Animal" || selectedDefinition?.card_id === "X005" ? props.onPlaySelected() : undefined} disabled={controlsDisabled || !selectedDefinition || selectedPlayability?.state === "NOT_PLAYABLE" || needsTarget(selectedDefinition)}>
                {t(props.locale, "label.playCard")}
              </button>
              <button type="button" className="secondary-button" onClick={props.onRecycle} disabled={controlsDisabled}>{t(props.locale, "label.recycle")}</button>
              <button type="button" className="secondary-button" onClick={() => props.onOpenGraveyard(activePlayerId)}>{t(props.locale, "label.graveyard")}</button>
              <button type="button" className="secondary-button" onClick={() => selectedDefinition && props.onOpenCard(selectedDefinition)} disabled={!selectedDefinition}>{t(props.locale, "label.details")}</button>
              <button type="button" className="secondary-button" onClick={props.onUndo} disabled={!match.undoSnapshot}>{t(props.locale, "label.undo")}</button>
              <button type="button" className={`danger-button${guidance.recommendedAction === "end-turn" ? " end-turn-recommended" : ""}`} onClick={props.onEndTurn} disabled={isAiTurn || (match.phase !== "ACTION" && match.phase !== "END")} data-recommended={guidance.recommendedAction === "end-turn" ? "true" : undefined}>{t(props.locale, "label.endTurn")}</button>
            </div>
            <button type="button" className="destructive-button reset-trigger" onClick={props.onResetMatch}>{t(props.locale, "label.reset")}</button>
            {guidance.guidanceKey && <p className="guidance-text">{t(props.locale, guidance.guidanceKey)}</p>}
            {props.toastFeedback && (
              <div className="toast-banner" role="status" aria-live="polite">
                {t(props.locale, props.toastFeedback.key, props.toastFeedback.params)}
              </div>
            )}
            {selectedDefinition && (
              <div className="effect-preview" aria-label={t(props.locale, "label.effectPreview")}>
                <strong>{t(props.locale, "label.effectPreview")}</strong>
                <ul>
                  {previewLines(selectedDefinition, getCardPlayability(match, activePlayerId, selectedCardId ?? ""), props.locale).map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      {feedbackLines && feedbackLines.length > 0 && (
        <section className="effect-feedback" role="status" aria-live="polite" aria-label={t(props.locale, "label.effectFeedback")}>
          <div>
            <strong>{t(props.locale, "label.effectFeedback")}</strong>
            <ul>
              {feedbackLines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <button type="button" className="secondary-button" onClick={props.onDismissFeedback}>{t(props.locale, "label.close")}</button>
        </section>
      )}

      {props.resetConfirmOpen && (
        <section className="action-modal" role="dialog" aria-modal="true" aria-label={t(props.locale, "label.resetGameConfirmTitle")} onKeyDown={(event) => { if (event.key === "Escape") { props.onCancelReset(); } }}>
          <div className="action-modal-panel">
            <strong>{t(props.locale, "label.resetGameConfirmTitle")}</strong>
            <p>{t(props.locale, "label.resetGameConfirmBody")}</p>
            <div className="modal-actions">
              <button ref={resetConfirmButtonRef} type="button" className="danger-button" onClick={props.onConfirmReset}>{t(props.locale, "label.reset")}</button>
              <button type="button" className="secondary-button" onClick={props.onCancelReset}>{t(props.locale, "label.cancel")}</button>
            </div>
          </div>
        </section>
      )}

      {props.endTurnConfirmOpen && (
        <section className="action-modal" role="dialog" aria-modal="true" aria-label={t(props.locale, "label.endTurnConfirm")}>
          <div className="action-modal-panel">
            <strong>{t(props.locale, "label.endTurn")}</strong>
            <p>{t(props.locale, "label.chooseCard")}</p>
            <div className="modal-actions">
              <button type="button" className="danger-button" onClick={props.onConfirmEndTurn}>{t(props.locale, "label.confirm")}</button>
              <button type="button" className="secondary-button" onClick={props.onCancelEndTurn}>{t(props.locale, "menu.continue")}</button>
            </div>
          </div>
        </section>
      )}

      <Modal modal={props.modal} match={match} onClose={props.onCloseModal} locale={props.locale} />
    </main>
  );
}

function BoardRow({
  match,
  ownerId,
  viewerId,
  selectedDefinition,
  onTarget,
  onSelectEmptySlot,
  onOpenGraveyard,
  locale,
  activeSourceInstanceIds,
  activeTargetInstanceIds,
  eventByInstanceId,
  scoreContributionByAnimalId
}: {
  match: MatchState;
  ownerId: PlayerId;
  viewerId: PlayerId;
  selectedDefinition: CardDefinition | null;
  onTarget: (target?: Target) => void;
  onSelectEmptySlot: (target: Target) => void;
  onOpenGraveyard: (playerId: PlayerId) => void;
  locale: Locale;
  activeSourceInstanceIds: Set<string>;
  activeTargetInstanceIds: Set<string>;
  eventByInstanceId: Map<string, CombatVisualEvent>;
  scoreContributionByAnimalId: Map<string, AnimalScoreContribution>;
}) {
  const player = match.players[ownerId];
  return (
    <div className="row">
      <div className="side-zone deck-zone"><span className="zone-title">{t(locale, "label.deck")}</span><strong>{player.deck.length}</strong></div>
      <div className="animal-zone">
        {player.board.map((instanceId, index) => {
          if (!instanceId) {
            const slotNo = (index + 1) as 1 | 2 | 3;
            const canPlace = ownerId === viewerId && (!selectedDefinition || selectedDefinition.category === "Animal");
            return canPlace
              ? <button key={index} type="button" className={`slot empty-slot ${selectedDefinition?.category === "Animal" ? "targetable" : ""}`} data-target-state={selectedDefinition?.category === "Animal" ? "valid" : undefined} aria-label={`${t(locale, "label.animalZone")} ${index + 1} ${t(locale, "label.clearSelection")}`} onClick={() => onSelectEmptySlot({ playerId: ownerId, zone: "BOARD", slotNo })}>{t(locale, "label.animalZone")} {index + 1}</button>
              : <div key={index} className="slot" aria-label={`${t(locale, "label.animalZone")} ${index + 1}`}>{t(locale, "label.animalZone")} {index + 1}</div>;
          }
          const animal = match.cardsByInstanceId[instanceId];
          if (!isAnimalInstance(animal)) {
            return <div key={index} className="slot" aria-label={`ช่อง Animal ${index + 1}`}>สัตว์ {index + 1}</div>;
          }
          const definition = getCardDefinition(animal.definitionId);
          const localizedBoardCard = getLocalizedCard(definition.card_id, locale);
          const legal = selectedDefinition ? canTarget(selectedDefinition, ownerId, viewerId, animal.level) : false;
          const isSource = activeSourceInstanceIds.has(instanceId);
          const isTarget = activeTargetInstanceIds.has(instanceId);
          const event = eventByInstanceId.get(instanceId);
          const sourceKind = isSource && event ? event.kind : undefined;
          const targetKind = isTarget && event ? event.kind : undefined;
          const scoreContribution = scoreContributionByAnimalId.get(instanceId);
          const scoreTone = scoreContribution
            ? scoreContribution.finalContribution > 0 ? "positive" : scoreContribution.finalContribution < 0 ? "negative" : scoreContribution.state === "skipped" || scoreContribution.state === "blocked" ? "blocked" : "zero"
            : undefined;
          const signedScore = scoreContribution ? `${scoreContribution.finalContribution > 0 ? "+" : ""}${scoreContribution.finalContribution}` : "";
          const visualState = getCardLevelVisualState(animal.level, animal.evolutionPoints);
          const isLevelEvent = event && (event.kind === "level-up" || event.kind === "level-down" || event.kind === "evolution-complete");
          const animClass = event?.kind === "evolution-complete" ? "evolution-complete-active"
            : event?.kind === "level-up" ? "level-up-active"
            : event?.kind === "level-down" ? "level-down-active"
            : "";
          const evolutionProgressLabel = visualState.isEvolutionComplete
            ? t(locale, "evolution.complete")
            : t(locale, "evolution.progress", { current: visualState.progressCurrent, required: visualState.progressRequired });
          const levelBadgeLabel = t(locale, "level.label") + " " + animal.level;
          return (
            <button key={instanceId} type="button" className={`slot filled ${animClass} ${legal ? "targetable" : "unavailable-target"}`} data-level-visual={visualState.tier} data-evolution-state={visualState.evolutionState} data-target-state={legal ? "valid" : undefined} disabled={!legal} aria-label={`${localizedBoardCard.name} ${levelBadgeLabel} ${t(locale, "label.animalZone")} ${animal.slotNo}${legal ? ` ${t(locale, "label.select")}` : ` ${t(locale, "label.clearSelection")}`}`} onClick={() => onTarget({ playerId: ownerId, zone: "BOARD", instanceId, slotNo: animal.slotNo })} data-combat-source={sourceKind} data-combat-target={targetKind} data-effect-active={isSource || isTarget ? "true" : undefined} data-score-result={scoreTone}>
              <span className="level-badge" aria-label={levelBadgeLabel}>{t(locale, "level.label")} {animal.level}</span>
              <span className="target-badge">{legal ? t(locale, "label.select") : t(locale, "label.clearSelection")}</span>
              <CardArtwork cardId={definition.card_id} locale={locale} variant="board" alt="" level={animal.level} />
              <strong>{localizedBoardCard.name}</strong>
              <span className="evolution-progress" data-evolution-state={visualState.evolutionState} role="progressbar" aria-valuemin={0} aria-valuemax={visualState.progressRequired} aria-valuenow={visualState.progressCurrent} aria-label={evolutionProgressLabel}>{evolutionProgressLabel}</span>
              {animal.attachedSupportIds.map((supportId) => (
                <span className="attached-support" key={supportId}>{t(locale, "label.attachedSupport")}: {getLocalizedCard(match.cardsByInstanceId[supportId].definitionId, locale).name}</span>
              ))}
              {animal.statuses.length > 0 && <small className="statuses">{t(locale, "label.statusCount")} {animal.statuses.length}: {localizedAnimalStatuses(animal, locale)}</small>}
              {isLevelEvent && <span className={`level-floating-cue ${event.kind === "evolution-complete" ? "evolution-complete-cue" : event.kind === "level-down" ? "level-down-cue" : "level-up-cue"}`} role="status" aria-live="polite">{t(locale, visualLabelKey(event.kind), visualLabelParams(event))}</span>}
              {event && !isLevelEvent && (isSource || isTarget) && <span className="combat-floating-label" role="status" aria-live="polite">{t(locale, visualLabelKey(event.kind), visualLabelParams(event))}</span>}
              {scoreContribution && <span className="score-floating-label" aria-hidden="true">{signedScore}</span>}
            </button>
          );
        })}
      </div>
      <button type="button" className="side-zone graveyard-button" onClick={() => onOpenGraveyard(ownerId)}><span className="zone-title">{t(locale, "label.graveyard")}</span><strong>{player.graveyard.length}</strong></button>
    </div>
  );
}

function HiddenHand({ count, locale }: { count: number; locale: Locale }) {
  return (
    <div className="opponent-hand" aria-label={t(locale, "label.opponentHand")}>
      {Array.from({ length: count }).map((_, index) => <div className="card-back" key={index} aria-label={t(locale, "label.hiddenCard")} role="img" />)}
    </div>
  );
}

type CardArtworkVariant = "compact" | "board" | "detail";

function CardArtwork({ cardId, locale, variant = "compact", alt: altOverride, className, level }: {
  cardId: string;
  locale: Locale;
  variant?: CardArtworkVariant;
  alt?: string;
  className?: string;
  level?: number;
}) {
  const [imgSrc, setImgSrc] = useState<string>(() => resolveCardArtwork(cardId, locale, level as 1 | 2 | 3 | undefined));
  const [failed, setFailed] = useState(false);
  const localizedCard = getLocalizedCard(cardId, locale);
  const altText = altOverride ?? getArtworkAltText(cardId, locale, localizedCard.name);
  const isPlaceholder = imgSrc === ARTWORK_PLACEHOLDER;

  useEffect(() => {
    setImgSrc(resolveCardArtwork(cardId, locale, level as 1 | 2 | 3 | undefined));
    setFailed(false);
  }, [cardId, locale, level]);

  function handleError() {
    if (failed) return;
    setFailed(true);
    const alternate = locale === "th"
      ? getCardArtwork(cardId, "en")
      : getCardArtwork(cardId, "th");
    if (alternate !== imgSrc && alternate !== ARTWORK_PLACEHOLDER) {
      setImgSrc(alternate);
    } else {
      setImgSrc(ARTWORK_PLACEHOLDER);
    }
  }

  return (
    <div className={`card-artwork variant-${variant}${isPlaceholder ? " artwork-placeholder" : ""}${className ? ` ${className}` : ""}`}>
      <img
        src={imgSrc}
        alt={altText}
        decoding="async"
        loading={variant === "compact" ? "lazy" : "eager"}
        onError={handleError}
        draggable={false}
      />
    </div>
  );
}

function HandoffScreen({ nextPlayerId, onContinue, locale }: { nextPlayerId: PlayerId; onContinue: () => void; locale: Locale }) {
  return (
    <main className="app-shell privacy-shell">
      <section className="start-panel">
        <p className="eyebrow">{t(locale, "handoff.eyebrow")}</p>
        <h1>{t(locale, "handoff.title", { player: playerName(nextPlayerId) })}</h1>
        <p>{t(locale, "handoff.privacyNotice")}</p>
        <button type="button" onClick={onContinue}>{t(locale, "handoff.readyButton")}</button>
      </section>
    </main>
  );
}

export function ResultScreen({
  match,
  stats = initStats(),
  onNewGame,
  onBackToMenu = () => undefined,
  onExport = () => undefined,
  onOpenPlaytestFeedback = () => undefined,
  locale = "th"
}: {
  match: MatchState;
  stats?: MatchStats;
  onNewGame: (gameMode?: GameMode) => void;
  onBackToMenu?: () => void;
  onExport?: () => void;
  onOpenPlaytestFeedback?: () => void;
  locale?: Locale;
}) {
  const highestCard = getHighestScoringCard(stats, match.actionLog);

  let sentToGraveyardCount = 0;
  let returnedToHandCount = 0;
  let voluntarySwapCount = 0;
  for (const pid of ["P1", "P2"] as PlayerId[]) {
    for (const cardId in stats.sentToGraveyard[pid]) {
      sentToGraveyardCount += stats.sentToGraveyard[pid][cardId];
    }
    for (const cardId in stats.returnedToHand[pid]) {
      returnedToHandCount += stats.returnedToHand[pid][cardId];
    }
    for (const cardId in stats.voluntarySwap[pid]) {
      voluntarySwapCount += stats.voluntarySwap[pid][cardId];
    }
  }

  const startAction = match.actionLog.find((entry) => entry.action.type === "START_MATCH");
  const startedAt = startAction ? startAction.timestamp : Date.now();
  const endedAt = match.actionLog[match.actionLog.length - 1]?.timestamp ?? Date.now();
  const durationMs = endedAt - startedAt;

  return (
    <main className="app-shell">
      <section className="start-panel result-panel">
        <p className="eyebrow">{t(locale, "label.matchStatus")}</p>
        <h1>{match.winner === "DRAW" ? t(locale, "label.resultDraw") : `${playerName(match.winner ?? "P1", locale)} ${t(locale, "label.resultVictory")}`}</h1>

        <dl className="summary-grid result-summary-grid">
          <div><dt>{t(locale, "label.player1")} {t(locale, "label.score")}</dt><dd>{match.players.P1.score} {t(locale, "label.score")}</dd></div>
          <div><dt>{t(locale, "label.player2")} {t(locale, "label.score")}</dt><dd>{match.players.P2.score} {t(locale, "label.score")}</dd></div>
          <div><dt>{t(locale, "label.turnCount")}</dt><dd>{match.turnNumber} {t(locale, "label.turn")}</dd></div>
          <div><dt>{t(locale, "label.finalScore")}</dt><dd>{formatDuration(durationMs)}</dd></div>
          <div><dt>{t(locale, "label.matchStatus")}</dt><dd>{match.finishReason === "TARGET_SCORE" ? t(locale, "result.finishReason.targetScore") : t(locale, "result.finishReason.maxTurns")}</dd></div>
          <div><dt>{t(locale, "label.recycle")}</dt><dd>{(stats.recycleCount.P1 || 0) + (stats.recycleCount.P2 || 0)}</dd></div>
        </dl>

        <hr className="subtle-divider" />

        <h3>{t(locale, "result.boardExits")}</h3>
        <dl className="summary-grid compact-summary-grid">
          <div><dt>{t(locale, "result.sentToGraveyard")}</dt><dd>{sentToGraveyardCount}</dd></div>
          <div><dt>{t(locale, "result.returnedToHand")}</dt><dd>{returnedToHandCount}</dd></div>
          <div><dt>{t(locale, "result.quickSwap")}</dt><dd>{voluntarySwapCount}</dd></div>
        </dl>

        <hr className="subtle-divider" />

        {highestCard && (
          <div className="highlight-card">
            <h4>{t(locale, "result.highestScoringCard")}</h4>
            <p>
              <strong>{getLocalizedCard(highestCard.cardId, locale).name}</strong> ({highestCard.cardId})
            </p>
            <p className="small-copy">
              {t(locale, "result.scoreAccumulated", { score: highestCard.score, player: playerName(highestCard.ownerId) })}
            </p>
          </div>
        )}

        <div className="menu-actions vertical-actions">
          <button type="button" onClick={() => onNewGame("LOCAL_PVP")}>{t(locale, "menu.localPvp")}</button>
          <button type="button" className="secondary-button" onClick={() => { void onExport(); }}>{t(locale, "result.exportWithClipboard", { label: t(locale, "label.exportLog") })}</button>
          <button type="button" className="secondary-button" onClick={onOpenPlaytestFeedback}>{t(locale, "result.playtestFeedback")}</button>
          <button type="button" className="secondary-button" onClick={onBackToMenu}>{t(locale, "label.returnToMenu")}</button>
        </div>
      </section>
    </main>
  );
}

function Modal({ modal, match, onClose, locale }: { modal: ModalState; match?: MatchState; onClose: () => void; locale: Locale }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (modal) {
      closeButtonRef.current?.focus();
    }
  }, [modal]);

  if (!modal) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={modal.type === "card" ? (match ? t(locale, "label.details") : getLocalizedCard(modal.card.card_id, locale).name) : t(locale, "label.graveyard")}>
      <section className="modal-panel" tabIndex={-1}>
        {modal.type === "card" ? (
          match ? (
            <div className="card-detail-layout">
              <div className="card-detail-artwork">
                <CardArtwork cardId={modal.card.card_id} locale={locale} variant="detail" />
              </div>
              <div className="card-detail-info">
                <h2>{getLocalizedCard(modal.card.card_id, locale).name}</h2>
                <p>{modal.card.card_id} — {getLocalizedCard(modal.card.card_id, locale).type}</p>
                {modal.card.category === "Animal" && (
                  <div className="card-detail-level">
                    <span>{t(locale, "level.label")}: {modal.card.base_level || 1} / {t(locale, "level.maximum", { max: 3 })}</span>
                    <span>{t(locale, "evolution.notStarted")}</span>
                  </div>
                )}
                <div className="card-detail-lines" aria-label={t(locale, "label.details")}>
                  {localizedCardDetailLines(getLocalizedCard(modal.card.card_id, locale), locale).map((line) => <p key={line}>{line}</p>)}
                </div>
              </div>
            </div>
          ) : (
            <div className="card-detail-layout">
              <div className="card-detail-artwork">
                <CardArtwork cardId={modal.card.card_id} locale={locale} variant="detail" />
              </div>
              <div className="card-detail-info">
                <h2>{getLocalizedCard(modal.card.card_id, locale).name}</h2>
                <p>{modal.card.card_id} — {getLocalizedCard(modal.card.card_id, locale).type}</p>
                {modal.card.category === "Animal" && (
                  <small className="level-preview-badge">{t(locale, "level.label")} {modal.card.base_level || 1} / 3</small>
                )}
                <div className="card-detail-lines" aria-label={t(locale, "label.details")}>
                  {localizedCardDetailLines(getLocalizedCard(modal.card.card_id, locale), locale).map((line) => <p key={line}>{line}</p>)}
                </div>
              </div>
            </div>
          )
        ) : (
          <>
            <h2>{t(locale, "label.graveyard")} {playerName(modal.playerId, locale)}</h2>
            <ul className="graveyard-list">
              {(match?.players[modal.playerId].graveyard ?? []).map((id) => {
                const card = match ? getCardDefinition(match.cardsByInstanceId[id].definitionId) : null;
                const localizedGrave = card ? getLocalizedCard(card.card_id, locale) : null;
                return (
                  <li key={id}>
                    {card && <CardArtwork cardId={card.card_id} locale={locale} variant="compact" alt="" />}
                    {card?.card_id} {localizedGrave?.name} <small>{localizedGrave?.type}</small>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <button type="button" ref={closeButtonRef} onClick={onClose}>{t(locale, "label.close")}</button>
      </section>
    </div>
  );
}


function needsTarget(card: CardDefinition): boolean {
  return card.category === "Support" || card.category === "Weakness" || ["X001", "X003", "X004"].includes(card.card_id);
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatCardDetailLines(card: CardDefinition, locale: Locale = "th"): string[] {
  const lines: string[] = [];
  if (card.primary_effect) {
    lines.push(...labelledCardLines(card, locale));
  }
  return lines.flatMap(splitCardLine);
}

function labelledCardLines(card: CardDefinition, locale: Locale): string[] {
  const lines: string[] = [];
  if (card.timing) {
    lines.push(`${t(locale, "card.ability")}: ${card.timing}`);
  }
  if (card.target) {
    lines.push(`${t(locale, "card.validUse")}: ${card.target}`);
  }
  if (card.category === "Support" && card.primary_effect) {
    lines.push(`${t(locale, "card.type")}: ${card.primary_effect}`);
  } else if (card.category === "Weakness" && card.primary_effect) {
    const [fullEffect, weakEffect] = splitWeaknessEffects(card.primary_effect);
    const targetLabel = weaknessTargetLabel(card.subtype, locale);
    if (fullEffect) lines.push(`${t(locale, "card.fullEffect")} — ${targetLabel}: ${fullEffect}`);
    if (weakEffect) lines.push(`${t(locale, "card.offTargetEffect")}: ${weakEffect}`);
  } else if (card.primary_effect) {
    lines.push(`${t(locale, "card.ability")}: ${card.primary_effect}`);
  }
  if (card.secondary_effect) {
    lines.push(`${t(locale, "card.weaknessTarget")}: ${card.secondary_effect}`);
  }
  return lines;
}

function splitWeaknessEffects(text: string): [string, string] {
  const parts = text.split(/(?:\r?\n)|(?:; )|(?:\.\s+)/).map((part) => part.trim()).filter(Boolean);
  return [parts[0] ?? "", parts[1] ?? ""];
}

function splitCardLine(text: string): string[] {
  return text.split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
}

function localizedCardDetailLines(cardText: {
  name: string; type: string; description: string; ability: string;
  validUse: string; target: string; effectSummary: string;
  supportCompatibility?: string; levelUp?: string; additionalEffect?: string;
  weaknessTarget?: string; fullEffect?: string; offTargetEffect?: string;
  immediateEffect?: string; duration?: string;
}, locale: Locale): string[] {
  const lines: string[] = [];
  if (cardText.description) {
    lines.push(`${t(locale, "card.description")}: ${cardText.description}`);
  }
  if (cardText.ability) {
    lines.push(`${t(locale, "card.ability")}: ${cardText.ability}`);
  }
  if (cardText.validUse) {
    lines.push(`${t(locale, "card.validUse")}: ${cardText.validUse}`);
  }
  if (cardText.target) {
    lines.push(`${t(locale, "card.target")}: ${cardText.target}`);
  }
  if (cardText.effectSummary) {
    lines.push(`${t(locale, "card.effectSummary")}: ${cardText.effectSummary}`);
  }
  if (cardText.supportCompatibility) {
    lines.push(`${t(locale, "card.supportCompatibility")}: ${cardText.supportCompatibility}`);
  }
  if (cardText.levelUp) {
    lines.push(`${t(locale, "card.levelUp")}: ${cardText.levelUp}`);
  }
  if (cardText.additionalEffect) {
    lines.push(`${t(locale, "card.additionalEffect")}: ${cardText.additionalEffect}`);
  }
  if (cardText.weaknessTarget) {
    lines.push(`${t(locale, "card.weaknessTarget")}: ${cardText.weaknessTarget}`);
  }
  if (cardText.fullEffect) {
    lines.push(`${t(locale, "card.fullEffect")}: ${cardText.fullEffect}`);
  }
  if (cardText.offTargetEffect) {
    lines.push(`${t(locale, "card.offTargetEffect")}: ${cardText.offTargetEffect}`);
  }
  if (cardText.immediateEffect) {
    lines.push(`${t(locale, "card.immediateEffect")}: ${cardText.immediateEffect}`);
  }
  if (cardText.duration) {
    lines.push(`${t(locale, "card.duration")}: ${cardText.duration}`);
  }
  return lines.flatMap(splitCardLine);
}

function weaknessTargetLabel(subtype: string, locale: Locale): string {
  const subtypeToCardId: Record<string, string> = {
    Dog: "A001", Cat: "A002", Rabbit: "A003", Bear: "A004", Bird: "A005", Fish: "A006"
  };
  const labels = subtype
    .split("/")
    .map((part) => part.trim())
    .map((part) => part.replace(/\s+Weakness$/i, ""))
    .map((part) => {
      const cardId = subtypeToCardId[part];
      return cardId ? getLocalizedCard(cardId, locale).name : part;
    })
    .filter(Boolean);
  return labels.join(t(locale, "locale.en") === "English" ? " and " : "และ");
}

type PlayabilityState = "PLAYABLE_NOW" | "PLAYABLE_AFTER_TARGET" | "PARTIAL_EFFECT_ONLY" | "NOT_PLAYABLE";

type PlayabilityInfo = {
  state: PlayabilityState;
  label: string;
  reason?: string;
};

function previewLines(card: CardDefinition, playability: PlayabilityInfo | undefined, locale: Locale): string[] {
  const lines = [t(locale, "preview.type", { category: actionCategoryLabel(card, locale) })];
  if (playability?.state === "NOT_PLAYABLE") {
    lines.push(t(locale, "preview.notPlayable"), localizePlayabilityReason(playability.reason ?? playability.label, locale));
    return lines;
  }
  if (playability?.state === "PLAYABLE_AFTER_TARGET") {
    lines.push(t(locale, "preview.needsTarget"));
  }
  if (playability?.state === "PARTIAL_EFFECT_ONLY") {
    lines.push(t(locale, "preview.partialEffect"));
  }
  if (card.category === "Animal") {
    return [...lines, t(locale, "preview.animal.place"), t(locale, "preview.animal.usesAction")];
  }
  if (card.category === "Support") {
    return [
      ...lines,
      t(locale, "preview.support.target"),
      t(locale, "preview.support.levelUp"),
      t(locale, "preview.support.additionalEffect"),
      t(locale, "preview.usesUtility")
    ];
  }
  if (card.category === "Weakness") {
    return [
      ...lines,
      t(locale, "preview.weakness.target"),
      t(locale, "preview.weakness.fullEffect"),
      t(locale, "preview.weakness.offTarget"),
      t(locale, "preview.weakness.mayBeBlocked")
    ];
  }
  if (card.card_id === "X001") return [...lines, t(locale, "preview.x001.target"), t(locale, "preview.x001.effect"), t(locale, "preview.usesUtility")];
  if (card.card_id === "X002") return [...lines, t(locale, "preview.x002.effect"), t(locale, "preview.x002.reactionOnly")];
  if (card.card_id === "X003") return [...lines, t(locale, "preview.x003.target"), t(locale, "preview.x003.effect"), t(locale, "preview.x003.evolutionLoss")];
  if (card.card_id === "X004") return [...lines, t(locale, "preview.x004.target"), t(locale, "preview.x004.effect"), t(locale, "preview.x004.mayBeBlocked")];
  if (card.card_id === "X005") return [...lines, t(locale, "preview.x005.effect")];
  return [...lines, t(locale, "preview.usesUtility")];
}

function getCardPlayability(match: MatchState, playerId: PlayerId, cardInstanceId: string): PlayabilityInfo {
  const card = match.cardsByInstanceId[cardInstanceId];
  if (!card) {
    return { state: "NOT_PLAYABLE", label: "playability.reason.notFound", reason: "playability.reason.notFound" };
  }
  const definition = getCardDefinition(card.definitionId);
  if (definition.card_id === "S001" && hasLevel3Dog(match, playerId)) {
    return { state: "NOT_PLAYABLE", label: "playability.reason.dogMaxLevel", reason: "playability.reason.dogMaxLevel" };
  }
  const validation = validateAction(match, { type: "PLAY_CARD", playerId, payload: { cardInstanceId } });
  if (validation.valid) {
    return { state: "PLAYABLE_NOW", label: "playability.playableNow" };
  }
  const errs = validation.errors;
  const reasonKey = translateValidationReasonToKey(errs[0]);
  if (needsTarget(definition) && errs.some((error) => error.includes("target is required") || error.includes("target"))) {
    if (definition.category === "Weakness" && hasEnemyBoard(match, playerId)) {
      return anyDirectWeaknessTarget(match, playerId, definition)
        ? { state: "PLAYABLE_AFTER_TARGET", label: "playability.needsTarget" }
        : { state: "PARTIAL_EFFECT_ONLY", label: "playability.partialEffect", reason: "playability.reason.weaknessOffTarget" };
    }
    if (hasPotentialTarget(match, playerId, definition)) {
      return { state: "PLAYABLE_AFTER_TARGET", label: "playability.needsTarget" };
    }
  }
  return { state: "NOT_PLAYABLE", label: reasonKey ?? "playability.reason.fallback", reason: reasonKey ?? "playability.reason.fallback" };
}

function translateValidationReasonToKey(reason: string | undefined): TranslationKey | null {
  if (!reason) return null;
  if (reason.includes("No reversible action")) return "playability.reason.undoNotAvailable";
  if (reason.includes("Only the player who made the action")) return "playability.reason.undoWrongActor";
  if (reason.includes("your current turn")) return "playability.reason.undoWrongTurn";
  if (reason.includes("Cannot undo after match finish")) return "playability.reason.undoMatchFinished";
  if (reason.includes("Cannot undo outside ACTION")) return "playability.reason.undoWrongPhase";
  if (reason.includes("Recycle is not allowed")) return "playability.reason.recycleFirstTurn";
  if (reason.includes("Cannot recycle with an empty deck")) return "playability.reason.recycleEmptyDeck";
  if (reason.includes("Selected Animal slot is occupied")) return "playability.reason.slotOccupied";
  if (reason.includes("Match is already finished")) return "playability.reason.matchFinished";
  if (reason.includes("Action player is not the current player")) return "playability.reason.wrongPlayer";
  if (reason.includes("Food Thief can only be used while behind")) return "playability.reason.behindOnly";
  if (reason.includes("Quick Swap requires a replacement Animal from hand")) return "playability.reason.quickSwapRequires";
  if (reason.includes("Quick Swap replacement must be an Animal")) return "playability.reason.quickSwapNotAnimal";
  if (reason.includes("ACTION phase")) return "playability.reason.notActionPhase";
  if (reason.includes("current player's hand")) return "playability.reason.notInHand";
  if (reason.includes("Animal action already")) return "playability.reason.animalActionUsed";
  if (reason.includes("Animal zone is full")) return "playability.reason.animalZoneFull";
  if (reason.includes("Utility action is locked")) return "playability.reason.utilityLocked";
  if (reason.includes("Utility action already")) return "playability.reason.utilityUsed";
  if (reason.includes("board Animal target")) return "playability.reason.needsAnimalTarget";
  if (reason.includes("own Animal")) return "playability.reason.needsOwnAnimal";
  if (reason.includes("enemy Animal")) return "playability.reason.noEnemyTarget";
  if (reason.includes("protected from Weakness")) return "playability.reason.targetProtected";
  if (reason.includes("เพิ่มเลเวลได้")) return "playability.reason.animalMaxLevel";
  if (reason.includes("Level 1")) return "playability.reason.needsLevel1";
  return null;
}

function localizePlayabilityLabel(playability: PlayabilityInfo, locale: Locale): string {
  const key = asTranslationKey(playability.label);
  if (key) return t(locale, key);
  const reasonKey = asTranslationKey(playability.reason);
  if (reasonKey) return t(locale, reasonKey);
  return playability.label;
}

function localizeValidationReason(error: string | undefined, locale: Locale): string {
  const key = translateValidationReasonToKey(error);
  if (key) return t(locale, key);
  return t(locale, "playability.reason.fallback");
}

function localizePlayabilityReason(reason: string, locale: Locale): string {
  const key = asTranslationKey(reason);
  if (key) return t(locale, key);
  return reason;
}

function asTranslationKey(value: string | undefined): TranslationKey | null {
  if (!value) return null;
  if (value.startsWith("playability.")) return value as TranslationKey;
  return null;
}

function localizedAnimalStatuses(animal: AnimalInstance, locale: Locale): string {
  return animal.statuses.map((s) => localizedStatusLabel(s.code, locale)).join(", ");
}

function hasPotentialTarget(match: MatchState, playerId: PlayerId, card: CardDefinition): boolean {
  return (["P1", "P2"] as PlayerId[]).some((ownerId) => match.players[ownerId].board.some((instanceId) => {
    if (!instanceId) return false;
    const animal = match.cardsByInstanceId[instanceId];
    return isAnimalInstance(animal) && canTarget(card, ownerId, playerId, animal.level);
  }));
}

function hasEnemyBoard(match: MatchState, playerId: PlayerId): boolean {
  const enemyId = otherPlayerId(playerId);
  return match.players[enemyId].board.some(Boolean);
}

function hasLevel3Dog(match: MatchState, playerId: PlayerId): boolean {
  return match.players[playerId].board.some((instanceId) => {
    if (!instanceId) return false;
    const animal = match.cardsByInstanceId[instanceId];
    return isAnimalInstance(animal) && animal.definitionId === "A001" && animal.level >= 3;
  });
}

function anyDirectWeaknessTarget(match: MatchState, playerId: PlayerId, card: CardDefinition): boolean {
  const enemyId = otherPlayerId(playerId);
  return match.players[enemyId].board.some((instanceId) => {
    if (!instanceId) return false;
    const animal = match.cardsByInstanceId[instanceId];
    return isAnimalInstance(animal) && weaknessMatches(card.card_id, getCardDefinition(animal.definitionId).subtype);
  });
}

function weaknessMatches(cardId: string, subtype: string): boolean {
  return (
    (cardId === "W001" && subtype === "Dog")
    || (cardId === "W002" && subtype === "Cat")
    || (cardId === "W003" && (subtype === "Rabbit" || subtype === "Bear"))
    || (cardId === "W004" && subtype === "Bird")
    || (cardId === "W005" && subtype === "Fish")
  );
}

function actionCategoryLabel(card: CardDefinition, locale: Locale): string {
  if (card.category === "Weakness") return t(locale, "preview.category.weakness");
  if (card.category === "Support") return t(locale, "preview.category.support");
  if (card.category === "Animal") return t(locale, "preview.category.animal");
  if (card.card_id === "X005") return t(locale, "preview.category.stealScore");
  if (card.card_id === "X004") return t(locale, "preview.category.returnToHand");
  if (card.card_id === "X002") return t(locale, "preview.category.protect");
  return t(locale, "preview.category.statusChange");
}

function canTarget(card: CardDefinition, ownerId: PlayerId, viewerId: PlayerId, level: number): boolean {
  if (card.category === "Support") {
    if (supportIncreasesLevel(card.logic_key)) {
      return ownerId === viewerId && level < 3;
    }
    return ownerId === viewerId;
  }
  if (card.category === "Weakness" || card.card_id === "X001") {
    return ownerId !== viewerId;
  }
  if (card.card_id === "X003") {
    return ownerId === viewerId;
  }
  if (card.card_id === "X004") {
    return ownerId !== viewerId && level === 1;
  }
  return false;
}

function supportIncreasesLevel(logicKey: string): boolean {
  return [
    "match_level_up_and_bounce_removal_shield",
    "match_level_up_peek_or_bottom",
    "match_level_up_temp_level_down_immunity",
    "match_level_up_minimum_next_score_1",
    "match_level_up_draw1_bottom1",
    "match_level_up_temp_weakness_immunity"
  ].includes(logicKey);
}

// eslint-disable-next-line react-refresh/only-export-components
export function isLevelIncreasingSupportCard(logicKey: string): boolean {
  return supportIncreasesLevel(logicKey);
}

function findHandCard(match: MatchState, playerId: PlayerId, definitionId: string): string | undefined {
  return match.players[playerId].hand.find((id) => match.cardsByInstanceId[id].definitionId === definitionId);
}

function findOwnAttachedSupport(match: MatchState, playerId: PlayerId): string | undefined {
  for (const animalId of match.players[playerId].board) {
    if (!animalId) {
      continue;
    }
    const animal = match.cardsByInstanceId[animalId];
    if (isAnimalInstance(animal) && animal.attachedSupportIds.length > 0) {
      return animal.attachedSupportIds[0];
    }
  }
  return undefined;
}

function playerName(playerId: PlayerId, locale: Locale = "th") {
  return playerId === "P1" ? t(locale, "label.player1") : t(locale, "label.player2");
}

function playerNameForMode(playerId: PlayerId, gameMode: GameMode, locale: Locale) {
  if (gameMode === "PVE_NORMAL") {
    return playerId === "P1" ? t(locale, "label.you") : t(locale, "label.computer");
  }
  return playerName(playerId, locale);
}

function findLatestScoreEntry(actionLog: ActionLogEntry[], startIndex = 0): ActionLogEntry | undefined {
  for (let i = actionLog.length - 1; i >= startIndex; i -= 1) {
    const entry = actionLog[i];
    if (entry.phase === "SCORE" && entry.outcomes?.some((outcome) => outcome.code === "SCORE_CHANGED")) {
      return entry;
    }
  }
  return undefined;
}

function ScoreBreakdownBanner(props: {
  breakdown: TurnScoreBreakdown;
  gameMode: GameMode;
  locale: Locale;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { breakdown, locale } = props;
  const player = playerNameForMode(breakdown.playerId, props.gameMode, locale);
  const signedDelta = `${breakdown.totalDelta > 0 ? "+" : ""}${breakdown.totalDelta}`;
  const detailsId = `score-breakdown-${breakdown.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const resultTone = breakdown.totalDelta > 0 ? "positive" : breakdown.totalDelta < 0 ? "negative" : "zero";

  return (
    <section className="score-breakdown-banner" role="status" aria-live="polite" aria-label={t(locale, "score.bannerTitle")} data-score-result={resultTone}>
      <div className="score-breakdown-summary">
        <strong>{t(locale, "score.scoreChange", { player, delta: signedDelta })}</strong>
        <span>{breakdown.scoreBefore} → {breakdown.scoreAfter}</span>
      </div>
      <button type="button" className="secondary-button" aria-expanded={props.expanded} aria-controls={detailsId} onClick={props.onToggle}>
        {props.expanded ? t(locale, "score.closeDetails") : t(locale, "score.details")}
      </button>
      {props.expanded && (
        <div id={detailsId} className="score-breakdown-details">
          <p>{t(locale, "score.turn", { turn: breakdown.turnNumber })}</p>
          <p>{t(locale, "score.finalContribution", { value: signedDelta })}</p>
          {breakdown.animalContributions.map((contribution) => (
            <div className="score-animal-breakdown" key={contribution.animalInstanceId}>
              <strong>{getLocalizedCard(contribution.animalCardId, locale).name}: {signedValue(contribution.finalContribution)}</strong>
              <ul>
                {contribution.components.map((component, index) => (
                  <li key={`${component.kind}-${index}`}>{componentLabel(component, locale)}</li>
                ))}
              </ul>
            </div>
          ))}
          {breakdown.teamAdjustments.length > 0 && (
            <div className="score-animal-breakdown">
              <strong>{t(locale, "score.teamAdjustments")}</strong>
              <ul>
                {breakdown.teamAdjustments.map((adjustment) => (
                  <li key={adjustment.id}>{teamAdjustmentLabel(adjustment, locale)}</li>
                ))}
              </ul>
            </div>
          )}
          {!breakdown.isFullyAttributed && (
            <>
              <p>{t(locale, "score.unattributedAmount", { delta: signedValue(breakdown.unattributedDelta) })}</p>
              <p>{t(locale, "score.detailsIncomplete")}</p>
              {breakdown.animalContributions.length === 0 && <p>{t(locale, "score.noAnimalContributions")}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function signedValue(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function componentLabel(component: ScoreComponent, locale: Locale): string {
  const labelKeys: Record<ScoreComponent["kind"], TranslationKey> = {
    base: "score.base",
    "level-bonus": "score.levelBonus",
    "support-bonus": "score.supportBonus",
    "special-bonus": "score.specialBonus",
    "status-bonus": "score.statusBonus",
    penalty: "score.penalty",
    reduction: "score.reduction",
    blocked: "score.blocked",
    skipped: "score.skipped"
  };
  const label = t(locale, labelKeys[component.kind]);
  const source = component.sourceCardId ? ` · ${t(locale, "score.sourceCard", { card: getLocalizedCard(component.sourceCardId, locale).name })}` : "";
  return `${label}: ${signedValue(component.amount)}${source}`;
}

function teamAdjustmentLabel(adjustment: TeamScoreAdjustment, locale: Locale): string {
  const labelKeys: Record<TeamScoreAdjustment["reasonCode"], TranslationKey> = {
    "score-cap": "score.scoreCapAdjustment",
    "score-floor": "score.scoreFloorAdjustment",
    "global-bonus": "score.globalBonus",
    "global-penalty": "score.globalPenalty"
  };
  return `${t(locale, labelKeys[adjustment.reasonCode])}: ${signedValue(adjustment.amount)}`;
}

function scoreDeltaByPlayer(entry: MatchState["actionLog"][number] | undefined): Record<PlayerId, number> {
  const deltas: Record<PlayerId, number> = { P1: 0, P2: 0 };
  for (const outcome of entry?.outcomes ?? []) {
    if (outcome.code === "SCORE_CHANGED") {
      deltas[outcome.playerId] += outcome.amount;
    }
  }
  return deltas;
}

function categoryClass(category: CardCategory) {
  return `cat-${category.toLowerCase()}`;
}

function phaseLabel(phase: MatchState["phase"], locale: Locale) {
  const keys: Record<MatchState["phase"], "phase.READY" | "phase.DRAW" | "phase.SCORE" | "phase.ACTION" | "phase.END"> = {
    READY: "phase.READY",
    DRAW: "phase.DRAW",
    SCORE: "phase.SCORE",
    ACTION: "phase.ACTION",
    END: "phase.END"
  };
  return t(locale, keys[phase]);
}



function visualLabelKey(kind: CombatVisualKind): TranslationKey {
  const map: Record<CombatVisualKind, TranslationKey> = {
    "weakness-full": "visual.weaknessFull",
    "weakness-reduced": "visual.weaknessReduced",
    "support-applied": "visual.supportApplied",
    "buff-applied": "visual.buffApplied",
    "debuff-applied": "visual.debuffApplied",
    "shield-blocked": "visual.shieldBlocked",
    "shield-consumed": "visual.shieldConsumed",
    "level-up": "visual.levelUp",
    "level-down": "visual.levelDown",
    "evolution-complete": "visual.evolutionComplete",
    "status-applied": "visual.statusApplied",
    "status-removed": "visual.statusRemoved",
    "draw": "visual.draw",
    "discard": "visual.discard",
    "recycle": "visual.recycle"
  };
  return map[kind];
}

function visualLabelParams(event: CombatVisualEvent): Record<string, string | number> | undefined {
  if (event.kind === "level-up" || event.kind === "level-down") {
    return { value: event.value ?? 1 };
  }
  if (event.kind === "evolution-complete") {
    return undefined;
  }
  if (event.kind === "draw") {
    return { count: event.value ?? 1 };
  }
  return undefined;
}

function formatDuration(ms: number): string {
  if (ms < 0 || isNaN(ms)) return "00:00:00";
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function downloadJson(value: string, filename: string): void {
  const blob = new Blob([value], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function HistoryScreen({
  onBack,
  onShowExport,
  onMessage,
  locale
}: {
  onBack: () => void;
  onShowExport: (json: string) => void;
  onMessage: (message: string) => void;
  locale: Locale;
}) {
  const [history, setHistory] = useState<MatchResult[]>([]);

  useEffect(() => {
    const res = listMatchHistory();
    if (res.ok) {
      setHistory(res.value);
    }
  }, []);

  function handleClear() {
    if (window.confirm(t(locale, "confirm.clearHistory"))) {
      const res = clearMatchHistory();
      if (res.ok) {
        setHistory([]);
        alert(t(locale, "feedback.historyCleared"));
      } else {
        alert(t(locale, "feedback.historyClearFailed", { reason: storageErrorMessage(res.error) }));
      }
    }
  }

  function handleExportAll() {
    const timestamp = Date.now();
    const result = exportAllMatchHistory(timestamp);
    if (!result.ok) {
      alert(t(locale, "feedback.historyExportFailed", { reason: storageErrorMessage(result.error) }));
      return;
    }
    downloadJson(result.value, matchHistoryFilename(timestamp));
    onShowExport(result.value);
    onMessage(t(locale, "feedback.historyExported"));
  }

  function handleExportOne(localeResult: MatchResult) {
    const exportResult = exportSingleMatchHistoryRecord(localeResult);
    if (!exportResult.ok) {
      alert(t(locale, "feedback.matchExportFailed", { reason: storageErrorMessage(exportResult.error) }));
      return;
    }
    downloadJson(exportResult.value, singleMatchHistoryFilename(localeResult.matchId));
    onShowExport(exportResult.value);
    onMessage(t(locale, "feedback.matchExported", { matchId: localeResult.matchId }));
  }

  return (
    <main className="page-shell scroll-page">
      <header className="page-header split-header">
        <h1>{t(locale, "history.title")}</h1>
        <div className="inline-actions">
          {history.length > 0 && (
            <>
              <button type="button" className="secondary-button" onClick={handleExportAll}>{t(locale, "history.exportAll")}</button>
              <button type="button" className="danger-button" onClick={handleClear}>{t(locale, "history.clearAll")}</button>
            </>
          )}
          <button type="button" className="secondary-button" onClick={onBack}>{t(locale, "history.back")}</button>
        </div>
      </header>

      {history.length === 0 ? (
        <p className="empty-state">{t(locale, "history.empty")}</p>
      ) : (
        <div className="history-list">
          {history.map((result) => {
            const playedAtDate = new Date(result.endedAt).toLocaleString(locale === "en" ? "en-US" : "th-TH");
            return (
              <section key={result.matchId} className="start-panel history-card">
                <div className="history-meta">
                  <small>ID: {result.matchId}</small>
                  <small>{t(locale, "history.playedAt")}: {playedAtDate}</small>
                </div>
                <h3>
                  {t(locale, "history.result")}: {result.winner === "DRAW" ? t(locale, "history.draw") : t(locale, "history.winner", { player: playerName(result.winner, locale) })}
                </h3>
                <dl className="summary-grid compact-summary-grid">
                  <div><dt>{t(locale, "history.player1Score")}</dt><dd>{result.finalScores.P1}</dd></div>
                  <div><dt>{t(locale, "history.player2Score")}</dt><dd>{result.finalScores.P2}</dd></div>
                  <div><dt>{t(locale, "history.turnCount")}</dt><dd>{result.turnCount}</dd></div>
                  <div><dt>{t(locale, "history.duration")}</dt><dd>{formatDuration(result.duration)}</dd></div>
                  <div><dt>{t(locale, "history.recycleCount")}</dt><dd>{result.recycleCount}</dd></div>
                  <div><dt>{t(locale, "history.finishReason")}</dt><dd>{result.finishReason === "TARGET_SCORE" ? t(locale, "history.finishReason.targetScore") : t(locale, "history.finishReason.maxTurns")}</dd></div>
                </dl>
                <div className="history-exits">
                  <div><strong>{t(locale, "history.sentToGraveyard")}:</strong> {result.boardExitCount.sentToGraveyard}</div>
                  <div><strong>{t(locale, "history.returnedToHand")}:</strong> {result.boardExitCount.returnedToHand}</div>
                  <div><strong>{t(locale, "history.voluntarySwap")}:</strong> {result.boardExitCount.voluntarySwap}</div>
                </div>
                {result.highestScoringCard && (
                  <div className="history-highlight">
                    <strong>{t(locale, "history.highestScoringCard")}:</strong> {getLocalizedCard(result.highestScoringCard.cardId, locale).name} ({result.highestScoringCard.cardId}) — {result.highestScoringCard.score} ({playerName(result.highestScoringCard.ownerId)})
                  </div>
                )}
                <div className="history-actions">
                  <button type="button" className="secondary-button" onClick={() => handleExportOne(result)}>{t(locale, "history.exportMatch")}</button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function toPersistableScreen(screen: Screen): PersistableScreen {
  return screen === "history" ? "menu" : screen;
}

function ImportModal({
  onClose,
  onImport,
  error,
  locale
}: {
  onClose: () => void;
  onImport: (jsonText: string) => void;
  error: string | null;
  locale: Locale;
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="modal-backdrop modal-top" role="dialog" aria-modal="true" aria-label={t(locale, "import.title")}>
      <section className="modal-panel import-export-panel">
        <h2>{t(locale, "import.title")}</h2>
        <p className="muted-copy">{t(locale, "import.description")}</p>
        <textarea
          ref={textareaRef}
          className="json-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"schemaVersion": "1", ...}'
          aria-label={t(locale, "import.aria")}
        />
        {error && (
          <p className="error-copy">{error}</p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{t(locale, "label.close")}</button>
          <button type="button" onClick={() => onImport(text)} disabled={!text.trim()}>{t(locale, "import.button")}</button>
        </div>
      </section>
    </div>
  );
}

function PlaytestFeedbackModal({
  onClose,
  onExport,
  error,
  locale
}: {
  onClose: () => void;
  onExport: (input: PlaytestFeedbackInput) => void;
  error: string | null;
  locale: Locale;
}) {
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [testerCode, setTesterCode] = useState("");
  const [playerSeat, setPlayerSeat] = useState<PlayerSeat>("BOTH");
  const [ratings, setRatings] = useState<Record<FeedbackRatingKey, string>>({
    rulesClarity: "",
    gameFun: "",
    gameLength: "",
    balance: "",
    uiClarity: ""
  });
  const [texts, setTexts] = useState<Record<FeedbackTextKey, string>>({
    confusingMoments: "",
    strongestCard: "",
    weakestCard: "",
    bugDescription: "",
    additionalComments: ""
  });

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  function updateRating(key: FeedbackRatingKey, value: string) {
    setRatings((current) => ({ ...current, [key]: value }));
  }

  function updateText(key: FeedbackTextKey, value: string) {
    setTexts((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    const input: PlaytestFeedbackInput = {
      playerSeat,
      rulesClarity: Number(ratings.rulesClarity),
      gameFun: Number(ratings.gameFun),
      gameLength: Number(ratings.gameLength),
      balance: Number(ratings.balance),
      uiClarity: Number(ratings.uiClarity)
    };
    if (testerCode.trim()) {
      input.testerCode = testerCode;
    }
    for (const key of Object.keys(texts) as FeedbackTextKey[]) {
      if (texts[key].trim()) {
        input[key] = texts[key];
      }
    }
    onExport(input);
  }

  return (
    <div className="modal-backdrop modal-top" role="dialog" aria-modal="true" aria-label={t(locale, "playtest.aria")}>
      <section className="modal-panel import-export-panel playtest-panel">
        <h2>{t(locale, "playtest.title")}</h2>
        <p className="muted-copy">{t(locale, "playtest.description")}</p>
        <div className="feedback-grid">
          <label className="feedback-field" htmlFor="testerCode">
            <span>{t(locale, "playtest.testerCode")}</span>
            <input
              ref={firstInputRef}
              id="testerCode"
              type="text"
              value={testerCode}
              onChange={(event) => setTesterCode(event.target.value)}
            />
          </label>
          <label className="feedback-field" htmlFor="playerSeat">
            <span>{t(locale, "playtest.seatLabel")}</span>
            <select id="playerSeat" value={playerSeat} onChange={(event) => setPlayerSeat(event.target.value as PlayerSeat)}>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="BOTH">BOTH</option>
              <option value="OBSERVER">OBSERVER</option>
            </select>
          </label>
        </div>
        <div className="feedback-grid">
          <RatingInput id="rulesClarity" label={t(locale, "playtest.rulesClarity")} value={ratings.rulesClarity} onChange={(value) => updateRating("rulesClarity", value)} locale={locale} />
          <RatingInput id="gameFun" label={t(locale, "playtest.gameFun")} value={ratings.gameFun} onChange={(value) => updateRating("gameFun", value)} locale={locale} />
          <RatingInput id="gameLength" label={t(locale, "playtest.gameLength")} value={ratings.gameLength} onChange={(value) => updateRating("gameLength", value)} locale={locale} />
          <RatingInput id="balance" label={t(locale, "playtest.balance")} value={ratings.balance} onChange={(value) => updateRating("balance", value)} locale={locale} />
          <RatingInput id="uiClarity" label={t(locale, "playtest.uiClarity")} value={ratings.uiClarity} onChange={(value) => updateRating("uiClarity", value)} locale={locale} />
        </div>
        <TextFeedback id="confusingMoments" label={t(locale, "playtest.confusingMoments")} value={texts.confusingMoments} onChange={(value) => updateText("confusingMoments", value)} />
        <TextFeedback id="strongestCard" label={t(locale, "playtest.strongestCard")} value={texts.strongestCard} onChange={(value) => updateText("strongestCard", value)} />
        <TextFeedback id="weakestCard" label={t(locale, "playtest.weakestCard")} value={texts.weakestCard} onChange={(value) => updateText("weakestCard", value)} />
        <TextFeedback id="bugDescription" label={t(locale, "playtest.bugDescription")} value={texts.bugDescription} onChange={(value) => updateText("bugDescription", value)} />
        <TextFeedback id="additionalComments" label={t(locale, "playtest.additionalComments")} value={texts.additionalComments} onChange={(value) => updateText("additionalComments", value)} />
        {error && <p className="error-copy">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>{t(locale, "label.close")}</button>
          <button type="button" onClick={submit}>{t(locale, "playtest.export")}</button>
        </div>
      </section>
    </div>
  );
}

function RatingInput({
  id,
  label,
  value,
  onChange,
  inputRef,
  locale
}: {
  id: FeedbackRatingKey;
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  locale: Locale;
}) {
  return (
    <label className="feedback-field" htmlFor={id}>
      <span>{label}{t(locale, "playtest.ratingSuffix")}</span>
      <input
        ref={inputRef}
        id={id}
        type="number"
        min={1}
        max={5}
        step={1}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextFeedback({
  id,
  label,
  value,
  onChange
}: {
  id: FeedbackTextKey;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="feedback-field" htmlFor={id}>
      <span>{label}</span>
      <textarea
        id={id}
        className="feedback-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ExportModal({
  value,
  onClose,
  title,
  description,
  textareaLabel,
  locale
}: {
  value: string;
  onClose: () => void;
  title?: string;
  description?: string;
  textareaLabel?: string;
  locale: Locale;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedTitle = title ?? t(locale, "export.title");
  const resolvedDescription = description ?? t(locale, "export.description");
  const resolvedTextareaLabel = textareaLabel ?? t(locale, "export.aria");

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  return (
    <div className="modal-backdrop modal-top" role="dialog" aria-modal="true" aria-label={resolvedTitle}>
      <section className="modal-panel import-export-panel">
        <h2>{resolvedTitle}</h2>
        <p className="muted-copy">{resolvedDescription}</p>
        <textarea
          ref={textareaRef}
          className="json-textarea"
          value={value}
          readOnly
          aria-label={resolvedTextareaLabel}
        />
        <div className="modal-actions">
          <button type="button" onClick={onClose}>{t(locale, "label.close")}</button>
        </div>
      </section>
    </div>
  );
}
