import { useCallback, useMemo, useState } from "react";
import { gameConfig } from "../data/gameConfig";
import { getCardDefinition } from "../engine/cards/deck";
import { otherPlayerId } from "../engine/state/selectors";
import { getLocalizedCard, t } from "../i18n";
import type { Locale } from "../i18n";
import type { MatchState } from "../types/game";
import "./openingDraw.css";

type OpeningDrawPanelProps = {
  locale: Locale;
  match: MatchState;
  onDrawCard: () => void;
  onReady?: (cardInstanceIds: string[]) => void;
};

export function OpeningDrawPanel({ locale, match, onDrawCard, onReady }: OpeningDrawPanelProps) {
  const [selectedMulliganIds, setSelectedMulliganIds] = useState<string[]>([]);
  const total = gameConfig.starting_hand;
  const humanId = match.gameMode === "PVE_NORMAL" ? "P1" : match.currentPlayerId;
  const humanPct = ((total - match.openingDrawRemaining[humanId]) / total) * 100;
  const opponentId = otherPlayerId(humanId);
  const opponentPct = ((total - match.openingDrawRemaining[opponentId]) / total) * 100;
  const isReady = match.pregameStep === "COMPLETE";
  const isHumanTurn = match.openingDrawPlayerId === humanId;
  const isOpponentTurn = match.openingDrawPlayerId === opponentId;
  const activeHand = match.players[humanId].hand;
  const mulliganCards = useMemo(() => activeHand.map((instanceId) => {
    const card = match.cardsByInstanceId[instanceId];
    const definition = getCardDefinition(card.definitionId);
    return {
      instanceId,
      label: getLocalizedCard(definition.card_id, locale).name
    };
  }), [activeHand, locale, match.cardsByInstanceId]);

  const handleDraw = useCallback(() => {
    onDrawCard();
  }, [onDrawCard]);

  const toggleMulligan = useCallback((instanceId: string) => {
    setSelectedMulliganIds((current) => (
      current.includes(instanceId)
        ? current.filter((id) => id !== instanceId)
        : [...current, instanceId]
    ));
  }, []);

  const handleReady = useCallback(() => {
    onReady?.(selectedMulliganIds);
  }, [onReady, selectedMulliganIds]);

  return (
    <div className="opening-draw-overlay" role="dialog" aria-modal="true" aria-labelledby="opening-draw-title">
      <div className="opening-draw-card">
        <h2 id="opening-draw-title">{t(locale, "pregame.openingDraw")}</h2>

        <div className="opening-draw-players">
          <div className="opening-draw-player">
            <span className="opening-draw-label">
              {match.gameMode === "PVE_NORMAL" && humanId === "P1"
                ? t(locale, "label.you")
                : t(locale, "label.player1")}
            </span>
            <div className="opening-draw-bar-track">
              <div
                className="opening-draw-bar-fill"
                style={{ width: `${humanPct}%` }}
              />
            </div>
            <span className="opening-draw-count">
              {total - match.openingDrawRemaining[humanId]}/{total}
            </span>
          </div>

          <div className="opening-draw-player">
            <span className="opening-draw-label">
              {match.gameMode === "PVE_NORMAL"
                ? t(locale, "label.computer")
                : t(locale, "label.player2")}
            </span>
            <div className="opening-draw-bar-track">
              <div
                className="opening-draw-bar-fill"
                style={{ width: `${opponentPct}%` }}
              />
            </div>
            <span className="opening-draw-count">
              {total - match.openingDrawRemaining[opponentId]}/{total}
            </span>
          </div>
        </div>

        {isReady && onReady && (
          <div className="opening-draw-ready">
            <p className="opening-draw-hint">{t(locale, "pregame.mulliganHint")}</p>
            <div className="opening-draw-mulligan-list">
              {mulliganCards.map((card) => {
                const checked = selectedMulliganIds.includes(card.instanceId);
                return (
                  <label key={card.instanceId} className={`opening-draw-mulligan-item${checked ? " selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMulligan(card.instanceId)}
                    />
                    <span>{card.label}</span>
                  </label>
                );
              })}
            </div>
            <button className="opening-draw-button" type="button" onClick={handleReady} autoFocus>
              {t(locale, "handoff.readyButton")}
            </button>
          </div>
        )}

        {!isReady && isHumanTurn && (
          <button className="opening-draw-button" type="button" onClick={handleDraw} autoFocus>
            {t(locale, "pregame.drawCard")}
          </button>
        )}

        {!isReady && isOpponentTurn && match.gameMode === "PVE_NORMAL" && (
          <p className="opening-draw-waiting">{t(locale, "pregame.opponentDrawing")}</p>
        )}

        {!isReady && isOpponentTurn && match.gameMode !== "PVE_NORMAL" && (
          <button className="opening-draw-button" type="button" onClick={handleDraw} autoFocus>
            {t(locale, "pregame.drawCard")}
          </button>
        )}
      </div>
    </div>
  );
}
