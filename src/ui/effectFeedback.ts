import type { EffectOutcome, MatchState, StatusEffectCode } from "../types/game";
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
      return `ใช้ “${cardName(match, outcome.cardInstanceId)}”${outcome.targetInstanceId ? ` กับ “${cardName(match, outcome.targetInstanceId)}”` : ""} เรียบร้อย`;
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
      return `${playerName(outcome.playerId)} คะแนน ${outcome.fromScore} → ${outcome.toScore} (${outcome.amount > 0 ? "+" : ""}${outcome.amount})`;
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

function playerName(playerId: "P1" | "P2"): string {
  return playerId === "P1" ? "ผู้เล่น 1" : "ผู้เล่น 2";
}
