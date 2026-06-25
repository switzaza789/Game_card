import { useMemo, useState, useEffect, useRef, type RefObject } from "react";
import { runPveNormalAiTurn } from "../ai/aiTurnController";
import { preparePveHumanTurnToAction } from "./pveHumanTurnController";
import { cardCatalog } from "../data/cardsSeed";
import { gameConfig } from "../data/gameConfig";
import { getCardDefinition, isAnimalInstance } from "../engine/cards/deck";
import { createMatch } from "../engine/state/match";
import { otherPlayerId } from "../engine/state/selectors";
import type { Action, CardCategory, CardDefinition, GameMode, MatchState, PlayerId, Target } from "../types/game";
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
import { renderOutcomeLines, statusLabel, summarizeOutcomes } from "../ui/effectFeedback";
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

const categoryLabels: Record<CardCategory, string> = {
  Animal: "สัตว์",
  Support: "สนับสนุน",
  Weakness: "จุดอ่อน",
  Special: "พิเศษ"
};

export function App() {
  const coordinator = useMemo(() => new PersistenceCoordinator(), []);
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
  const [effectFeedback, setEffectFeedback] = useState<string[] | null>(null);
  const lastFeedbackExportRef = useRef<string | null>(null);
  const aiExecutionRef = useRef<string | null>(null);
  const humanTurnPrepRef = useRef<string | null>(null);

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
    if (!window.confirm("รีเซ็ตเกมที่กำลังเล่นและกลับเมนูหลักหรือไม่?")) {
      return;
    }

    const deleteResult = deleteActiveMatch();
    setMatch(null);
    setSelectedCardId(null);
    setHasSavedGame(false);
    setScreen("menu");
    setMessage(deleteResult.ok ? "รีเซ็ตเกมเรียบร้อย" : `รีเซ็ตเกมแล้ว แต่ลบเซฟไม่สำเร็จ: ${storageErrorMessage(deleteResult.error)}`);
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
      setMessage(result.validation.errors.join(", "));
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
        setMatch(currentMatch);
        setSelectedCardId(null);
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
      setMessage("เลือกการ์ดในมือก่อนใช้ Recycle");
      return;
    }

    const result = coordinator.dispatch({
      type: "RECYCLE",
      playerId: match.currentPlayerId,
      payload: { cardInstanceId: selectedCardId }
    }, Date.now());

    setMatch(result.state);
    setSelectedCardId(null);
    if (!result.validation.valid) {
      setMessage(result.validation.errors.join(", "));
    } else {
      setMessage("Recycle สำเร็จ: ทิ้ง 1 ใบ แล้วจั่ว 1 ใบ");
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

    const card = match.cardsByInstanceId[selectedCardId];
    const definition = getCardDefinition(card.definitionId);

    if (isImportantCard(definition) && !window.confirm(`ยืนยันการเล่น ${definition.name_th}?`)) {
      setMessage("ยกเลิกการเล่นการ์ด");
      return;
    }

    const payload: Extract<Action, { type: "PLAY_CARD" }>["payload"] = {
      cardInstanceId: selectedCardId,
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
        if (id === selectedCardId) {
          return false;
        }
        return getCardDefinition(match.cardsByInstanceId[id].definitionId).category === "Animal";
      });
      payload.replacementCardInstanceId = replacement;
    }

    if (definition.card_id === "A008") {
      payload.selectedSupportInstanceId = findOwnAttachedSupport(match, match.currentPlayerId);
    }

    payload.bottomCardInstanceId = match.players[match.currentPlayerId].hand.find((id) => id !== selectedCardId);

    const result = coordinator.dispatch({
      type: "PLAY_CARD",
      playerId: match.currentPlayerId,
      payload
    }, Date.now());

    setMatch(result.state);
    setSelectedCardId(null);
    if (!result.validation.valid) {
      setMessage(result.validation.errors.join(", "));
    } else {
      setMessage(`${definition.name_th} สำเร็จ`);
      setEffectFeedback(renderOutcomeLines(result.state, result.state.actionLog[result.state.actionLog.length - 1]?.outcomes));
      if (result.state.status === "FINISHED") {
        setScreen("result");
      }
    }

    const sr3 = result.storageResult;
    if (!sr3.ok) {
      setMessage((prev) => `${prev} (บันทึกเซฟล้มเหลว: ${storageErrorMessage(sr3.error)})`);
    }
  }

  const selectedDefinition = useMemo(() => {
    if (!match || !selectedCardId) {
      return null;
    }
    return getCardDefinition(match.cardsByInstanceId[selectedCardId].definitionId);
  }, [match, selectedCardId]);

  if (screen === "howToPlay") {
    return <HowToPlay onBack={() => setScreen("menu")} />;
  }

  if (screen === "library") {
    return <CardLibrary onBack={() => setScreen("menu")} onOpenCard={(card) => setModal({ type: "card", card })} modal={modal} onCloseModal={() => setModal(null)} />;
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
          onBackToMenu={() => setScreen("menu")}
          onExport={() => { void handleExport(); }}
          onOpenPlaytestFeedback={() => {
            setPlaytestError(null);
            setPlaytestFeedbackOpen(true);
          }}
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
        onSelectCard={setSelectedCardId}
        onPlaySelected={playSelected}
        onRecycle={recycleSelected}
        onEndTurn={endTurn}
        onOpenCard={(card) => setModal({ type: "card", card })}
        onOpenGraveyard={(playerId) => setModal({ type: "graveyard", playerId })}
        onCloseModal={() => setModal(null)}
        onResetMatch={resetMatch}
        controlsDisabled={(match.gameMode === "PVE_NORMAL" && match.currentPlayerId === "P2") || match.phase !== "ACTION"}
        effectFeedback={effectFeedback}
        onDismissFeedback={() => setEffectFeedback(null)}
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
  onOpenImport
}: {
  onStart: (gameMode?: GameMode) => void;
  onHowToPlay: () => void;
  onLibrary: () => void;
  hasSavedGame: boolean;
  onContinue: () => void;
  onClearSave: () => void;
  onViewHistory: () => void;
  onOpenImport: () => void;
}) {
  return (
    <main className="app-shell" aria-labelledby="game-title">
      <section className="start-panel">
        <p className="eyebrow">Local Hot-seat Prototype</p>
        <h1 id="game-title">{gameConfig.game_title}</h1>
        <dl className="summary-grid" aria-label="ข้อมูลเกมที่โหลดแล้ว">
          <div><dt>เวอร์ชัน</dt><dd>{gameConfig.version}</dd></div>
          <div><dt>จำนวนการ์ด</dt><dd>{cardCatalog.cards.length} ใบ</dd></div>
          <div><dt>ผู้เล่น</dt><dd>{gameConfig.players} คน</dd></div>
          <div><dt>คะแนนชนะ</dt><dd>{gameConfig.target_score} คะแนน</dd></div>
        </dl>
        <div className="menu-actions">
          {hasSavedGame && (
            <>
              <button type="button" onClick={onContinue} aria-label="เล่นต่อจากเซฟเดิม">เล่นต่อ</button>
              <button type="button" className="danger-button" onClick={onClearSave} aria-label="ลบไฟล์เซฟ">ลบเซฟ</button>
            </>
          )}
          <button type="button" onClick={() => onStart("LOCAL_PVP")} aria-label="เริ่มเกมใหม่">
            {hasSavedGame ? "เริ่ม Local PvP ใหม่" : "Local PvP"}
          </button>
          <button type="button" onClick={() => onStart("PVE_NORMAL")} aria-label="เริ่ม PvE กับคอมพิวเตอร์">
            PvE vs Computer <small>Normal AI</small>
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

function HowToPlay({ onBack }: { onBack: () => void }) {
  return (
    <main className="page-shell">
      <header className="page-header">
        <h1>วิธีเล่น</h1>
        <button type="button" className="secondary-button" onClick={onBack}>กลับเมนู</button>
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
  onCloseModal
}: {
  onBack: () => void;
  onOpenCard: (card: CardDefinition) => void;
  modal: ModalState;
  onCloseModal: () => void;
}) {
  return (
    <main className="page-shell">
      <header className="page-header">
        <h1>คลังการ์ด</h1>
        <button type="button" className="secondary-button" onClick={onBack}>กลับเมนู</button>
      </header>
      <div className="library-grid">
        {cardCatalog.cards.map((card) => (
          <button key={card.card_id} type="button" className={`library-card ${categoryClass(card.category)}`} onClick={() => onOpenCard(card)}>
            <span>{card.card_id}</span>
            <strong>{card.name_th}</strong>
            <small>{categoryLabels[card.category]}</small>
          </button>
        ))}
      </div>
      <Modal modal={modal} onClose={onCloseModal} />
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
  onRecycle: () => void;
  onEndTurn: () => void;
  onOpenCard: (card: CardDefinition) => void;
  onOpenGraveyard: (playerId: PlayerId) => void;
  onCloseModal: () => void;
  onResetMatch: () => void;
  controlsDisabled?: boolean;
  effectFeedback: string[] | null;
  onDismissFeedback: () => void;
}) {
  const { match, activePlayerId, opponentId, selectedCardId, selectedDefinition } = props;
  const controlsDisabled = Boolean(props.controlsDisabled);
  const isAiTurn = match.gameMode === "PVE_NORMAL" && match.currentPlayerId === "P2";
  const isPreparingHumanTurn = match.gameMode === "PVE_NORMAL" && match.currentPlayerId === "P1" && match.phase !== "ACTION";

  return (
    <main className="battle-app">
      <section className="topbar" aria-label="สถานะการแข่งขัน">
        <div className="player-panel">
          <strong>{playerName(opponentId)}</strong>
          <span>Deck {match.players[opponentId].deck.length} | Hand {match.players[opponentId].hand.length}</span>
        </div>
        <div className="phase-panel">
          <strong>TURN {match.turnNumber} — {phaseLabel(match.phase)}</strong>
          <small>Utility: {match.players[activePlayerId].utilityLocked ? "ถูกล็อก" : match.players[activePlayerId].utilityActionUsed ? "ใช้แล้ว" : "พร้อมใช้"}</small>
        </div>
        <div className="player-panel right">
          <strong>{playerName(activePlayerId)}</strong>
          <span className="score">{match.players[activePlayerId].score} / {gameConfig.target_score}</span>
        </div>
      </section>

      <section className="board" aria-label="สนามต่อสู้">
        {isAiTurn && <div className="ai-banner" role="status" aria-live="polite">AI Turn — Computer is thinking...</div>}
        {isPreparingHumanTurn && <div className="ai-banner" role="status" aria-live="polite">กำลังจั่วและคิดคะแนน...</div>}
        <HiddenHand count={match.players[opponentId].hand.length} />
        <div className="zone-label">มือคู่ต่อสู้</div>
        <BoardRow match={match} ownerId={opponentId} viewerId={activePlayerId} selectedDefinition={controlsDisabled ? null : selectedDefinition} onTarget={props.onPlaySelected} onOpenGraveyard={props.onOpenGraveyard} />
        <div className="divider" />
        <BoardRow match={match} ownerId={activePlayerId} viewerId={activePlayerId} selectedDefinition={controlsDisabled ? null : selectedDefinition} onTarget={props.onPlaySelected} onOpenGraveyard={props.onOpenGraveyard} />
        <div className="zone-label">Animal Zone ของคุณ — คะแนน {match.players[activePlayerId].score} / {gameConfig.target_score}</div>
        <div className="player-hand" aria-label="มือผู้เล่นปัจจุบัน" tabIndex={0}>
          {match.players[activePlayerId].hand.map((id) => {
            const definition = getCardDefinition(match.cardsByInstanceId[id].definitionId);
            return (
              <button key={id} type="button" className={`hand-card ${categoryClass(definition.category)} ${selectedCardId === id ? "selected" : ""}`} onClick={() => props.onSelectCard(id)} disabled={controlsDisabled}>
                <span>{definition.card_id}</span>
                <strong>{definition.name_th}</strong>
                <small>{categoryLabels[definition.category]}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="actions">
        <div className="log" role="status">
          <strong>Action Log</strong>
          <p>{props.message}</p>
          <small>{summarizeOutcomes(match, match.actionLog[match.actionLog.length - 1]?.outcomes) || match.actionLog[match.actionLog.length - 1]?.result || "ยังไม่มี action"}</small>
        </div>
        <div className="buttons">
          <button type="button" onClick={() => selectedDefinition?.category === "Animal" || selectedDefinition?.card_id === "X005" ? props.onPlaySelected() : undefined} disabled={controlsDisabled || !selectedDefinition || needsTarget(selectedDefinition)}>
            เล่นการ์ด
          </button>
          <button type="button" className="secondary-button" onClick={props.onRecycle} disabled={controlsDisabled}>Recycle</button>
          <button type="button" className="secondary-button" onClick={() => props.onOpenGraveyard(activePlayerId)}>ดูสุสาน</button>
          <button type="button" className="secondary-button" onClick={() => selectedDefinition && props.onOpenCard(selectedDefinition)} disabled={!selectedDefinition}>รายละเอียด</button>
          <button type="button" className="secondary-button" onClick={props.onResetMatch}>รีเซ็ตเกม</button>
          <button type="button" className="danger-button" onClick={props.onEndTurn} disabled={isAiTurn || (match.phase !== "ACTION" && match.phase !== "END")}>จบเทิร์น</button>
        </div>
        {selectedDefinition && (
          <div className="effect-preview" aria-label="ผลที่จะเกิดขึ้น">
            <strong>ผลที่จะเกิดขึ้น</strong>
            <ul>
              {previewLines(selectedDefinition).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        )}
      </section>
      {props.effectFeedback && props.effectFeedback.length > 0 && (
        <section className="effect-feedback" role="status" aria-live="polite" aria-label="สรุปผลของการ์ด">
          <div>
            <strong>ผลที่ได้รับ</strong>
            <ul>
              {props.effectFeedback.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <button type="button" className="secondary-button" onClick={props.onDismissFeedback}>ปิด</button>
        </section>
      )}
      <Modal modal={props.modal} match={match} onClose={props.onCloseModal} />
    </main>
  );
}

function BoardRow({
  match,
  ownerId,
  viewerId,
  selectedDefinition,
  onTarget,
  onOpenGraveyard
}: {
  match: MatchState;
  ownerId: PlayerId;
  viewerId: PlayerId;
  selectedDefinition: CardDefinition | null;
  onTarget: (target?: Target) => void;
  onOpenGraveyard: (playerId: PlayerId) => void;
}) {
  const player = match.players[ownerId];
  return (
    <div className="row">
      <div className="side-zone deck-zone"><span className="zone-title">กองจั่ว</span><strong>{player.deck.length}</strong></div>
      <div className="animal-zone">
        {player.board.map((instanceId, index) => {
          if (!instanceId) {
            return <div key={index} className="slot" aria-label={`ช่อง Animal ${index + 1}`}>สัตว์ {index + 1}</div>;
          }
          const animal = match.cardsByInstanceId[instanceId];
          if (!isAnimalInstance(animal)) {
            return <div key={index} className="slot" aria-label={`ช่อง Animal ${index + 1}`}>สัตว์ {index + 1}</div>;
          }
          const definition = getCardDefinition(animal.definitionId);
          const legal = selectedDefinition ? canTarget(selectedDefinition, ownerId, viewerId, animal.level) : false;
          return (
            <button key={instanceId} type="button" className={`slot filled ${legal ? "targetable" : ""}`} disabled={!legal} onClick={() => onTarget({ playerId: ownerId, zone: "BOARD", instanceId, slotNo: animal.slotNo })}>
              <span className="level">Lv.{animal.level}</span>
              <strong>{definition.name_th}</strong>
              {animal.level >= 2 && <small className="statuses">{evolutionLabel(animal.level, animal.evolutionPoints ?? 0)}</small>}
              {animal.attachedSupportIds.map((supportId) => (
                <span className="attached-support" key={supportId}>{getCardDefinition(match.cardsByInstanceId[supportId].definitionId).name_th}</span>
              ))}
              {animal.statuses.length > 0 && <small className="statuses">{animal.statuses.map((status) => statusLabel(status.code)).join(", ")}</small>}
            </button>
          );
        })}
      </div>
      <button type="button" className="side-zone graveyard-button" onClick={() => onOpenGraveyard(ownerId)}><span className="zone-title">สุสาน</span><strong>{player.graveyard.length}</strong></button>
    </div>
  );
}

function HiddenHand({ count }: { count: number }) {
  return (
    <div className="opponent-hand" aria-label="มือคู่ต่อสู้ถูกซ่อน">
      {Array.from({ length: count }).map((_, index) => <div className="card-back" key={index} />)}
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
  onOpenPlaytestFeedback = () => undefined
}: {
  match: MatchState;
  stats?: MatchStats;
  onNewGame: (gameMode?: GameMode) => void;
  onBackToMenu?: () => void;
  onExport?: () => void;
  onOpenPlaytestFeedback?: () => void;
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
        <p className="eyebrow">ผลการแข่งขัน</p>
        <h1>{match.winner === "DRAW" ? "เสมอ" : `${playerName(match.winner ?? "P1")} ชนะ`}</h1>

        <dl className="summary-grid result-summary-grid">
          <div><dt>คะแนนผู้เล่น 1</dt><dd>{match.players.P1.score} คะแนน</dd></div>
          <div><dt>คะแนนผู้เล่น 2</dt><dd>{match.players.P2.score} คะแนน</dd></div>
          <div><dt>จำนวนเทิร์น</dt><dd>{match.turnNumber} เทิร์น</dd></div>
          <div><dt>ระยะเวลาที่ใช้</dt><dd>{formatDuration(durationMs)}</dd></div>
          <div><dt>เหตุผลที่จบ</dt><dd>{match.finishReason === "TARGET_SCORE" ? "ทำคะแนนถึงเป้าหมาย" : "หมดจำนวนเทิร์น"}</dd></div>
          <div><dt>จำนวนการรีไซเคิล</dt><dd>{(stats.recycleCount.P1 || 0) + (stats.recycleCount.P2 || 0)} ครั้ง</dd></div>
        </dl>

        <hr className="subtle-divider" />

        <h3>สถิติการ์ดออกนอกสนาม (Board Exits)</h3>
        <dl className="summary-grid compact-summary-grid">
          <div><dt>ลงสุสาน</dt><dd>{sentToGraveyardCount} ใบ</dd></div>
          <div><dt>เด้งขึ้นมือ</dt><dd>{returnedToHandCount} ใบ</dd></div>
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
          <button type="button" onClick={() => onNewGame("LOCAL_PVP")}>เริ่มเกมใหม่</button>
          <button type="button" className="secondary-button" onClick={() => { void onExport(); }}>ส่งออกไฟล์เซฟ (คัดลอกลง Clipboard)</button>
          <button type="button" className="secondary-button" onClick={onOpenPlaytestFeedback}>ฟีดแบ็ก Human Playtest (ไม่บังคับ)</button>
          <button type="button" className="secondary-button" onClick={onBackToMenu}>กลับเมนูหลัก</button>
        </div>
      </section>
    </main>
  );
}

function Modal({ modal, match, onClose }: { modal: ModalState; match?: MatchState; onClose: () => void }) {
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={modal.type === "card" ? "รายละเอียดการ์ด" : "สุสาน"}>
      <section className="modal-panel" tabIndex={-1}>
        {modal.type === "card" ? (
          <>
            <h2>{modal.card.name_th}</h2>
            <p>{modal.card.card_id} — {categoryLabels[modal.card.category]}</p>
            <p>{modal.card.primary_effect}</p>
            {modal.card.secondary_effect && <p>{modal.card.secondary_effect}</p>}
          </>
        ) : (
          <>
            <h2>สุสาน {playerName(modal.playerId)}</h2>
            <ul className="graveyard-list">
              {(match?.players[modal.playerId].graveyard ?? []).map((id) => {
                const card = match ? getCardDefinition(match.cardsByInstanceId[id].definitionId) : null;
                return <li key={id}>{card?.card_id} {card?.name_th}</li>;
              })}
            </ul>
          </>
        )}
        <button type="button" ref={closeButtonRef} onClick={onClose}>ปิด</button>
      </section>
    </div>
  );
}


function needsTarget(card: CardDefinition): boolean {
  return card.category === "Support" || card.category === "Weakness" || ["X001", "X003", "X004"].includes(card.card_id);
}

function previewLines(card: CardDefinition): string[] {
  if (card.category === "Animal") {
    return ["ลง Animal ที่ Level 1", "ใช้ Animal Action ของเทิร์นนี้"];
  }
  if (card.category === "Support") {
    return [
      "ถ้า Support ตรงชนิด: เพิ่ม Animal เป็น Level 2",
      "อาจได้รับสถานะหรือผลเพิ่มเติมตามการ์ด",
      "ใช้ Utility Action ของเทิร์นนี้"
    ];
  }
  if (card.category === "Weakness") {
    return [
      "หากใช้กับเป้าหมายที่แพ้ทาง: ลด Level หรือนำออกจากสนาม",
      "หากใช้ผิดเป้าหมาย: ลดคะแนนรอบถัดไป",
      "อาจถูกป้องกันด้วย Weakness Shield"
    ];
  }
  if (card.card_id === "X001") return ["ทำให้เป้าหมายข้ามการคิดคะแนนครั้งถัดไป", "ใช้ Utility Action ของเทิร์นนี้"];
  if (card.card_id === "X002") return ["ใช้เป็น Reaction เพื่อป้องกัน Weakness", "ไม่สามารถเล่นโดยตรงได้"];
  if (card.card_id === "X003") return ["คืน Animal ของตัวเองขึ้นมือและลง Animal จากมือแทน", "แต้มวิวัฒนาการของตัวที่ออกจากสนามจะหายไป"];
  if (card.card_id === "X004") return ["คืน Animal Level 1 ของคู่ต่อสู้ขึ้นมือ", "โล่ป้องกันการนำออกอาจป้องกันผลนี้"];
  if (card.card_id === "X005") return ["ใช้ได้เมื่อคะแนนตามหลัง", "คุณได้ +1 คะแนน และคู่ต่อสู้เสีย 1 คะแนน"];
  return ["ใช้ Utility Action ของเทิร์นนี้"];
}

function canTarget(card: CardDefinition, ownerId: PlayerId, viewerId: PlayerId, level: number): boolean {
  if (card.category === "Support") {
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

function isImportantCard(card: CardDefinition): boolean {
  return card.category === "Weakness" || ["X003", "X004", "X005"].includes(card.card_id);
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

function playerName(playerId: PlayerId) {
  return playerId === "P1" ? "ผู้เล่น 1" : "ผู้เล่น 2";
}

function categoryClass(category: CardCategory) {
  return `cat-${category.toLowerCase()}`;
}

function phaseLabel(phase: MatchState["phase"]) {
  const labels: Record<MatchState["phase"], string> = {
    READY: "เตรียมพร้อม",
    DRAW: "จั่วการ์ด",
    SCORE: "คิดคะแนน",
    ACTION: "เล่นการ์ด",
    END: "จบเทิร์น"
  };
  return labels[phase];
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
