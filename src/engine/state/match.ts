import { cardsSeed } from "../../data/cardsSeed";
import type { CardInstance, GameMode, MatchState, PlayerId, PlayerState, RngState } from "../../types/game";
import { buildPlayerDeck, isAnimalDefinition } from "../cards/deck";
import { engineConfig } from "../config/config";
import { createRng } from "../rng/rng";

type CreateMatchOptions = {
  matchId?: string;
  seed: string;
  gameMode?: GameMode;
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

  let state: MatchState = {
    matchId: options.matchId ?? `match-${options.seed}`,
    gameMode: options.gameMode ?? "LOCAL_PVP",
    status: "ACTIVE",
    players,
    cardsByInstanceId,
    currentPlayerId: "P1",
    phase: "READY",
    turnNumber: 1,
    targetScore: engineConfig.target_score,
    rng,
    actionLog: []
  };

  state = drawStartingHands(state);
  return ensureStartingAnimalHands(state);
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

function drawStartingHands(state: MatchState): MatchState {
  return playerIds.reduce(
    (nextState, playerId) => drawCards(nextState, playerId, engineConfig.starting_hand),
    state
  );
}

function ensureStartingAnimalHands(state: MatchState): MatchState {
  return playerIds.reduce((nextState, playerId) => {
    if (hasAnimalInHand(nextState, playerId)) {
      return nextState;
    }

    return swapTopDeckAnimalIntoHand(nextState, playerId);
  }, state);
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

function hasAnimalInHand(state: MatchState, playerId: PlayerId): boolean {
  return state.players[playerId].hand.some((instanceId) =>
    isAnimalDefinition(state.cardsByInstanceId[instanceId].definitionId)
  );
}

function swapTopDeckAnimalIntoHand(state: MatchState, playerId: PlayerId): MatchState {
  const player = state.players[playerId];
  const animalDeckIndex = player.deck.findIndex((instanceId) =>
    isAnimalDefinition(state.cardsByInstanceId[instanceId].definitionId)
  );

  if (animalDeckIndex < 0 || player.hand.length === 0) {
    return state;
  }

  const firstHandId = player.hand[0];
  const animalId = player.deck[animalDeckIndex];
  const nextDeck = [...player.deck];
  const nextHand = [...player.hand];

  nextHand[0] = animalId;
  nextDeck[animalDeckIndex] = firstHandId;

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        deck: nextDeck,
        hand: nextHand
      }
    },
    cardsByInstanceId: {
      ...state.cardsByInstanceId,
      [firstHandId]: {
        ...state.cardsByInstanceId[firstHandId],
        zone: "DECK"
      },
      [animalId]: {
        ...state.cardsByInstanceId[animalId],
        zone: "HAND"
      }
    }
  };
}

export function createCardDefinitionMap() {
  return Object.fromEntries(cardsSeed.map((card) => [card.card_id, card]));
}

export function cloneRng(rng: RngState): RngState {
  return { ...rng };
}
