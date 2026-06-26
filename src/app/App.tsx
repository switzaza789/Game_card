import { useMemo, useState, useEffect, useRef, type RefObject } from "react";
import { runPveNormalAiTurn } from "../ai/aiTurnController";
import { preparePveHumanTurnToAction } from "./pveHumanTurnController";
import { cardCatalog } from "../data/cardsSeed";
import { gameConfig } from "../data/gameConfig";
import { getCardDefinition, isAnimalInstance } from "../engine/cards/deck";
import { createMatch } from "../engine/state/match";
import { otherPlayerId } from "../engine/state/selectors";
import type { Action, AnimalInstance, CardCategory, CardDefinition, GameMode, MatchState, PlayerId, StatusEffectCode, Target } from "../types/game";
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
import { formatActionLogEntry, renderActionFeedback, statusLabel, statusDisplayMeta, type ActionFeedback } from "../ui/effectFeedback";
import { getLocalizedCard, getStoredLocale, localeOptions, setStoredLocale, t, type Locale, type TranslationKey } from "../i18n";
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
  const [message, setMessage] = useState("เลือกการ์ดจากมือ แล้วเลือกเป้าหมายบนสนาม");
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
            setMessage("กู้คืนผลการแข่งขันและลบเซฟเรียบร้อย");
          } else {
            setMessage(`เกิดข้อผิดพลาดในการบันทึกประวัติ: ${storageErrorMessage(recoveryResult.error)}`);
          }
        } else {
          setHasSavedGame(true);
        }
      }
    } else {
      setMessage(`ข้อมูลเซฟมีปัญหา: ${storageErrorMessage(loadResult.error)}`);
    }
  }, [coordinator]);

  function startGame(gameMode: GameMode = "LOCAL_PVP") {
    if (hasSavedGame && !window.confirm("คุณมีเกมที่เล่นค้างอยู่ ต้องการเริ่มเกมใหม่และลบเซฟเดิมหรือไม่?")) {
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
    setMessage(gameMode === "PVE_NORMAL" ? "เริ่ม PvE แล้ว คุณคือผู้เล่น 1" : "เริ่มเกมแล้ว ผู้เล่น 1 พร้อมเล่น");
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
      setMessage(`กู้คืนเกมสำเร็จ! ถึงตา ${playerName(persisted.state.currentPlayerId)}`);
    } else {
      setMessage(`ไม่สามารถโหลดเซฟได้: ${loadResult.ok ? "ไม่พบไฟล์เซฟ" : storageErrorMessage(loadResult.error)}`);
    }
  }

  function clearSave() {
    if (window.confirm("คุณแน่ใจหรือไม่ว่าต้องการลบเกมเซฟนี้?")) {
      const delResult = deleteActiveMatch();
      if (delResult.ok) {
        setHasSavedGame(false);
        setMessage("ลบเกมเซฟเรียบร้อย");
      } else {
        setMessage(`ลบเกมเซฟไม่สำเร็จ: ${storageErrorMessage(delResult.error)}`);
      }
    }
  }

  function handleImport(jsonText: string) {
    if (match && match.status !== "FINISHED" && !window.confirm("คุณกำลังเล่นเกมอยู่ ต้องการนำเข้าไฟล์เซฟทับเกมปัจจุบันหรือไม่?")) {
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
      setMessage("นำเข้าและโหลดไฟล์เซฟสำเร็จ!");
      saveActiveMatch(persisted.state, persisted.screen, persisted.stats, Date.now());
      setShowImport(false);
      setImportError(null);
    } else {
      setImportError(`ไม่สามารถนำเข้าข้อมูลได้: ${storageErrorMessage(impResult.error)}`);
    }
  }

  function handleExport() {
    if (!match) return;
    const expResult = exportMatchLog(match, toPersistableScreen(screen), coordinator.getStats());
    if (expResult.ok) {
      if (!navigator.clipboard?.writeText || !window.isSecureContext) {
        setExportText(expResult.value);
        setMessage("ไม่สามารถคัดลอกอัตโนมัติได้ เปิดหน้าต่างส่งออก JSON แล้ว");
        return;
      }

      void navigator.clipboard.writeText(expResult.value)
        .then(() => {
          alert("คัดลอกไฟล์เซฟลง Clipboard เรียบร้อยแล้ว!");
        })
        .catch(() => {
          setExportText(expResult.value);
          setMessage("ไม่สามารถคัดลอกอัตโนมัติได้ เปิดหน้าต่างส่งออก JSON แล้ว");
        });
    } else {
      alert(`ส่งออกข้อมูลล้มเหลว: ${storageErrorMessage(expResult.error)}`);
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
      setPlaytestError("ฟีดแบ็กชุดนี้เพิ่งถูกบันทึกแล้ว");
      return;
    }

    const saveResult = saveHumanFeedback(feedbackResult.value);
    if (!saveResult.ok) {
      setPlaytestError(`บันทึกฟีดแบ็กล้มเหลว: ${storageErrorMessage(saveResult.error)}`);
      return;
    }

    const json = JSON.stringify(feedbackResult.value, null, 2);
    lastFeedbackExportRef.current = duplicateKey;
    setPlaytestError(null);
    setPlaytestFeedbackOpen(false);
    downloadJson(json, humanFeedbackFilename(match.matchId, timestamp));
    setMessage("บันทึกและส่งออกฟีดแบ็ก JSON แล้ว");
    if (!navigator.clipboard?.writeText || !window.isSecureContext) {
      setExportText(json);
      return;
    }

    void navigator.clipboard.writeText(json)
      .then(() => {
        alert("บันทึกและคัดลอกฟีดแบ็ก Playtest ลง Clipboard เรียบร้อยแล้ว!");
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
    setMessage(deleteResult.ok ? "รีเซ็ตเกมเรียบร้อย" : `รีเซ็ตเกมแล้ว แต่ลบเซฟไม่สำเร็จ: ${storageErrorMessage(deleteResult.error)}`);
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
      setMessage(`กลับเมนูหลักแล้ว แต่ลบเซฟไม่สำเร็จ: ${storageErrorMessage(deleteResult.error)}`);
    }
  }

  function continueFromHandoff() {
    if (!match) {
      return;
    }

    let currentMatch = match;
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
    setMessage(`ถึงตา ${playerName(currentMatch.currentPlayerId)}`);
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
      setMessage("จบเทิร์นแล้ว");
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
      setMessage((prev) => `${prev} (บันทึกเซฟล้มเหลว: ${storageErrorMessage(sr1.error)})`);
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
          setMessage("เกมจบแล้ว");
        } else if (currentMatch.currentPlayerId === "P1") {
          setMessage("คอมพิวเตอร์จบเทิร์นแล้ว ถึงตาคุณ");
        } else if (result.actionLimitFallback) {
          setMessage("คอมพิวเตอร์ถึงขีดจำกัด action และหยุดอย่างปลอดภัย");
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
          setMessage("เกมจบแล้ว");
        } else if (currentMatch.phase === "ACTION") {
          setMessage("ถึงตาคุณ — เล่นการ์ดได้");
        } else if (result.stoppedByRejection) {
          setMessage("เริ่มเทิร์นไม่สำเร็จ กรุณาตรวจสอบ Action Log");
        } else {
          setMessage("กำลังจั่วและคิดคะแนน...");
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
      setActionFeedback({ type: "recycle", success: false, reason });
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
      setMessage((prev) => `${prev} (บันทึกเซฟล้มเหลว: ${storageErrorMessage(sr2.error)})`);
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

      if (shieldId && window.confirm(`${playerName(targetCard.ownerId)} ใช้ Weakness Shield หรือไม่?`)) {
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
      setActionFeedback({ type: "playFailed", cardInstanceId, reason });
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
      setMessage((prev) => `${prev} (บันทึกเซฟล้มเหลว: ${storageErrorMessage(sr3.error)})`);
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
    setActionFeedback({ type: "undo", success, reason: success ? undefined : text, lastLogResult: result.state.actionLog[result.state.actionLog.length - 1]?.result ?? "" });
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
        <HistoryScreen onBack={() => setScreen("menu")} onShowExport={(json) => setExportText(json)} onMessage={setMessage} />
        {exportText && (
          <ExportModal
            value={exportText}
            title="ส่งออกข้อมูล JSON"
            description="คัดลอก JSON นี้เพื่อเก็บประวัติการเล่นภายในเครื่อง"
            textareaLabel="ข้อมูล JSON สำหรับส่งออก"
            onClose={() => setExportText(null)}
          />
        )}
      </>
    );
  }

  if (screen === "handoff" && match && !(match.gameMode === "PVE_NORMAL" && match.currentPlayerId === "P2")) {
    return <HandoffScreen nextPlayerId={match.currentPlayerId} onContinue={continueFromHandoff} />;
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
          />
        )}
        {exportText && (
          <ExportModal
            value={exportText}
            title="ส่งออกข้อมูล JSON"
            description="คัดลอก JSON นี้เพื่อเก็บ log หรือฟีดแบ็ก Playtest ภายในเครื่อง"
            textareaLabel="ข้อมูล JSON สำหรับส่งออก"
            onClose={() => setExportText(null)}
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
            setMessage("เลือก Animal จากมือเพื่อลงช่องนี้");
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
        />
      )}
      {exportText && (
        <ExportModal
          value={exportText}
          title="ส่งออกข้อมูล JSON"
          description="คัดลอก JSON นี้เพื่อเก็บ log หรือฟีดแบ็ก Playtest ภายในเครื่อง"
          textareaLabel="ข้อมูล JSON สำหรับส่งออก"
          onClose={() => setExportText(null)}
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
        <dl className="summary-grid" aria-label="ข้อมูลเกมที่โหลดแล้ว">
          <div><dt>เวอร์ชัน</dt><dd>{gameConfig.version}</dd></div>
          <div><dt>จำนวนการ์ด</dt><dd>{cardCatalog.cards.length} ใบ</dd></div>
          <div><dt>ผู้เล่น</dt><dd>{gameConfig.players} คน</dd></div>
          <div><dt>คะแนนชนะ</dt><dd>{gameConfig.target_score} คะแนน</dd></div>
        </dl>
        <div className="menu-actions">
          {hasSavedGame && (
            <>
              <button type="button" onClick={onContinue} aria-label="เล่นต่อจากเซฟเดิม">{t(locale, "menu.continue")}</button>
              <button type="button" className="danger-button" onClick={onClearSave} aria-label="ลบไฟล์เซฟ">ลบเซฟ</button>
            </>
          )}
          <button type="button" onClick={() => onStart("LOCAL_PVP")} aria-label="เริ่มเกมใหม่">
            {hasSavedGame ? `${t(locale, "menu.localPvp")} ใหม่` : t(locale, "menu.localPvp")}
          </button>
          <button type="button" onClick={() => onStart("PVE_NORMAL")} aria-label="เริ่ม PvE กับคอมพิวเตอร์">
            {t(locale, "menu.pveNormal")} <small>Normal AI</small>
          </button>
          <button type="button" className="secondary-button" onClick={onViewHistory}>ประวัติการเล่น</button>
          <button type="button" className="secondary-button" onClick={onOpenImport}>นำเข้าไฟล์เซฟ</button>
          <button type="button" className="secondary-button" onClick={onHowToPlay}>วิธีเล่น</button>
          <button type="button" className="secondary-button" onClick={onLibrary}>คลังการ์ด</button>
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
        <h1>{locale === "en" ? "How to Play" : "วิธีเล่น"}</h1>
        <button type="button" className="secondary-button" onClick={onBack}>{locale === "en" ? "Back" : "กลับเมนู"}</button>
      </header>
      <section className="rule-list" aria-label="กติกาหลัก">
        <p>ผู้เล่น 2 คนสลับกันเล่นบนอุปกรณ์เดียวกัน ฝ่ายละ Deck 24 ใบ มือเริ่มต้น 5 ใบ และมี Animal Zone 3 ช่อง</p>
        <p>ใน Action Phase ลง Animal ได้ 1 ใบ และใช้ Utility ได้ 1 ครั้ง โดย Support, Weakness, Special และ Recycle ใช้สิทธิ์ Utility ร่วมกัน</p>
        <p>Animal ที่อยู่บนสนามจะทำคะแนนตาม Level ใน Score Phase ถัดไป ผู้เล่นที่ถึง 15 คะแนนก่อนจะชนะ</p>
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
  resetConfirmOpen: boolean;
  onCancelReset: () => void;
  onConfirmReset: () => void;
}) {
  const { match, activePlayerId, opponentId, selectedCardId, selectedDefinition } = props;
  const controlsDisabled = Boolean(props.controlsDisabled);
  const isAiTurn = match.gameMode === "PVE_NORMAL" && match.currentPlayerId === "P2";
  const isPreparingHumanTurn = match.gameMode === "PVE_NORMAL" && match.currentPlayerId === "P1" && match.phase !== "ACTION";
  const resetConfirmButtonRef = useRef<HTMLButtonElement>(null);
  const lastLog = [...match.actionLog].reverse().find((entry) => entry.action.type === "PLAY_CARD" && (entry.outcomes?.length ?? 0) > 0)
    ?? [...match.actionLog].reverse().find((entry) => (entry.outcomes?.length ?? 0) > 0)
    ?? match.actionLog[match.actionLog.length - 1];
  const scoreDeltas = scoreDeltaByPlayer(lastLog);
  const selectedPlayability = selectedCardId ? getCardPlayability(match, activePlayerId, selectedCardId) : null;
  const feedbackLines = props.actionFeedback ? renderActionFeedback(match, props.actionFeedback, props.locale) : null;

  useEffect(() => {
    if (props.resetConfirmOpen) {
      resetConfirmButtonRef.current?.focus();
    }
  }, [props.resetConfirmOpen]);

  return (
    <main className="battle-app">
      <section className="scoreboard" aria-label={t(props.locale, "label.scoreboard")} aria-live="polite">
        {(["P1", "P2"] as PlayerId[]).map((playerId) => (
          <div key={playerId} className={`scoreboard-player ${match.currentPlayerId === playerId ? "active" : ""}`}>
            <span>{playerNameForMode(playerId, match.gameMode, props.locale)}</span>
            <strong>{match.players[playerId].score} / {gameConfig.target_score}</strong>
            {scoreDeltas[playerId] !== 0 && <em>{scoreDeltas[playerId] > 0 ? "+" : ""}{scoreDeltas[playerId]}</em>}
          </div>
        ))}
      </section>
      <section className="topbar" aria-label={t(props.locale, "label.matchStatus")}>
        <LocaleSelector locale={props.locale} onChange={props.onLocaleChange} />
        <div className="player-panel">
          <strong>{playerName(opponentId, props.locale)}</strong>
          <span>{t(props.locale, "label.deck")} {match.players[opponentId].deck.length} | {t(props.locale, "label.hand")} {match.players[opponentId].hand.length}</span>
        </div>
        <div className="phase-panel">
          <strong>{t(props.locale, "label.turn")} {match.turnNumber} — {phaseLabel(match.phase, props.locale)}</strong>
          <small>{match.players[activePlayerId].utilityLocked ? t(props.locale, "label.utilityUsed") : match.players[activePlayerId].utilityActionUsed ? t(props.locale, "label.utilityUsed") : t(props.locale, "label.utilityAvailable")}</small>
        </div>
        <div className="player-panel right">
          <strong>{playerName(activePlayerId, props.locale)}</strong>
          <span className="score">{match.players[activePlayerId].score} / {gameConfig.target_score}</span>
        </div>
      </section>

      <section className="board" aria-label={t(props.locale, "label.battlefield")}>
        {isAiTurn && <div className="ai-banner" role="status" aria-live="polite">{t(props.locale, "label.aiThinking")} — {t(props.locale, "label.computer")} is thinking...</div>}
        {isPreparingHumanTurn && <div className="ai-banner" role="status" aria-live="polite">{t(props.locale, "label.preparingTurn")}</div>}
        <HiddenHand count={match.players[opponentId].hand.length} locale={props.locale} />
        <div className="zone-label">{t(props.locale, "label.player2")}</div>
        <BoardRow match={match} ownerId={opponentId} viewerId={activePlayerId} selectedDefinition={controlsDisabled ? null : selectedDefinition} onTarget={props.onPlaySelected} onSelectEmptySlot={props.onSelectEmptySlot} onOpenGraveyard={props.onOpenGraveyard} locale={props.locale} />
        <div className="divider" />
        <BoardRow match={match} ownerId={activePlayerId} viewerId={activePlayerId} selectedDefinition={controlsDisabled ? null : selectedDefinition} onTarget={props.onPlaySelected} onSelectEmptySlot={props.onSelectEmptySlot} onOpenGraveyard={props.onOpenGraveyard} locale={props.locale} />
        <div className="zone-label">{t(props.locale, "label.you")} — {t(props.locale, "label.score")} {match.players[activePlayerId].score} / {gameConfig.target_score}</div>
        <div className="player-hand" aria-label={t(props.locale, "label.playerHand")} tabIndex={0}>
          {match.players[activePlayerId].hand.map((id) => {
            const definition = getCardDefinition(match.cardsByInstanceId[id].definitionId);
            const playability = getCardPlayability(match, activePlayerId, id);
            const localizedCard = getLocalizedCard(definition.card_id, props.locale);
            const localizedPlayabilityLabel = localizePlayabilityLabel(playability, props.locale);
            const localizedCategory = localizedCategoryLabel(definition.category, props.locale);
            return (
              <button key={id} type="button" className={`hand-card ${categoryClass(definition.category)} state-${playability.state.toLowerCase()} ${selectedCardId === id ? "selected" : ""}`} onClick={() => props.onSelectCard(id)} disabled={controlsDisabled} aria-disabled={playability.state === "NOT_PLAYABLE"} aria-describedby={`playability-${id}`} aria-label={`${definition.card_id} ${localizedCard.name}, ${localizedCategory} ${t(props.locale, "card.type")}`}>
                <span>{definition.card_id}</span>
                <strong>{localizedCard.name}</strong>
                <small>{localizedCategory}</small>
                <small id={`playability-${id}`} className="playability-label">{localizedPlayabilityLabel}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="actions">
        <div className="log" role="status">
          <strong>{t(props.locale, "label.actionLog")}</strong>
          <p>{props.message}</p>
          <small>{formatActionLogEntry(match, lastLog, props.locale)}</small>
        </div>
        <div className="utility-actions">
          <button type="button" className="destructive-button" onClick={props.onResetMatch}>{t(props.locale, "label.reset")}</button>
        </div>
        <div className="buttons">
          <button type="button" onClick={() => selectedDefinition?.category === "Animal" || selectedDefinition?.card_id === "X005" ? props.onPlaySelected() : undefined} disabled={controlsDisabled || !selectedDefinition || selectedPlayability?.state === "NOT_PLAYABLE" || needsTarget(selectedDefinition)}>
            {t(props.locale, "label.playCard")}
          </button>
          <button type="button" className="secondary-button" onClick={props.onRecycle} disabled={controlsDisabled}>{t(props.locale, "label.recycle")}</button>
          <button type="button" className="secondary-button" onClick={() => props.onOpenGraveyard(activePlayerId)}>{t(props.locale, "label.graveyard")}</button>
          <button type="button" className="secondary-button" onClick={() => selectedDefinition && props.onOpenCard(selectedDefinition)} disabled={!selectedDefinition}>{t(props.locale, "label.details")}</button>
          <button type="button" className="secondary-button" onClick={props.onUndo} disabled={!match.undoSnapshot}>{t(props.locale, "label.undo")}</button>
          <button type="button" className="danger-button" onClick={props.onEndTurn} disabled={isAiTurn || (match.phase !== "ACTION" && match.phase !== "END")}>{t(props.locale, "label.endTurn")}</button>
        </div>
        {selectedDefinition && (
          <div className="effect-preview" aria-label={t(props.locale, "label.effectPreview")}>
            <strong>{t(props.locale, "label.effectPreview")}</strong>
            <ul>
              {previewLines(selectedDefinition, getCardPlayability(match, activePlayerId, selectedCardId ?? ""), props.locale).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        )}
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
  locale
}: {
  match: MatchState;
  ownerId: PlayerId;
  viewerId: PlayerId;
  selectedDefinition: CardDefinition | null;
  onTarget: (target?: Target) => void;
  onSelectEmptySlot: (target: Target) => void;
  onOpenGraveyard: (playerId: PlayerId) => void;
  locale: Locale;
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
              ? <button key={index} type="button" className={`slot empty-slot ${selectedDefinition?.category === "Animal" ? "targetable" : ""}`} aria-label={`${t(locale, "label.animalZone")} ${index + 1} ${t(locale, "label.clearSelection")}`} onClick={() => onSelectEmptySlot({ playerId: ownerId, zone: "BOARD", slotNo })}>{t(locale, "label.animalZone")} {index + 1}</button>
              : <div key={index} className="slot" aria-label={`${t(locale, "label.animalZone")} ${index + 1}`}>{t(locale, "label.animalZone")} {index + 1}</div>;
          }
          const animal = match.cardsByInstanceId[instanceId];
          if (!isAnimalInstance(animal)) {
            return <div key={index} className="slot" aria-label={`ช่อง Animal ${index + 1}`}>สัตว์ {index + 1}</div>;
          }
          const definition = getCardDefinition(animal.definitionId);
          const localizedBoardCard = getLocalizedCard(definition.card_id, locale);
          const legal = selectedDefinition ? canTarget(selectedDefinition, ownerId, viewerId, animal.level) : false;
          return (
            <button key={instanceId} type="button" className={`slot filled ${legal ? "targetable" : "unavailable-target"}`} disabled={!legal} aria-label={`${localizedBoardCard.name} ${t(locale, "label.animalZone")} ${animal.slotNo}${legal ? ` ${t(locale, "label.select")}` : ` ${t(locale, "label.clearSelection")}`}`} onClick={() => onTarget({ playerId: ownerId, zone: "BOARD", instanceId, slotNo: animal.slotNo })}>
              <span className="level">{t(locale, "label.level")} {animal.level}</span>
              <span className="target-badge">{legal ? t(locale, "label.select") : t(locale, "label.clearSelection")}</span>
              <strong>{localizedBoardCard.name}</strong>
              {animal.level >= 2 && <small className="statuses">{evolutionLabel(animal.level, animal.evolutionPoints ?? 0)}</small>}
              {animal.attachedSupportIds.map((supportId) => (
                <span className="attached-support" key={supportId}>{t(locale, "label.attachedSupport")}: {getLocalizedCard(match.cardsByInstanceId[supportId].definitionId, locale).name}</span>
              ))}
              {animal.statuses.length > 0 && <small className="statuses">{t(locale, "label.statusCount")} {animal.statuses.length}: {localizedAnimalStatuses(animal, locale)}</small>}
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

function HandoffScreen({ nextPlayerId, onContinue }: { nextPlayerId: PlayerId; onContinue: () => void }) {
  return (
    <main className="app-shell privacy-shell">
      <section className="start-panel">
        <p className="eyebrow">ซ่อนมือผู้เล่น</p>
        <h1>ส่งเครื่องให้ {playerName(nextPlayerId)}</h1>
        <p>หน้าจอนี้ซ่อนมือของผู้เล่นก่อนหน้าแล้ว</p>
        <button type="button" onClick={onContinue}>พร้อมเล่น</button>
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
          <div><dt>{t(locale, "label.matchStatus")}</dt><dd>{match.finishReason === "TARGET_SCORE" ? t(locale, "label.victory") : t(locale, "label.resultDefeat")}</dd></div>
          <div><dt>{t(locale, "label.recycle")}</dt><dd>{(stats.recycleCount.P1 || 0) + (stats.recycleCount.P2 || 0)} ครั้ง</dd></div>
        </dl>

        <hr className="subtle-divider" />

        <h3>สถิติการ์ดออกนอกสนาม (Board Exits)</h3>
        <dl className="summary-grid compact-summary-grid">
          <div><dt>{t(locale, "label.graveyard")}</dt><dd>{sentToGraveyardCount} ใบ</dd></div>
          <div><dt>{t(locale, "label.hand")}</dt><dd>{returnedToHandCount} ใบ</dd></div>
          <div><dt>แลกเปลี่ยน (Quick Swap)</dt><dd>{voluntarySwapCount} ใบ</dd></div>
        </dl>

        <hr className="subtle-divider" />

        {highestCard && (
          <div className="highlight-card">
            <h4>การ์ดทำคะแนนสูงสุด (Highest Scoring Card)</h4>
            <p>
              <strong>{highestCard.nameTh}</strong> ({highestCard.cardId})
            </p>
            <p className="small-copy">
              คะแนนสะสม: {highestCard.score} คะแนน | เจ้าของ: {playerName(highestCard.ownerId)}
            </p>
          </div>
        )}

        <div className="menu-actions vertical-actions">
          <button type="button" onClick={() => onNewGame("LOCAL_PVP")}>{t(locale, "menu.localPvp")}</button>
          <button type="button" className="secondary-button" onClick={() => { void onExport(); }}>{t(locale, "label.exportLog")} (คัดลอกลง Clipboard)</button>
          <button type="button" className="secondary-button" onClick={onOpenPlaytestFeedback}>ฟีดแบ็ก Human Playtest (ไม่บังคับ)</button>
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
            <>
              <h2>{getLocalizedCard(modal.card.card_id, locale).name}</h2>
              <p>{modal.card.card_id} — {getLocalizedCard(modal.card.card_id, locale).type}</p>
              <div className="card-detail-lines" aria-label={t(locale, "label.details")}>
                {localizedCardDetailLines(getLocalizedCard(modal.card.card_id, locale), locale).map((line) => <p key={line}>{line}</p>)}
              </div>
            </>
          ) : (
            <>
              <h2>{getLocalizedCard(modal.card.card_id, locale).name}</h2>
              <p>{modal.card.card_id} — {getLocalizedCard(modal.card.card_id, locale).type}</p>
              <div className="card-detail-lines" aria-label={t(locale, "label.details")}>
                {localizedCardDetailLines(getLocalizedCard(modal.card.card_id, locale), locale).map((line) => <p key={line}>{line}</p>)}
              </div>
            </>
          )
        ) : (
          <>
            <h2>{t(locale, "label.graveyard")} {playerName(modal.playerId, locale)}</h2>
            <ul className="graveyard-list">
              {(match?.players[modal.playerId].graveyard ?? []).map((id) => {
                const card = match ? getCardDefinition(match.cardsByInstanceId[id].definitionId) : null;
                const localizedGrave = card ? getLocalizedCard(card.card_id, locale) : null;
                return <li key={id}>{card?.card_id} {localizedGrave?.name} <small>{localizedGrave?.type}</small></li>;
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
export function formatCardDetailLines(card: CardDefinition): string[] {
  const lines: string[] = [];
  if (card.primary_effect) {
    lines.push(...labelledCardLines(card));
  }
  return lines.flatMap(splitCardLine);
}

function labelledCardLines(card: CardDefinition): string[] {
  const lines: string[] = [];
  if (card.timing) {
    lines.push(`ความสามารถ: ${card.timing}`);
  }
  if (card.target) {
    lines.push(`เงื่อนไข: ${card.target}`);
  }
  if (card.category === "Support" && card.primary_effect) {
    lines.push(`Support: ${card.primary_effect}`);
  } else if (card.category === "Weakness" && card.primary_effect) {
    const [fullEffect, weakEffect] = splitWeaknessEffects(card.primary_effect);
    const targetLabel = weaknessTargetLabel(card.subtype);
    if (fullEffect) lines.push(`ใช้ตรงเป้าหมาย — ${targetLabel}: ${fullEffect}`);
    if (weakEffect) lines.push(`ใช้ผิดเป้าหมาย: ${weakEffect}`);
  } else if (card.primary_effect) {
    lines.push(`ความสามารถ: ${card.primary_effect}`);
  }
  if (card.secondary_effect) {
    lines.push(`จุดอ่อน: ${card.secondary_effect}`);
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

function weaknessTargetLabel(subtype: string): string {
  const labels = subtype
    .split("/")
    .map((part) => part.trim())
    .map((part) => part.replace(/\s+Weakness$/i, ""))
    .map((part) => ({ Dog: "สุนัข", Cat: "แมว", Rabbit: "กระต่าย", Bear: "หมี", Bird: "นก", Fish: "ปลา" }[part] ?? part))
    .filter(Boolean);
  return labels.join("และ");
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
    return { state: "NOT_PLAYABLE", label: "ยังใช้ไม่ได้", reason: "ไม่พบการ์ด" };
  }
  const definition = getCardDefinition(card.definitionId);
  if (definition.card_id === "S001" && hasLevel3Dog(match, playerId)) {
    return { state: "NOT_PLAYABLE", label: "สุนัขมีเลเวลสูงสุดแล้ว ไม่สามารถใช้กระดูกเพิ่มได้", reason: "สุนัขมีเลเวลสูงสุดแล้ว ไม่สามารถใช้กระดูกเพิ่มได้" };
  }
  const validation = validateAction(match, { type: "PLAY_CARD", playerId, payload: { cardInstanceId } });
  const translated = validation.valid ? "" : translateValidationReason(validation.errors[0]);
  if (validation.valid) {
    return { state: "PLAYABLE_NOW", label: "ใช้ได้ทันที" };
  }
  if (needsTarget(definition) && validation.errors.some((error) => error.includes("target is required") || error.includes("target"))) {
    if (definition.category === "Weakness" && hasEnemyBoard(match, playerId)) {
      return anyDirectWeaknessTarget(match, playerId, definition)
        ? { state: "PLAYABLE_AFTER_TARGET", label: "ต้องเลือกเป้าหมาย" }
        : { state: "PARTIAL_EFFECT_ONLY", label: "ใช้ได้แบบผลอ่อน", reason: "ใช้ได้ แต่ไม่ตรงจุดอ่อน: จะลดคะแนนครั้งถัดไป 1 คะแนน" };
    }
    if (hasPotentialTarget(match, playerId, definition)) {
      return { state: "PLAYABLE_AFTER_TARGET", label: "ต้องเลือกเป้าหมาย" };
    }
  }
  return { state: "NOT_PLAYABLE", label: translated, reason: translated };
}

function translateValidationReason(reason: string | undefined): string {
  if (!reason) return "ยังใช้ไม่ได้";
  if (reason.includes("No reversible action")) return "ไม่มีอะไรให้ย้อนกลับ";
  if (reason.includes("Only the player who made the action")) return "เฉพาะผู้เล่นที่กระทำการนั้นเท่านั้นที่ย้อนกลับได้";
  if (reason.includes("your current turn")) return "ย้อนกลับได้เฉพาะในเทิร์นของคุณ";
  if (reason.includes("Cannot undo after match finish")) return "ไม่สามารถย้อนกลับหลังเกมจบ";
  if (reason.includes("Cannot undo outside ACTION")) return "ย้อนกลับได้เฉพาะใน ACTION phase";
  if (reason.includes("Recycle is not allowed")) return "ไม่สามารถรีไซเคิลในเทิร์นแรก";
  if (reason.includes("Cannot recycle with an empty deck")) return "ไม่สามารถรีไซเคิลเมื่อกองจั่วว่าง";
  if (reason.includes("Selected Animal slot is occupied")) return "ช่อง Animal นี้ถูกครอบครองแล้ว";
  if (reason.includes("Match is already finished")) return "เกมจบแล้ว";
  if (reason.includes("Action player is not the current player")) return "ไม่ใช่ตาของคุณ";
  if (reason.includes("Food Thief can only be used while behind")) return "ใช้ได้เมื่อคะแนนตามหลังเท่านั้น";
  if (reason.includes("Quick Swap requires a replacement Animal from hand")) return "Quick Swap ต้องมี Animal ในมือ";
  if (reason.includes("Quick Swap replacement must be an Animal")) return "Quick Swap การ์ดแทนต้องเป็น Animal";
  if (reason.includes("ACTION phase")) return "ยังไม่ถึงช่วงที่ใช้ได้";
  if (reason.includes("current player's hand")) return "การ์ดไม่ได้อยู่ในมือ";
  if (reason.includes("Animal action already")) return "ใช้การ์ดสัตว์แล้วในเทิร์นนี้";
  if (reason.includes("Animal zone is full")) return "ช่องสัตว์เต็ม";
  if (reason.includes("Utility action is locked")) return "ใช้การ์ดประเภทนี้ไม่ได้ในเทิร์นนี้";
  if (reason.includes("Utility action already")) return "ใช้การ์ดประเภทนี้แล้วในเทิร์นนี้";
  if (reason.includes("board Animal target")) return "การ์ดนี้ต้องเลือกสัตว์";
  if (reason.includes("own Animal")) return "ต้องมีสัตว์ของคุณอยู่ในสนาม";
  if (reason.includes("enemy Animal")) return "ไม่มีเป้าหมายฝ่ายตรงข้าม";
  if (reason.includes("protected from Weakness")) return "เป้าหมายมีเกราะป้องกัน";
  if (reason.includes("เพิ่มเลเวลได้")) return "สัตว์มีเลเวลสูงสุดแล้ว ไม่สามารถใช้การ์ดเสริมที่เพิ่มเลเวลได้";
  if (reason.includes("Level 1")) return "ต้องเลือกสัตว์ Level 1";
  return reason;
}

const PLAYABILITY_LABEL_TH_TO_KEY: Record<string, TranslationKey> = {
  "ใช้ได้ทันที": "playability.playableNow",
  "ต้องเลือกเป้าหมาย": "playability.needsTarget",
  "ใช้ได้แบบผลอ่อน": "playability.partialEffect",
  "ยังใช้ไม่ได้": "playability.notPlayable",
  "ยังไม่ถึงช่วงที่ใช้ได้": "playability.reason.notActionPhase",
  "การ์ดไม่ได้อยู่ในมือ": "playability.reason.notInHand",
  "ใช้การ์ดสัตว์แล้วในเทิร์นนี้": "playability.reason.animalActionUsed",
  "ช่องสัตว์เต็ม": "playability.reason.animalZoneFull",
  "ใช้การ์ดประเภทนี้ไม่ได้ในเทิร์นนี้": "playability.reason.utilityLocked",
  "ใช้การ์ดประเภทนี้แล้วในเทิร์นนี้": "playability.reason.utilityUsed",
  "การ์ดนี้ต้องเลือกสัตว์": "playability.reason.needsAnimalTarget",
  "ต้องมีสัตว์ของคุณอยู่ในสนาม": "playability.reason.needsOwnAnimal",
  "ไม่มีเป้าหมายฝ่ายตรงข้าม": "playability.reason.noEnemyTarget",
  "เป้าหมายมีเกราะป้องกัน": "playability.reason.targetProtected",
  "ต้องเลือกสัตว์ Level 1": "playability.reason.needsLevel1",
  "สุนัขมีเลเวลสูงสุดแล้ว ไม่สามารถใช้กระดูกเพิ่มได้": "playability.reason.dogMaxLevel",
  "สัตว์มีเลเวลสูงสุดแล้ว ไม่สามารถใช้การ์ดเสริมที่เพิ่มเลเวลได้": "playability.reason.animalMaxLevel",
  "ใช้ได้ แต่ไม่ตรงจุดอ่อน: จะลดคะแนนครั้งถัดไป 1 คะแนน": "playability.reason.weaknessOffTarget",
  "ไม่พบการ์ด": "playability.reason.notFound",
  "ไม่มีอะไรให้ย้อนกลับ": "playability.reason.undoNotAvailable",
  "เฉพาะผู้เล่นที่กระทำการนั้นเท่านั้นที่ย้อนกลับได้": "playability.reason.undoWrongActor",
  "ย้อนกลับได้เฉพาะในเทิร์นของคุณ": "playability.reason.undoWrongTurn",
  "ไม่สามารถย้อนกลับหลังเกมจบ": "playability.reason.undoMatchFinished",
  "ย้อนกลับได้เฉพาะใน ACTION phase": "playability.reason.undoWrongPhase",
  "ไม่สามารถรีไซเคิลในเทิร์นแรก": "playability.reason.recycleFirstTurn",
  "ไม่สามารถรีไซเคิลเมื่อกองจั่วว่าง": "playability.reason.recycleEmptyDeck",
  "ต้องเลือกการ์ดในมือก่อน Recycle": "playability.reason.recycleNoCard",
  "ช่อง Animal นี้ถูกครอบครองแล้ว": "playability.reason.slotOccupied",
  "เกมจบแล้ว": "playability.reason.matchFinished",
  "ไม่ใช่ตาของคุณ": "playability.reason.wrongPlayer",
  "ใช้ได้เมื่อคะแนนตามหลังเท่านั้น": "playability.reason.behindOnly",
  "Quick Swap ต้องมี Animal ในมือ": "playability.reason.quickSwapRequires",
  "Quick Swap การ์ดแทนต้องเป็น Animal": "playability.reason.quickSwapNotAnimal"
};

function localizePlayabilityLabel(playability: PlayabilityInfo, locale: Locale): string {
  const key = PLAYABILITY_LABEL_TH_TO_KEY[playability.label];
  if (key) return t(locale, key);
  return playability.label;
}

function localizeValidationReason(error: string | undefined, locale: Locale): string {
  const thai = translateValidationReason(error);
  const key = PLAYABILITY_LABEL_TH_TO_KEY[thai];
  if (key) return t(locale, key);
  return t(locale, "playability.reason.fallback");
}

function localizePlayabilityReason(reason: string, locale: Locale): string {
  const key = PLAYABILITY_LABEL_TH_TO_KEY[reason];
  if (key) return t(locale, key);
  return reason;
}

const STATUS_KEY_MAP: Record<StatusEffectCode, { label: TranslationKey; description: TranslationKey; duration: TranslationKey }> = {
  SKIP_NEXT_SCORE: { label: "status.skipNextScore.label", description: "status.skipNextScore.description", duration: "status.skipNextScore.duration" },
  NEXT_SCORE_MINUS_1: { label: "status.nextScoreMinus1.label", description: "status.nextScoreMinus1.description", duration: "status.nextScoreMinus1.duration" },
  TEMP_WEAKNESS_IMMUNITY: { label: "status.tempWeaknessImmunity.label", description: "status.tempWeaknessImmunity.description", duration: "status.tempWeaknessImmunity.duration" },
  TEMP_LEVEL_DOWN_IMMUNITY: { label: "status.tempLevelDownImmunity.label", description: "status.tempLevelDownImmunity.description", duration: "status.tempLevelDownImmunity.duration" },
  REMOVAL_SHIELD: { label: "status.removalShield.label", description: "status.removalShield.description", duration: "status.removalShield.duration" },
  UTILITY_LOCK: { label: "status.utilityLock.label", description: "status.utilityLock.description", duration: "status.utilityLock.duration" },
};

function localizedStatusLabel(statusCode: StatusEffectCode, locale: Locale): string {
  const keys = STATUS_KEY_MAP[statusCode];
  if (!keys) return statusLabel(statusCode, false);
  const icon = statusDisplayMeta[statusCode]?.icon ?? "";
  return `${icon} ${t(locale, keys.label)} (${t(locale, keys.duration)})`;
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

function evolutionLabel(level: number, points: number): string {
  if (level >= 3) {
    return "วิวัฒนาการสำเร็จ ★★";
  }
  return points >= 1
    ? "วิวัฒนาการ ★☆ 1/2 — ทำคะแนนสำเร็จอีก 1 ครั้งเพื่อขึ้น Level 3"
    : "วิวัฒนาการ ☆☆ 0/2 — ทำคะแนนสำเร็จอีก 2 ครั้งเพื่อขึ้น Level 3";
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
  onMessage
}: {
  onBack: () => void;
  onShowExport: (json: string) => void;
  onMessage: (message: string) => void;
}) {
  const [history, setHistory] = useState<MatchResult[]>([]);

  useEffect(() => {
    const res = listMatchHistory();
    if (res.ok) {
      setHistory(res.value);
    }
  }, []);

  function handleClear() {
    if (window.confirm("คุณแน่ใจหรือไม่ว่าต้องการลบประวัติการเล่นทั้งหมด?")) {
      const res = clearMatchHistory();
      if (res.ok) {
        setHistory([]);
        alert("ลบประวัติการเล่นเรียบร้อยแล้ว");
      } else {
        alert(`ลบประวัติการเล่นล้มเหลว: ${storageErrorMessage(res.error)}`);
      }
    }
  }

  function handleExportAll() {
    const timestamp = Date.now();
    const result = exportAllMatchHistory(timestamp);
    if (!result.ok) {
      alert(`ส่งออกประวัติทั้งหมดล้มเหลว: ${storageErrorMessage(result.error)}`);
      return;
    }
    downloadJson(result.value, matchHistoryFilename(timestamp));
    onShowExport(result.value);
    onMessage("ส่งออกประวัติการเล่นทั้งหมดแล้ว");
  }

  function handleExportOne(result: MatchResult) {
    const exportResult = exportSingleMatchHistoryRecord(result);
    if (!exportResult.ok) {
      alert(`ส่งออกประวัติ match ล้มเหลว: ${storageErrorMessage(exportResult.error)}`);
      return;
    }
    downloadJson(exportResult.value, singleMatchHistoryFilename(result.matchId));
    onShowExport(exportResult.value);
    onMessage(`ส่งออกประวัติ ${result.matchId} แล้ว`);
  }

  return (
    <main className="page-shell scroll-page">
      <header className="page-header split-header">
        <h1>ประวัติการเล่น</h1>
        <div className="inline-actions">
          {history.length > 0 && (
            <>
              <button type="button" className="secondary-button" onClick={handleExportAll}>ส่งออกประวัติทั้งหมด</button>
              <button type="button" className="danger-button" onClick={handleClear}>ลบประวัติทั้งหมด</button>
            </>
          )}
          <button type="button" className="secondary-button" onClick={onBack}>กลับเมนู</button>
        </div>
      </header>

      {history.length === 0 ? (
        <p className="empty-state">ไม่มีประวัติการเล่น</p>
      ) : (
        <div className="history-list">
          {history.map((result) => {
            const playedAtDate = new Date(result.endedAt).toLocaleString("th-TH");
            return (
              <section key={result.matchId} className="start-panel history-card">
                <div className="history-meta">
                  <small>ID: {result.matchId}</small>
                  <small>เวลาเล่น: {playedAtDate}</small>
                </div>
                <h3>
                  ผลการแข่งขัน: {result.winner === "DRAW" ? "เสมอ" : `${playerName(result.winner)} ชนะ`}
                </h3>
                <dl className="summary-grid compact-summary-grid">
                  <div><dt>คะแนนผู้เล่น 1</dt><dd>{result.finalScores.P1}</dd></div>
                  <div><dt>คะแนนผู้เล่น 2</dt><dd>{result.finalScores.P2}</dd></div>
                  <div><dt>จำนวนเทิร์น</dt><dd>{result.turnCount}</dd></div>
                  <div><dt>ระยะเวลาเล่น</dt><dd>{formatDuration(result.duration)}</dd></div>
                  <div><dt>รีไซเคิลรวม</dt><dd>{result.recycleCount} ครั้ง</dd></div>
                  <div><dt>เหตุผลจบเกม</dt><dd>{result.finishReason === "TARGET_SCORE" ? "ทำคะแนนถึงเป้าหมาย" : "หมดจำนวนเทิร์น"}</dd></div>
                </dl>
                <div className="history-exits">
                  <div><strong>ลงสุสาน:</strong> {result.boardExitCount.sentToGraveyard} ใบ</div>
                  <div><strong>เด้งขึ้นมือ:</strong> {result.boardExitCount.returnedToHand} ใบ</div>
                  <div><strong>สลับตำแหน่ง:</strong> {result.boardExitCount.voluntarySwap} ใบ</div>
                </div>
                {result.highestScoringCard && (
                  <div className="history-highlight">
                    <strong>การ์ดทำคะแนนสูงสุด:</strong> {result.highestScoringCard.nameTh} ({result.highestScoringCard.cardId}) — {result.highestScoringCard.score} คะแนน (ของ {playerName(result.highestScoringCard.ownerId)})
                  </div>
                )}
                <div className="history-actions">
                  <button type="button" className="secondary-button" onClick={() => handleExportOne(result)}>ส่งออก match นี้</button>
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
  error
}: {
  onClose: () => void;
  onImport: (jsonText: string) => void;
  error: string | null;
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="modal-backdrop modal-top" role="dialog" aria-modal="true" aria-label="นำเข้าข้อมูลเซฟเกม">
      <section className="modal-panel import-export-panel">
        <h2>นำเข้าข้อมูลเซฟเกม</h2>
        <p className="muted-copy">วางข้อมูล JSON เพื่อโหลดเซฟเกมที่เคยเล่นอยู่</p>
        <textarea
          ref={textareaRef}
          className="json-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"schemaVersion": "1", ...}'
          aria-label="ข้อมูล JSON สำหรับนำเข้า"
        />
        {error && (
          <p className="error-copy">{error}</p>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>ปิด</button>
          <button type="button" onClick={() => onImport(text)} disabled={!text.trim()}>นำเข้า</button>
        </div>
      </section>
    </div>
  );
}

function PlaytestFeedbackModal({
  onClose,
  onExport,
  error
}: {
  onClose: () => void;
  onExport: (input: PlaytestFeedbackInput) => void;
  error: string | null;
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
    <div className="modal-backdrop modal-top" role="dialog" aria-modal="true" aria-label="ฟีดแบ็ก Playtest">
      <section className="modal-panel import-export-panel playtest-panel">
        <h2>ฟีดแบ็ก Human Playtest (ไม่บังคับ)</h2>
        <p className="muted-copy">กรอกเฉพาะรหัสนิรนามถ้าต้องการ ห้ามใส่ชื่อ อีเมล เบอร์โทร หรือข้อมูลส่วนตัว</p>
        <div className="feedback-grid">
          <label className="feedback-field" htmlFor="testerCode">
            <span>รหัสผู้ทดสอบนิรนาม (ไม่บังคับ)</span>
            <input
              ref={firstInputRef}
              id="testerCode"
              type="text"
              value={testerCode}
              onChange={(event) => setTesterCode(event.target.value)}
            />
          </label>
          <label className="feedback-field" htmlFor="playerSeat">
            <span>บทบาทผู้ให้ฟีดแบ็ก</span>
            <select id="playerSeat" value={playerSeat} onChange={(event) => setPlayerSeat(event.target.value as PlayerSeat)}>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="BOTH">BOTH</option>
              <option value="OBSERVER">OBSERVER</option>
            </select>
          </label>
        </div>
        <div className="feedback-grid">
          <RatingInput id="rulesClarity" label="ความชัดเจนของกติกา" value={ratings.rulesClarity} onChange={(value) => updateRating("rulesClarity", value)} />
          <RatingInput id="gameFun" label="ความสนุก" value={ratings.gameFun} onChange={(value) => updateRating("gameFun", value)} />
          <RatingInput id="gameLength" label="ความยาวเกม" value={ratings.gameLength} onChange={(value) => updateRating("gameLength", value)} />
          <RatingInput id="balance" label="สมดุลเกม" value={ratings.balance} onChange={(value) => updateRating("balance", value)} />
          <RatingInput id="uiClarity" label="ความชัดเจนของ UI" value={ratings.uiClarity} onChange={(value) => updateRating("uiClarity", value)} />
        </div>
        <TextFeedback id="confusingMoments" label="จุดที่สับสน" value={texts.confusingMoments} onChange={(value) => updateText("confusingMoments", value)} />
        <TextFeedback id="strongestCard" label="การ์ดที่รู้สึกว่าแข็งที่สุด" value={texts.strongestCard} onChange={(value) => updateText("strongestCard", value)} />
        <TextFeedback id="weakestCard" label="การ์ดที่รู้สึกว่าอ่อนที่สุด" value={texts.weakestCard} onChange={(value) => updateText("weakestCard", value)} />
        <TextFeedback id="bugDescription" label="รายละเอียดบั๊กที่พบ" value={texts.bugDescription} onChange={(value) => updateText("bugDescription", value)} />
        <TextFeedback id="additionalComments" label="ความคิดเห็นเพิ่มเติม" value={texts.additionalComments} onChange={(value) => updateText("additionalComments", value)} />
        {error && <p className="error-copy">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>ปิด</button>
          <button type="button" onClick={submit}>บันทึกและส่งออก JSON</button>
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
  inputRef
}: {
  id: FeedbackRatingKey;
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="feedback-field" htmlFor={id}>
      <span>{label} (1-5)</span>
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
  title = "ส่งออกข้อมูลเซฟเกม",
  description = "คัดลอก JSON นี้เพื่อเก็บ log หรือใช้ debug ภายในเครื่อง",
  textareaLabel = "ข้อมูล JSON สำหรับส่งออก"
}: {
  value: string;
  onClose: () => void;
  title?: string;
  description?: string;
  textareaLabel?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, []);

  return (
    <div className="modal-backdrop modal-top" role="dialog" aria-modal="true" aria-label={title}>
      <section className="modal-panel import-export-panel">
        <h2>{title}</h2>
        <p className="muted-copy">{description}</p>
        <textarea
          ref={textareaRef}
          className="json-textarea"
          value={value}
          readOnly
          aria-label={textareaLabel}
        />
        <div className="modal-actions">
          <button type="button" onClick={onClose}>ปิด</button>
        </div>
      </section>
    </div>
  );
}
