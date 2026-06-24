import { useMemo, useState } from "react";
import { cardCatalog } from "../data/cardsSeed";
import { gameConfig } from "../data/gameConfig";
import { dispatchAction } from "../engine/actions/reducer";
import { getCardDefinition, isAnimalInstance } from "../engine/cards/deck";
import { createMatch } from "../engine/state/match";
import { otherPlayerId } from "../engine/state/selectors";
import type { Action, CardCategory, CardDefinition, MatchState, PlayerId, Target } from "../types/game";

type Screen = "menu" | "howToPlay" | "library" | "battle" | "handoff" | "result";

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
  const [screen, setScreen] = useState<Screen>("menu");
  const [match, setMatch] = useState<MatchState | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [message, setMessage] = useState("เลือกการ์ดจากมือ แล้วเลือกเป้าหมายบนสนาม");
  const [modal, setModal] = useState<ModalState>(null);

  const activePlayerId = match?.currentPlayerId ?? "P1";
  const opponentId = otherPlayerId(activePlayerId);

  function startGame() {
    const started = advanceToAction(createMatch({ seed: "local-hot-seat-phase-4" }));
    setMatch(started);
    setSelectedCardId(null);
    setMessage("เริ่มเกมแล้ว ผู้เล่น 1 พร้อมเล่น");
    setScreen("battle");
  }

  function continueFromHandoff() {
    if (!match) {
      return;
    }

    const ready = advanceToAction(match);
    setMatch(ready);
    setSelectedCardId(null);
    setMessage(`ถึงตา ${playerName(ready.currentPlayerId)}`);
    setScreen(ready.status === "FINISHED" ? "result" : "battle");
  }

  function endTurn() {
    if (!match) {
      return;
    }

    const result = dispatchAction(match, {
      type: "END_TURN",
      playerId: match.currentPlayerId,
      payload: {}
    });

    setMatch(result.state);
    setSelectedCardId(null);
    setMessage(result.validation.valid ? "จบเทิร์นแล้ว" : result.validation.errors.join(", "));
    setScreen(result.state.status === "FINISHED" ? "result" : "handoff");
  }

  function recycleSelected() {
    if (!match || !selectedCardId) {
      setMessage("เลือกการ์ดในมือก่อนใช้ Recycle");
      return;
    }

    const result = dispatchAction(match, {
      type: "RECYCLE",
      playerId: match.currentPlayerId,
      payload: { cardInstanceId: selectedCardId }
    });

    setMatch(result.state);
    setSelectedCardId(null);
    setMessage(result.validation.valid ? "Recycle สำเร็จ: ทิ้ง 1 ใบ แล้วจั่ว 1 ใบ" : result.validation.errors.join(", "));
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

    const result = dispatchAction(match, {
      type: "PLAY_CARD",
      playerId: match.currentPlayerId,
      payload
    });

    setMatch(result.state);
    setSelectedCardId(null);
    setMessage(result.validation.valid ? `${definition.name_th} สำเร็จ` : result.validation.errors.join(", "));
    setScreen(result.state.status === "FINISHED" ? "result" : "battle");
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

  if (screen === "handoff" && match) {
    return <HandoffScreen nextPlayerId={match.currentPlayerId} onContinue={continueFromHandoff} />;
  }

  if ((screen === "result" || match?.status === "FINISHED") && match) {
    return <ResultScreen match={match} onNewGame={startGame} />;
  }

  if (screen === "battle" && match) {
    return (
      <BattleScreen
        match={match}
        activePlayerId={activePlayerId}
        opponentId={opponentId}
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
      />
    );
  }

  return <MainMenu onStart={startGame} onHowToPlay={() => setScreen("howToPlay")} onLibrary={() => setScreen("library")} />;
}

function MainMenu({ onStart, onHowToPlay, onLibrary }: { onStart: () => void; onHowToPlay: () => void; onLibrary: () => void }) {
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
          <button type="button" onClick={onStart} aria-label="เริ่มเกมใหม่">เริ่มเกม</button>
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
}) {
  const { match, activePlayerId, opponentId, selectedCardId, selectedDefinition } = props;

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
        <HiddenHand count={match.players[opponentId].hand.length} />
        <div className="zone-label">มือคู่ต่อสู้</div>
        <BoardRow match={match} ownerId={opponentId} viewerId={activePlayerId} selectedDefinition={selectedDefinition} onTarget={props.onPlaySelected} onOpenGraveyard={props.onOpenGraveyard} />
        <div className="divider" />
        <BoardRow match={match} ownerId={activePlayerId} viewerId={activePlayerId} selectedDefinition={selectedDefinition} onTarget={props.onPlaySelected} onOpenGraveyard={props.onOpenGraveyard} />
        <div className="zone-label">Animal Zone ของคุณ — คะแนน {match.players[activePlayerId].score} / {gameConfig.target_score}</div>
        <div className="player-hand" aria-label="มือผู้เล่นปัจจุบัน">
          {match.players[activePlayerId].hand.map((id) => {
            const definition = getCardDefinition(match.cardsByInstanceId[id].definitionId);
            return (
              <button key={id} type="button" className={`hand-card ${categoryClass(definition.category)} ${selectedCardId === id ? "selected" : ""}`} onClick={() => props.onSelectCard(id)}>
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
          <small>{match.actionLog[match.actionLog.length - 1]?.result ?? "ยังไม่มี action"}</small>
        </div>
        <div className="buttons">
          <button type="button" onClick={() => selectedDefinition?.category === "Animal" || selectedDefinition?.card_id === "X005" ? props.onPlaySelected() : undefined} disabled={!selectedDefinition || needsTarget(selectedDefinition)}>
            เล่นการ์ด
          </button>
          <button type="button" className="secondary-button" onClick={props.onRecycle}>Recycle</button>
          <button type="button" className="secondary-button" onClick={() => props.onOpenGraveyard(activePlayerId)}>ดูสุสาน</button>
          <button type="button" className="secondary-button" onClick={() => selectedDefinition && props.onOpenCard(selectedDefinition)} disabled={!selectedDefinition}>รายละเอียด</button>
          <button type="button" className="danger-button" onClick={props.onEndTurn}>จบเทิร์น</button>
        </div>
      </section>
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
      <div className="side-zone">Deck<br /><strong>{player.deck.length}</strong></div>
      <div className="animal-zone">
        {player.board.map((instanceId, index) => {
          if (!instanceId) {
            return <div key={index} className="slot">ช่อง Animal {index + 1}</div>;
          }
          const animal = match.cardsByInstanceId[instanceId];
          if (!isAnimalInstance(animal)) {
            return <div key={index} className="slot">ช่อง Animal {index + 1}</div>;
          }
          const definition = getCardDefinition(animal.definitionId);
          const legal = selectedDefinition ? canTarget(selectedDefinition, ownerId, viewerId, animal.level) : false;
          return (
            <button key={instanceId} type="button" className={`slot filled ${legal ? "targetable" : ""}`} disabled={!legal} onClick={() => onTarget({ playerId: ownerId, zone: "BOARD", instanceId, slotNo: animal.slotNo })}>
              <span className="level">Lv.{animal.level}</span>
              <strong>{definition.name_th}</strong>
              {animal.attachedSupportIds.map((supportId) => (
                <span className="attached-support" key={supportId}>{getCardDefinition(match.cardsByInstanceId[supportId].definitionId).name_th}</span>
              ))}
              {animal.statuses.length > 0 && <small className="statuses">{animal.statuses.map((status) => status.code).join(", ")}</small>}
            </button>
          );
        })}
      </div>
      <button type="button" className="side-zone graveyard-button" onClick={() => onOpenGraveyard(ownerId)}>Graveyard<br /><strong>{player.graveyard.length}</strong></button>
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

export function ResultScreen({ match, onNewGame }: { match: MatchState; onNewGame: () => void }) {
  return (
    <main className="app-shell">
      <section className="start-panel">
        <p className="eyebrow">ผลการแข่งขัน</p>
        <h1>{match.winner === "DRAW" ? "เสมอ" : `${playerName(match.winner ?? "P1")} ชนะ`}</h1>
        <dl className="summary-grid">
          <div><dt>Player 1</dt><dd>{match.players.P1.score}</dd></div>
          <div><dt>Player 2</dt><dd>{match.players.P2.score}</dd></div>
          <div><dt>เหตุผล</dt><dd>{match.finishReason ?? "-"}</dd></div>
          <div><dt>Turn</dt><dd>{match.turnNumber}</dd></div>
        </dl>
        <button type="button" onClick={onNewGame}>เริ่มเกมใหม่</button>
      </section>
    </main>
  );
}

function Modal({ modal, match, onClose }: { modal: ModalState; match?: MatchState; onClose: () => void }) {
  if (!modal) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-panel">
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
        <button type="button" onClick={onClose}>ปิด</button>
      </section>
    </div>
  );
}

function advanceToAction(state: MatchState): MatchState {
  let nextState = state;
  while (nextState.status !== "FINISHED" && nextState.phase !== "ACTION") {
    nextState = dispatchAction(nextState, {
      type: "ADVANCE_PHASE",
      playerId: nextState.currentPlayerId,
      payload: {}
    }).state;
  }
  return nextState;
}

function needsTarget(card: CardDefinition): boolean {
  return card.category === "Support" || card.category === "Weakness" || ["X001", "X003", "X004"].includes(card.card_id);
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
