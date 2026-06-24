export type CardCategory = "Animal" | "Support" | "Weakness" | "Special";

export type Phase = "READY" | "DRAW" | "SCORE" | "ACTION" | "END";

export type PlayerId = "P1" | "P2";

export type MatchStatus = "READY" | "ACTIVE" | "FINISHED";

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

export type AnimalInstance = CardInstance & {
  zone: "BOARD";
  level: 1 | 2 | 3;
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
  status: MatchStatus;
  players: Record<PlayerId, PlayerState>;
  cardsByInstanceId: Record<string, CardInstance | AnimalInstance>;
  currentPlayerId: PlayerId;
  phase: Phase;
  turnNumber: number;
  rng: RngState;
  winner?: PlayerId | "DRAW";
  finishReason?: "TARGET_SCORE" | "TURN_LIMIT";
  actionLog: ActionLogEntry[];
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
  rng: RngState;
  timestamp: number;
};

export type GameConfig = {
  game_title: string;
  version: string;
  players: 2;
  deck_size: 24;
  starting_hand: 5;
  hand_limit: 7;
  animal_zone_slots: 3;
  target_score: 15;
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
