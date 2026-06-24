import rawGameConfig from "../../game_config.json";
import { validateGameConfig } from "./validation";

export const gameConfig = validateGameConfig(rawGameConfig);

