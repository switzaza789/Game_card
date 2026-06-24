import rawCardsSeed from "../../cards_seed.json";
import { validateCardsSeed } from "./validation";

export const cardCatalog = validateCardsSeed(rawCardsSeed);
export const cardsSeed = cardCatalog.cards;

