-- Animal Score Card Game Prototype v0.3
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cards (
    card_id TEXT PRIMARY KEY,
    name_th TEXT NOT NULL,
    name_en TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('Animal','Support','Weakness','Special')),
    subtype TEXT NOT NULL,
    role TEXT NOT NULL,
    base_level INTEGER,
    base_score INTEGER,
    favorite_item TEXT,
    direct_weakness TEXT,
    timing TEXT NOT NULL,
    primary_effect TEXT NOT NULL,
    secondary_effect TEXT,
    duration TEXT,
    target TEXT,
    logic_key TEXT NOT NULL UNIQUE,
    max_copies INTEGER NOT NULL DEFAULT 1,
    effect_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK(status IN ('WAITING','ACTIVE','FINISHED','ABORTED')),
    current_player_id TEXT,
    phase TEXT NOT NULL CHECK(phase IN ('READY','DRAW','SCORE','ACTION','END')),
    turn_no INTEGER NOT NULL DEFAULT 1,
    winner_player_id TEXT,
    finish_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS match_players (
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    seat_no INTEGER NOT NULL CHECK(seat_no IN (1,2)),
    score INTEGER NOT NULL DEFAULT 0 CHECK(score >= 0),
    utility_used INTEGER NOT NULL DEFAULT 0 CHECK(utility_used IN (0,1)),
    utility_locked INTEGER NOT NULL DEFAULT 0 CHECK(utility_locked IN (0,1)),
    turns_taken INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, player_id),
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_cards (
    instance_id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    owner_player_id TEXT NOT NULL,
    card_id TEXT NOT NULL,
    zone TEXT NOT NULL CHECK(zone IN ('DECK','HAND','BOARD','GRAVEYARD')),
    deck_order INTEGER,
    slot_no INTEGER CHECK(slot_no BETWEEN 1 AND 3),
    level INTEGER CHECK(level BETWEEN 1 AND 3),
    entered_board_turn INTEGER,
    state_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
    FOREIGN KEY (card_id) REFERENCES cards(card_id)
);

CREATE TABLE IF NOT EXISTS match_actions (
    match_id TEXT NOT NULL,
    seq_no INTEGER NOT NULL,
    player_id TEXT NOT NULL,
    turn_no INTEGER NOT NULL,
    phase TEXT NOT NULL,
    action_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (match_id, seq_no),
    FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_match_cards_zone
ON match_cards(match_id, owner_player_id, zone);

CREATE INDEX IF NOT EXISTS idx_match_actions_turn
ON match_actions(match_id, turn_no, seq_no);
