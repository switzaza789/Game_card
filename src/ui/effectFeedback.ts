import type { ActionLogEntry, EffectOutcome, MatchState, PlayerId, StatusEffectCode } from "../types/game";
import { getCardDefinition } from "../engine/cards/deck";

export type StatusDisplayMeta = {
  label: string;
  description: string;
  duration: string;
  icon: string;
  tone: "beneficial" | "harmful" | "neutral";
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

export function renderOutcomeLines(match: MatchState, outcomes: EffectOutcome[] | undefined): string[] {
  if (!outcomes || outcomes.length === 0) {
    return [];
  }
  return outcomes.map((outcome) => renderOutcome(match, outcome));
}

export function renderCombatOutcomeLines(match: MatchState, entry: ActionLogEntry | undefined): string[] {
  if (!entry?.outcomes || entry.outcomes.length === 0) {
    return entry ? [`ผลลัพธ์เก่า: ${entry.result}`] : [];
  }
  const played = entry.outcomes.find((outcome): outcome is Extract<EffectOutcome, { code: "CARD_PLAYED" }> => outcome.code === "CARD_PLAYED");
  const lines: string[] = [];
  if (played) {
    const actor = playerName(played.playerId, match.gameMode);
    const targetName = played.targetInstanceId ? cardName(match, played.targetInstanceId) : targetPlayerName(played.targetPlayerId, match.gameMode);
    const targetOwner = played.targetPlayerId ? ownerSuffix(played.targetPlayerId, played.playerId, match.gameMode) : "";
    lines.push(`${actor} ใช้ “${cardName(match, played.cardInstanceId)}”${targetName ? ` ${actionLabel(played.actionKind)} ${targetName}${targetOwner}` : ""}`);
    lines.push(resultLabel(played.effectResult, played.reasonCode));
  }
  for (const outcome of entry.outcomes) {
    if (outcome.code === "CARD_PLAYED") continue;
    lines.push(renderOutcome(match, outcome));
  }
  return lines;
}

export function formatActionLogEntry(match: MatchState, entry: ActionLogEntry | undefined): string {
  if (!entry) {
    return "ยังไม่มี action";
  }
  const header = `เทิร์น ${entry.turnNumber} · ${playerName(entry.actor, match.gameMode)}`;
  const lines = renderCombatOutcomeLines(match, entry);
  return `${header}\n${lines.length > 0 ? lines.join("\n") : entry.result}`;
}

export function summarizeOutcomes(match: MatchState, outcomes: EffectOutcome[] | undefined): string {
  const lines = renderOutcomeLines(match, outcomes);
  return lines.length > 0 ? lines.join("\n") : "ผลลัพธ์เก่า: ไม่มีรายละเอียดเพิ่มเติม";
}

export function statusLabel(statusCode: StatusEffectCode, includeDuration = true): string {
  const meta = statusDisplayMeta[statusCode];
  return includeDuration ? `${meta.icon} ${meta.label} (${meta.duration})` : `${meta.icon} ${meta.label}`;
}

function renderOutcome(match: MatchState, outcome: EffectOutcome): string {
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
      })[0] ?? `ใช้ “${cardName(match, outcome.cardInstanceId)}” เรียบร้อย`;
    case "ANIMAL_ENTERED_BOARD":
      return `“${cardName(match, outcome.cardInstanceId)}” ลงสนามช่อง ${outcome.slotNo}`;
    case "CARD_ATTACHED":
      return `“${cardName(match, outcome.targetInstanceId)}” ได้รับ “${cardName(match, outcome.sourceCardInstanceId)}”`;
    case "LEVEL_CHANGED":
      return `Level ${outcome.fromLevel} → Level ${outcome.toLevel}`;
    case "STATUS_APPLIED":
      return `ได้รับ${statusLabel(outcome.statusCode)}`
        + (outcome.expiresAt ? ` (${outcome.expiresAt})` : "");
    case "STATUS_REMOVED":
      return `นำสถานะ${statusLabel(outcome.statusCode, false)}ออก`;
    case "CARD_MOVED":
      return `“${cardName(match, outcome.cardInstanceId)}” ย้ายจาก ${outcome.fromZone} ไป ${outcome.toZone}`;
    case "CARD_DRAWN":
      return `${playerName(outcome.playerId)} จั่ว ${outcome.count} ใบ`;
    case "SCORE_CHANGED":
      return `${playerName(outcome.playerId, match.gameMode)} คะแนน ${outcome.fromScore} → ${outcome.toScore} (${outcome.amount > 0 ? "+" : ""}${outcome.amount})`;
    case "EVOLUTION_POINT_GAINED":
      return `ได้แต้มวิวัฒนาการ ${outcome.current}/${outcome.required}`;
    case "EVOLVED":
      return `วิวัฒนาการเป็น Level ${outcome.toLevel}`;
    case "REMOVAL_PREVENTED":
      return `โล่ป้องกันการนำออกทำงาน`;
  }
}

function cardName(match: MatchState, instanceId: string): string {
  const instance = match.cardsByInstanceId[instanceId];
  return instance ? getCardDefinition(instance.definitionId).name_th : instanceId;
}

function actionLabel(kind: Extract<EffectOutcome, { code: "CARD_PLAYED" }>["actionKind"]): string {
  switch (kind) {
    case "WEAKNESS":
      return "ใช้จุดอ่อนใส่";
    case "SUPPORT":
      return "สนับสนุน";
    case "PROTECT":
      return "ป้องกัน";
    case "STEAL_SCORE":
      return "ขโมยคะแนนจาก";
    case "RETURN_TO_HAND":
      return "ส่งกลับขึ้นมือ";
    case "STATUS_CHANGE":
      return "เปลี่ยนสถานะ";
    case "REMOVE_FROM_BOARD":
      return "นำออกจากสนาม";
    case "DRAW_CARD":
      return "จั่วการ์ด";
    case "EVOLUTION":
      return "วิวัฒนาการ";
    case "PLAY_ANIMAL":
    case "SPECIAL":
    default:
      return "กับ";
  }
}

function resultLabel(
  result: Extract<EffectOutcome, { code: "CARD_PLAYED" }>["effectResult"],
  reason: Extract<EffectOutcome, { code: "CARD_PLAYED" }>["reasonCode"]
): string {
  if (result === "PARTIAL_EFFECT") {
    return reason === "NON_MATCHING_WEAKNESS"
      ? "ผลอ่อน: ใช้ผิดเป้าหมาย ลดคะแนนครั้งถัดไป 1 คะแนน"
      : "ผลอ่อน: เกิดผลบางส่วน";
  }
  if (result === "PREVENTED") {
    return "ผลถูกป้องกัน";
  }
  if (result === "NO_EFFECT") {
    return "ไม่มีเป้าหมายที่ใช้ได้ จึงไม่เกิดผล";
  }
  return reason === "MATCHING_WEAKNESS" ? "ผลเต็ม: ใช้ตรงกับสัตว์ที่แพ้ทาง" : "ผลเต็ม";
}

function targetPlayerName(playerId: PlayerId | undefined, gameMode: MatchState["gameMode"]): string {
  return playerId ? playerName(playerId, gameMode) : "";
}

function ownerSuffix(targetPlayerId: PlayerId, actorId: PlayerId, gameMode: MatchState["gameMode"]): string {
  if (targetPlayerId === actorId) {
    return gameMode === "PVE_NORMAL" && actorId === "P1" ? "ของคุณ" : "ของตัวเอง";
  }
  return gameMode === "PVE_NORMAL" && targetPlayerId === "P1" ? "ของคุณ" : `ของ${playerName(targetPlayerId, gameMode)}`;
}

function playerName(playerId: "P1" | "P2", gameMode: MatchState["gameMode"] = "LOCAL_PVP"): string {
  if (gameMode === "PVE_NORMAL") {
    return playerId === "P1" ? "คุณ" : "Bot";
  }
  return playerId === "P1" ? "ผู้เล่น 1" : "ผู้เล่น 2";
}
