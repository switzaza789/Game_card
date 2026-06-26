import type { ActionLogEntry, EffectOutcome, MatchState, PlayerId, StatusEffectCode } from "../types/game";
import { getCardDefinition } from "../engine/cards/deck";
import { t, getLocalizedCard } from "../i18n";
import type { Locale, TranslationKey } from "../i18n";

export type StatusDisplayMeta = {
  label: string;
  description: string;
  duration: string;
  icon: string;
  tone: "beneficial" | "harmful" | "neutral";
};

const STATUS_T_KEY: Record<StatusEffectCode, { label: TranslationKey; duration: TranslationKey }> = {
  SKIP_NEXT_SCORE: { label: "status.skipNextScore.label", duration: "status.skipNextScore.duration" },
  NEXT_SCORE_MINUS_1: { label: "status.nextScoreMinus1.label", duration: "status.nextScoreMinus1.duration" },
  TEMP_WEAKNESS_IMMUNITY: { label: "status.tempWeaknessImmunity.label", duration: "status.tempWeaknessImmunity.duration" },
  TEMP_LEVEL_DOWN_IMMUNITY: { label: "status.tempLevelDownImmunity.label", duration: "status.tempLevelDownImmunity.duration" },
  REMOVAL_SHIELD: { label: "status.removalShield.label", duration: "status.removalShield.duration" },
  UTILITY_LOCK: { label: "status.utilityLock.label", duration: "status.utilityLock.duration" },
};

export const statusDisplayMeta: Record<StatusEffectCode, StatusDisplayMeta> = {
  SKIP_NEXT_SCORE: {
    label: "ข้ามการคิดคะแนนครั้งถัดไป",
    description: "Animal นี้จะไม่ได้คะแนนใน SCORE phase ถัดไปที่สถานะยังมีผล",
    duration: "หมดอายุหลัง SCORE phase ถัดไป",
    icon: "⏭",
    tone: "harmful"
  },
  NEXT_SCORE_MINUS_1: {
    label: "-1 คะแนนรอบถัดไป",
    description: "ลดคะแนนที่ Animal นี้จะทำได้ลง 1 คะแนนใน SCORE phase ถัดไป",
    duration: "หมดอายุหลัง SCORE phase ถัดไป",
    icon: "−1",
    tone: "harmful"
  },
  TEMP_WEAKNESS_IMMUNITY: {
    label: "ป้องกัน Weakness",
    description: "Animal นี้ไม่ตกเป็นเป้าหมายของ Weakness ระหว่างที่สถานะยังมีผล",
    duration: "หมดอายุเมื่อจบเทิร์นถัดไปของคู่ต่อสู้",
    icon: "🛡",
    tone: "beneficial"
  },
  TEMP_LEVEL_DOWN_IMMUNITY: {
    label: "ป้องกันการลด Level",
    description: "ป้องกันผลที่ลด Level ของ Animal นี้",
    duration: "หมดอายุเมื่อจบเทิร์นถัดไปของคู่ต่อสู้",
    icon: "⬆",
    tone: "beneficial"
  },
  REMOVAL_SHIELD: {
    label: "โล่ป้องกันการนำออก",
    description: "ป้องกันการถูกนำออกจากสนาม 1 ครั้งหรือคงคะแนนขั้นต่ำตามแหล่งที่มา",
    duration: "คงอยู่จนถูกใช้หรือจนถึง SCORE phase ตามชนิดของผล",
    icon: "🛡",
    tone: "beneficial"
  },
  UTILITY_LOCK: {
    label: "ล็อก Utility",
    description: "ผู้เล่นถูกจำกัดการใช้ Utility Action",
    duration: "หมดอายุตามผลของการ์ดที่สร้างสถานะ",
    icon: "🔒",
    tone: "harmful"
  }
};

function localizedStatusLabel(statusCode: StatusEffectCode, locale: Locale, includeDuration = true): string {
  const keys = STATUS_T_KEY[statusCode];
  if (!keys) return statusLabel(statusCode, includeDuration);
  const icon = statusDisplayMeta[statusCode]?.icon ?? "";
  return `${icon} ${t(locale, keys.label)}${includeDuration ? ` (${t(locale, keys.duration)})` : ""}`;
}

export function renderOutcomeLines(match: MatchState, outcomes: EffectOutcome[] | undefined, locale: Locale): string[] {
  if (!outcomes || outcomes.length === 0) {
    return [];
  }
  return outcomes.map((outcome) => renderOutcome(match, outcome, locale));
}

export function renderCombatOutcomeLines(match: MatchState, entry: ActionLogEntry | undefined, locale: Locale): string[] {
  if (!entry?.outcomes || entry.outcomes.length === 0) {
    if (entry && entry.action.type === "UNDO_LAST_REVERSIBLE_ACTION") {
      const summary = entry.result.replace(/^ผู้เล่นย้อนกลับการกระทำ: /, "");
      return [t(locale, "log.undone", { summary })];
    }
    return entry ? [t(locale, "log.oldResult", { result: entry.result })] : [];
  }
  const played = entry.outcomes.find((outcome): outcome is Extract<EffectOutcome, { code: "CARD_PLAYED" }> => outcome.code === "CARD_PLAYED");
  const lines: string[] = [];
  if (played) {
    const actor = playerName(played.playerId, match.gameMode, locale);
    const targetName = played.targetInstanceId ? cardName(match, played.targetInstanceId, locale) : targetPlayerName(played.targetPlayerId, match.gameMode, locale);
    const targetOwner = played.targetPlayerId ? ownerSuffix(played.targetPlayerId, played.playerId, match.gameMode, locale) : "";
    const card = cardName(match, played.cardInstanceId, locale);
    const usesWord = t(locale, "log.uses");
    lines.push(targetName
      ? `${actor} ${usesWord} “${card}” ${actionLabel(played.actionKind, locale)} ${targetName}${targetOwner}`
      : `${actor} ${usesWord} “${card}”`);
    lines.push(resultLabel(played.effectResult, played.reasonCode, locale));
  }
  for (const outcome of entry.outcomes) {
    if (outcome.code === "CARD_PLAYED") continue;
    lines.push(renderOutcome(match, outcome, locale));
  }
  return lines;
}

export function formatActionLogEntry(match: MatchState, entry: ActionLogEntry | undefined, locale: Locale): string {
  if (!entry) {
    return t(locale, "log.noAction");
  }
  const header = t(locale, "log.header", { turn: entry.turnNumber, player: playerName(entry.actor, match.gameMode, locale) });
  const lines = renderCombatOutcomeLines(match, entry, locale);
  return `${header}\n${lines.length > 0 ? lines.join("\n") : entry.result}`;
}

export function summarizeOutcomes(match: MatchState, outcomes: EffectOutcome[] | undefined, locale: Locale): string {
  const lines = renderOutcomeLines(match, outcomes, locale);
  return lines.length > 0 ? lines.join("\n") : t(locale, "log.noDetails");
}

export function statusLabel(statusCode: StatusEffectCode, includeDuration = true): string {
  const meta = statusDisplayMeta[statusCode];
  return includeDuration ? `${meta.icon} ${meta.label} (${meta.duration})` : `${meta.icon} ${meta.label}`;
}

function renderOutcome(match: MatchState, outcome: EffectOutcome, locale: Locale): string {
  switch (outcome.code) {
    case "CARD_PLAYED":
      return renderCombatOutcomeLines(match, {
        seq: 0,
        action: { type: "PLAY_CARD", playerId: outcome.playerId, payload: { cardInstanceId: outcome.cardInstanceId } },
        phase: match.phase,
        turnNumber: match.turnNumber,
        actor: outcome.playerId,
        validation: { valid: true },
        result: "",
        outcomes: [outcome],
        rng: match.rng,
        timestamp: Date.now()
      }, locale)[0] ?? t(locale, "log.cardPlayedSuccess", { card: cardName(match, outcome.cardInstanceId, locale) });
    case "ANIMAL_ENTERED_BOARD":
      return t(locale, "log.animalEntered", { card: cardName(match, outcome.cardInstanceId, locale), slot: outcome.slotNo });
    case "CARD_ATTACHED":
      return t(locale, "log.cardAttached", { target: cardName(match, outcome.targetInstanceId, locale), source: cardName(match, outcome.sourceCardInstanceId, locale) });
    case "LEVEL_CHANGED":
      return t(locale, "log.levelChanged", { from: outcome.fromLevel, to: outcome.toLevel });
    case "STATUS_APPLIED":
      return t(locale, "log.statusApplied", { status: localizedStatusLabel(outcome.statusCode, locale) })
        + (outcome.expiresAt ? ` (${outcome.expiresAt})` : "");
    case "STATUS_REMOVED":
      return t(locale, "log.statusRemoved", { status: localizedStatusLabel(outcome.statusCode, locale, false) });
    case "CARD_MOVED":
      return t(locale, "log.cardMoved", { card: cardName(match, outcome.cardInstanceId, locale), from: outcome.fromZone, to: outcome.toZone });
    case "CARD_DRAWN":
      return t(locale, "log.cardDrawn", { player: playerName(outcome.playerId, match.gameMode, locale), count: outcome.count });
    case "SCORE_CHANGED":
      return t(locale, "log.scoreChanged", {
        player: playerName(outcome.playerId, match.gameMode, locale),
        from: outcome.fromScore,
        to: outcome.toScore,
        delta: `${outcome.amount > 0 ? "+" : ""}${outcome.amount}`
      });
    case "EVOLUTION_POINT_GAINED":
      return t(locale, "log.evolutionPoint", { current: outcome.current, required: outcome.required });
    case "EVOLVED":
      return t(locale, "log.evolved", { level: outcome.toLevel });
    case "REMOVAL_PREVENTED":
      return t(locale, "log.removalPrevented");
  }
}

function cardName(match: MatchState, instanceId: string, locale: Locale): string {
  const instance = match.cardsByInstanceId[instanceId];
  if (!instance) return instanceId;
  const definition = getCardDefinition(instance.definitionId);
  return getLocalizedCard(definition.card_id, locale).name;
}

function actionLabel(kind: Extract<EffectOutcome, { code: "CARD_PLAYED" }>["actionKind"], locale: Locale): string {
  switch (kind) {
    case "WEAKNESS":
      return t(locale, "log.action.weakness");
    case "SUPPORT":
      return t(locale, "log.action.support");
    case "PROTECT":
      return t(locale, "log.action.protect");
    case "STEAL_SCORE":
      return t(locale, "log.action.stealScore");
    case "RETURN_TO_HAND":
      return t(locale, "log.action.returnToHand");
    case "STATUS_CHANGE":
      return t(locale, "log.action.statusChange");
    case "REMOVE_FROM_BOARD":
      return t(locale, "log.action.removeFromBoard");
    case "DRAW_CARD":
      return t(locale, "log.action.drawCard");
    case "EVOLUTION":
      return t(locale, "log.action.evolution");
    case "PLAY_ANIMAL":
    case "SPECIAL":
    default:
      return t(locale, "log.action.default");
  }
}

function resultLabel(
  result: Extract<EffectOutcome, { code: "CARD_PLAYED" }>["effectResult"],
  reason: Extract<EffectOutcome, { code: "CARD_PLAYED" }>["reasonCode"],
  locale: Locale
): string {
  if (result === "PARTIAL_EFFECT") {
    return reason === "NON_MATCHING_WEAKNESS"
      ? t(locale, "log.result.partialOffTarget")
      : t(locale, "log.result.partial");
  }
  if (result === "PREVENTED") {
    return t(locale, "log.result.prevented");
  }
  if (result === "NO_EFFECT") {
    return t(locale, "log.result.noEffect");
  }
  return reason === "MATCHING_WEAKNESS" ? t(locale, "log.result.fullMatching") : t(locale, "log.result.full");
}

function targetPlayerName(playerId: PlayerId | undefined, gameMode: MatchState["gameMode"], locale: Locale): string {
  return playerId ? playerName(playerId, gameMode, locale) : "";
}

function ownerSuffix(targetPlayerId: PlayerId, actorId: PlayerId, gameMode: MatchState["gameMode"], locale: Locale): string {
  if (targetPlayerId === actorId) {
    return gameMode === "PVE_NORMAL" && actorId === "P1" ? t(locale, "log.owner.you") : t(locale, "log.owner.self");
  }
  return gameMode === "PVE_NORMAL" && targetPlayerId === "P1" ? t(locale, "log.owner.you") : t(locale, "log.owner.other", { player: playerName(targetPlayerId, gameMode, locale) });
}

function playerName(playerId: "P1" | "P2", gameMode: MatchState["gameMode"] = "LOCAL_PVP", locale: Locale = "th"): string {
  if (gameMode === "PVE_NORMAL") {
    return playerId === "P1" ? t(locale, "label.you") : t(locale, "label.computer");
  }
  return playerId === "P1" ? t(locale, "label.player1") : t(locale, "label.player2");
}
