export type CardCategory = "Animal" | "Support" | "Weakness" | "Special";

export type Phase = "READY" | "DRAW" | "SCORE" | "ACTION" | "END";

export type PregameStep = "STARTER_REVEAL" | "COMPLETE";

export type PlayerId = "P1" | "P2";

export type MatchStatus = "READY" | "ACTIVE" | "FINISHED";

export type GameMode = "LOCAL_PVP" | "PVE_NORMAL";

export type Zone = "DECK" | "HAND" | "BOARD" | "GRAVEYARD";

export type EffectTiming =
  | "ON_PLAY"
  | "PASSIVE"
  | "TRIGGER"
  | "ACTION"
  | "REACTION";

export type CardDefinition = {
  card_id: string;
  name_th: string;
  name_en: string;
  category: CardCategory;
  subtype: string;
  role: string;
  base_level: number | "";
  base_score: number | "";
  favorite_item: string;
  direct_weakness: string;
  timing: string;
  primary_effect: string;
  secondary_effect: string;
  duration: string;
  target: string;
  logic_key: string;
  max_copies: number;
  effect_model: {
    logic_key: string;
    timing: string;
    target: string;
    duration: string;
  };
};

export type CardInstance = {
  instanceId: string;
  definitionId: string;
  ownerId: PlayerId;
  zone: Zone;
  attachedToId?: string;
  increasedLevel?: boolean;
};

export type StatusEffectCode =
  | "SKIP_NEXT_SCORE"
  | "NEXT_SCORE_MINUS_1"
  | "TEMP_WEAKNESS_IMMUNITY"
  | "TEMP_LEVEL_DOWN_IMMUNITY"
  | "REMOVAL_SHIELD"
  | "UTILITY_LOCK";

export type StatusEffect = {
  code: StatusEffectCode;
  sourceInstanceId?: string;
  expiresAt:
    | "NEXT_SCORE"
    | "OPPONENT_NEXT_TURN_END"
    | "NEXT_UTILITY"
    | "UNTIL_USED"
    | "IMMEDIATE";
};

export type ScoreContributionState =
  | "scored"
  | "reduced"
  | "blocked"
  | "skipped"
  | "penalized";

export type ScoreComponentKind =
  | "base"
  | "level-bonus"
  | "support-bonus"
  | "special-bonus"
  | "status-bonus"
  | "penalty"
  | "reduction"
  | "blocked"
  | "skipped";

export type ScoreComponent = {
  kind: ScoreComponentKind;
  amount: number;
  sourceCardInstanceId?: string;
  sourceCardId?: string;
  statusCode?: StatusEffectCode;
  reasonCode?: string;
};

export type AnimalScoreContribution = {
  animalInstanceId: string;
  animalCardId: string;
  ownerId: PlayerId;
  slotIndex: number;
  state: ScoreContributionState;
  components: readonly ScoreComponent[];
  finalContribution: number;
  reasonCode?: string;
  statusCode?: StatusEffectCode;
};

export type TeamScoreAdjustment = {
  id: string;
  amount: number;
  reasonCode: "score-cap" | "score-floor" | "global-bonus" | "global-penalty";
  sourceCardInstanceId?: string;
  sourceCardId?: string;
  statusCode?: StatusEffectCode;
};

export type StructuredScoreResolution = {
  resolutionId: string;
  turnNumber: number;
  sequence: number;
  scoringPlayerId: PlayerId;
  scoreBefore: number;
  scoreAfter: number;
  totalGained: number;
  animalContributions: readonly AnimalScoreContribution[];
  teamAdjustments: readonly TeamScoreAdjustment[];
};

export type AnimalInstance = CardInstance & {
  zone: "BOARD";
  level: 1 | 2 | 3;
  evolutionPoints: 0 | 1 | 2;
  slotNo: 1 | 2 | 3;
  enteredTurn: number;
  attachedSupportIds: string[];
  statuses: StatusEffect[];
  onceFlags: string[];
};

export type PlayerState = {
  id: PlayerId;
  score: number;
  deck: string[];
  hand: string[];
  board: Array<string | null>;
  graveyard: string[];
  animalActionUsed: boolean;
  utilityActionUsed: boolean;
  utilityLocked: boolean;
  recycleUsed: boolean;
  mulligansUsed: number;
  turnsTaken: number;
};

export type MatchState = {
  matchId: string;
  gameMode: GameMode;
  status: MatchStatus;
  players: Record<PlayerId, PlayerState>;
  cardsByInstanceId: Record<string, CardInstance | AnimalInstance>;
  currentPlayerId: PlayerId;
  startingPlayerId: PlayerId;
  pregameStep: PregameStep;
  phase: Phase;
  turnNumber: number;
  targetScore: number;
  rng: RngState;
  winner?: PlayerId | "DRAW";
  finishReason?: "TARGET_SCORE" | "TURN_LIMIT";
  actionLog: ActionLogEntry[];
  undoSnapshot?: UndoSnapshot;
  lastScoreResolution?: StructuredScoreResolution;
};

export type UndoSnapshot = {
  state: Omit<MatchState, "undoSnapshot">;
  actor: PlayerId;
  summary: string;
  blockedReason?: string;
};

export type Target = {
  playerId: PlayerId;
  zone: "HAND" | "BOARD" | "GRAVEYARD" | "DECK" | "SCORE";
  instanceId?: string;
  slotNo?: 1 | 2 | 3;
};

export type Action =
  | {
      type: "START_MATCH";
      playerId: PlayerId;
      payload: { seed: string };
    }
  | {
      type: "MULLIGAN";
      playerId: PlayerId;
      payload: { cardInstanceIds: string[] };
    }
  | {
      type: "PLAY_CARD";
      playerId: PlayerId;
      payload: {
        cardInstanceId: string;
        target?: Target;
        reactionCardInstanceId?: string;
        replacementCardInstanceId?: string;
        selectedSupportInstanceId?: string;
        bottomCardInstanceId?: string;
        moveTopCardToBottom?: boolean;
      };
    }
  | {
      type: "RECYCLE";
      playerId: PlayerId;
      payload: { cardInstanceId: string };
    }
  | {
      type: "END_TURN";
      playerId: PlayerId;
      payload: Record<string, never>;
    }
  | {
      type: "ADVANCE_PHASE";
      playerId: PlayerId;
      payload: Record<string, never>;
    }
  | {
      type: "UNDO_LAST_REVERSIBLE_ACTION";
      playerId: PlayerId;
      payload: Record<string, never>;
    }
  | {
      type: "ACKNOWLEDGE_STARTER";
      playerId: PlayerId;
      payload: Record<string, never>;
    };

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

export type ActionEnvelope = {
  action: Action;
  timestamp: number;
};

export type RngState = {
  seed: string;
  step: number;
};

export type RngResult<T> = {
  value: T;
  rng: RngState;
};

export type ActionLogEntry = {
  seq: number;
  action: Action;
  phase: Phase;
  turnNumber: number;
  actor: PlayerId;
  validation: ValidationResult;
  result: string;
  outcomes?: EffectOutcome[];
  rng: RngState;
  timestamp: number;
};

export type EffectOutcome =
  | {
      code: "CARD_PLAYED";
      cardInstanceId: string;
      definitionId: string;
      playerId: PlayerId;
      targetInstanceId?: string;
      targetPlayerId?: PlayerId;
      actionKind?: "PLAY_ANIMAL" | "SUPPORT" | "WEAKNESS" | "PROTECT" | "STEAL_SCORE" | "STATUS_CHANGE" | "REMOVE_FROM_BOARD" | "RETURN_TO_HAND" | "DRAW_CARD" | "EVOLUTION" | "SPECIAL";
      effectResult?: "FULL_EFFECT" | "PARTIAL_EFFECT" | "NO_EFFECT" | "PREVENTED";
      reasonCode?: "MATCHING_WEAKNESS" | "NON_MATCHING_WEAKNESS" | "TARGET_PROTECTED" | "NO_VALID_TARGET";
    }
  | {
      code: "ANIMAL_ENTERED_BOARD";
      cardInstanceId: string;
      slotNo: 1 | 2 | 3;
    }
  | {
      code: "CARD_ATTACHED";
      sourceCardInstanceId: string;
      targetInstanceId: string;
    }
  | {
      code: "LEVEL_CHANGED";
      targetInstanceId: string;
      fromLevel: 1 | 2 | 3;
      toLevel: 1 | 2 | 3;
    }
  | {
      code: "STATUS_APPLIED";
      targetInstanceId: string;
      statusCode: StatusEffectCode;
      expiresAt: StatusEffect["expiresAt"];
    }
  | {
      code: "STATUS_REMOVED";
      targetInstanceId: string;
      statusCode: StatusEffectCode;
    }
  | {
      code: "CARD_MOVED";
      cardInstanceId: string;
      definitionId: string;
      fromZone: Zone;
      toZone: Zone;
    }
  | {
      code: "CARD_DRAWN";
      playerId: PlayerId;
      count: number;
    }
  | {
      code: "SCORE_CHANGED";
      playerId: PlayerId;
      amount: number;
      fromScore: number;
      toScore: number;
      resolution?: StructuredScoreResolution;
    }
  | {
      code: "EVOLUTION_POINT_GAINED";
      targetInstanceId: string;
      current: 1 | 2;
      required: 2;
    }
  | {
      code: "EVOLVED";
      targetInstanceId: string;
      fromLevel: 1 | 2;
      toLevel: 3;
    }
  | {
      code: "REMOVAL_PREVENTED";
      targetInstanceId: string;
      statusCode: "REMOVAL_SHIELD";
    };

export type GameConfig = {
  game_title: string;
  version: string;
  players: 2;
  deck_size: 24;
  starting_hand: 5;
  hand_limit: 7;
  animal_zone_slots: 3;
  target_score: number;
  max_turns_per_player: 12;
  level_min: 1;
  level_max: 3;
  first_player_draws_on_turn_1: false;
  guaranteed_animal_in_starting_hand: true;
  starting_mulligan_max: 2;
  animal_actions_per_turn: 1;
  utility_actions_per_turn: 1;
  recycle_per_turn: 1;
  recycle_allowed_on_first_turn: false;
  score_phase_before_action_phase: true;
  new_animal_scores_same_turn: false;
  turn_phases: Phase[];
  win_tiebreakers: string[];
};
