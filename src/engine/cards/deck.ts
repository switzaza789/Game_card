import { cardsSeed } from "../../data/cardsSeed";
import type { AnimalInstance, CardDefinition, CardInstance, PlayerId, RngState } from "../../types/game";
import { shuffle } from "../rng/rng";

export type BuiltDeck = {
  cardsByInstanceId: Record<string, CardInstance>;
  deck: string[];
  rng: RngState;
};

export function getCardDefinition(definitionId: string): CardDefinition {
  const definition = cardsSeed.find((card) => card.card_id === definitionId);

  if (!definition) {
    throw new Error(`Unknown card definition: ${definitionId}`);
  }

  return definition;
}

export function buildPlayerDeck(playerId: PlayerId, rng: RngState): BuiltDeck {
  const instances = cardsSeed.map<CardInstance>((card) => ({
    instanceId: `${playerId}-${card.card_id}-1`,
    definitionId: card.card_id,
    ownerId: playerId,
    zone: "DECK"
  }));

  const shuffled = shuffle(instances, rng);
  const cardsByInstanceId = Object.fromEntries(
    shuffled.value.map((card) => [card.instanceId, card])
  );

  return {
    cardsByInstanceId,
    deck: shuffled.value.map((card) => card.instanceId),
    rng: shuffled.rng
  };
}

export function isAnimalInstance(card: CardInstance | AnimalInstance): card is AnimalInstance {
  return card.zone === "BOARD" && "level" in card;
}

export function isAnimalDefinition(definitionId: string): boolean {
  return getCardDefinition(definitionId).category === "Animal";
}

