import { cardsSeed } from "../../data/cardsSeed";
import type { CardInstance, GameMode, MatchState, PlayerId, PlayerState, RngState } from "../../types/game";
import { buildPlayerDeck } from "../cards/deck";
import { engineConfig } from "../config/config";
import { createRng, nextFloat } from "../rng/rng";

type CreateMatchOptions = {
  matchId?: string;
  seed: string;
  gameMode?: GameMode;
  startingPlayerId?: PlayerId;
};

const playerIds: PlayerId[] = ["P1", "P2"];

export function createMatch(options: CreateMatchOptions): MatchState {
  let rng = createRng(options.seed);
  const cardsByInstanceId: Record<string, CardInstance> = {};
  const players = {} as Record<PlayerId, PlayerState>;

  for (const playerId of playerIds) {
    const builtDeck = buildPlayerDeck(playerId, rng);
    rng = builtDeck.rng;

    Object.assign(cardsByInstanceId, builtDeck.cardsByInstanceId);
    players[playerId] = createPlayerState(playerId, builtDeck.deck);
  }

  let startingPlayerId: PlayerId;
  if (options.startingPlayerId) {
    startingPlayerId = options.startingPlayerId;
  } else {
    const starterRoll = nextFloat(rng);
    rng = starterRoll.rng;
    startingPlayerId = starterRoll.value < 0.5 ? "P1" : "P2";
  }

  const openingRemaining: Record<PlayerId, number> = { P1: engineConfig.starting_hand, P2: engineConfig.starting_hand };

  const state: MatchState = {
    matchId: options.matchId ?? `match-${options.seed}`,
    gameMode: options.gameMode ?? "LOCAL_PVP",
    status: "ACTIVE",
    players,
    cardsByInstanceId,
    currentPlayerId: startingPlayerId,
    startingPlayerId,
    pregameStep: "STARTER_REVEAL",
    openingDrawPlayerId: startingPlayerId,
    openingDrawRemaining: openingRemaining,
    phase: "READY",
    turnNumber: 1,
    targetScore: engineConfig.target_score,
    rng,
    actionLog: []
  };

  return state;
}

function createPlayerState(playerId: PlayerId, deck: string[]): PlayerState {
  return {
    id: playerId,
    score: 0,
    deck,
    hand: [],
    board: Array.from<string | null>({ length: engineConfig.animal_zone_slots }).fill(null),
    graveyard: [],
    animalActionUsed: false,
    utilityActionUsed: false,
    utilityLocked: false,
    recycleUsed: false,
    mulligansUsed: 0,
    turnsTaken: 0
  };
}



export function drawCards(state: MatchState, playerId: PlayerId, count: number): MatchState {
  let nextState = state;

  for (let drawIndex = 0; drawIndex < count; drawIndex += 1) {
    const player = nextState.players[playerId];
    const [drawnId, ...remainingDeck] = player.deck;

    if (!drawnId) {
      return nextState;
    }

    nextState = {
      ...nextState,
      players: {
        ...nextState.players,
        [playerId]: {
          ...player,
          deck: remainingDeck,
          hand: [...player.hand, drawnId]
        }
      },
      cardsByInstanceId: {
        ...nextState.cardsByInstanceId,
        [drawnId]: {
          ...nextState.cardsByInstanceId[drawnId],
          zone: "HAND"
        }
      }
    };
  }

  return nextState;
}



export function createCardDefinitionMap() {
  return Object.fromEntries(cardsSeed.map((card) => [card.card_id, card]));
}

export function cloneRng(rng: RngState): RngState {
  return { ...rng };
}
