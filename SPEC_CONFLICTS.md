# SPEC_CONFLICTS.md

## Status

Phase 0 audit complete. No card data mismatch was found between `cards_seed.json`, `Animal_Score_Card_Database_v0.3.xlsx`, and `prototype.sqlite`.

The conflicts below are documented before implementation. Logic affected by unresolved items must not be implemented until approved or avoided.

## Conflict 1 — Specification Folder Location

### Files

- Requested location: `docs/specification/`
- Actual files found at repository root:
  - `game_config.json`
  - `cards_seed.json`
  - `Animal_Score_Card_Database_v0.3.xlsx`
  - `prototype_schema.sql`
  - `prototype.sqlite`
  - `battle_wireframe.html`
  - `battle_wireframe.png`
  - `README_TH.txt`

### Conflict

The requested `docs/specification/` folder does not exist, but all expected files exist at the repository root.

### Options

- Keep files at root and document root as current Phase 0 source location.
- Move files into `docs/specification/`.
- Copy files into `docs/specification/` while leaving originals at root.

### Current Phase 0 Handling

Audited files from repository root. No files were moved.

## Conflict 2 — Source of Truth Wording

### Files

- `README_TH.txt`
- User instruction for this phase

### Conflict

`README_TH.txt` says `Animal_Score_Card_Database_v0.3.xlsx` is the source of truth for card data and references. The current instruction gives higher priority to `game_config.json` first and `cards_seed.json` second, with the workbook third.

### Options

- Use the current requested priority order for this prototype.
- Treat workbook as source of truth for card text only and JSON/config as source of truth for machine rules.
- Change priority order later by explicit instruction.

### Current Phase 0 Handling

Use the requested priority order:

1. `game_config.json`
2. `cards_seed.json`
3. `Animal_Score_Card_Database_v0.3.xlsx`
4. `README_TH.txt`
5. `battle_wireframe.html` and `battle_wireframe.png`

## Conflict 3 — Backend and Online Direction

### Files

- `README_TH.txt`
- Current prototype constraints

### Conflict

`README_TH.txt` recommends server match state, server validation, and eventually Online PvP. Current prototype constraints forbid Backend Server and Online PvP.

### Options

- Ignore server/online recommendations for this prototype and keep engine portable.
- Build only pure TypeScript engine boundaries that could move to a server later.
- Revisit server work in a future project after explicit approval.

### Current Phase 0 Handling

No backend or online features will be implemented. Architecture keeps the engine portable without adding a server.

## Conflict 4 — Match Status Enum

### Files

- `prototype_schema.sql`
- `Animal_Score_Card_Database_v0.3.xlsx`, sheet `DB Schema`

### Conflict

The workbook `DB Schema` sheet describes `matches.status` as `WAITING/ACTIVE/FINISHED`. The SQL schema allows `WAITING`, `ACTIVE`, `FINISHED`, and `ABORTED`.

### Options

- Include `ABORTED` in app state for abandoned local matches.
- Exclude `ABORTED` from prototype app state and keep it only as SQL reference.
- Ask game/product owner whether aborted matches need UI behavior.

### Current Phase 0 Handling

Do not implement match status logic in Phase 0. Defer decision to Phase 2 or Phase 5.

## Conflict 5 — Required `current_player_id`

### Files

- `prototype_schema.sql`
- `Animal_Score_Card_Database_v0.3.xlsx`, sheet `DB Schema`

### Conflict

The workbook says `matches.current_player_id` is required. The SQL schema defines it without `NOT NULL`.

### Options

- Allow `current_player_id` to be absent before a match becomes active.
- Require `current_player_id` for all initialized local matches.
- Model setup state separately from active match state.

### Current Phase 0 Handling

Do not implement match persistence or status state in Phase 0. Defer decision to Phase 2.

## Clarification Notes, Not Blocking Yet

- `score_persistence` appears in the workbook Game Rules sheet but not in `game_config.json`. Because `game_config.json` has higher priority and does not contradict it, treat this as a lower-priority rule detail needing confirmation before score-removal edge cases.
- The workbook says points persist when an Animal leaves the field. This should be confirmed before implementing removal effects that interact with accumulated score.

## Phase 3 Handling — Score Persistence

During Phase 3, accumulated player score is not reduced when Animals leave the board. This follows the workbook note that score persists and does not conflict with `game_config.json`, which has no contrary rule. No card effect reduces accumulated score except `X005 ขโมยอาหาร`, which explicitly transfers score.
