# TEST_PLAN.md

## Phase 0 — Specification Audit

No automated tests are required.

Manual checks completed or required:

- Confirm `game_config.json` parses.
- Confirm `cards_seed.json` parses.
- Confirm card count is 24.
- Confirm category counts are Animal 8, Support 6, Weakness 5, Special 5.
- Confirm all card ids are unique.
- Confirm all `logic_key` values are unique.
- Confirm total `max_copies` equals 24.
- Confirm Excel workbook sheets are readable.
- Confirm Excel card rows match `cards_seed.json`.
- Confirm SQLite `cards` rows match `cards_seed.json`.
- Confirm `prototype_schema.sql` is readable.
- Confirm wireframe HTML is readable.
- Confirm preview PNG exists and has valid dimensions.

## Phase 1 — Project Foundation

Automated tests:

- App renders without crashing.
- Config data validates against expected shape.
- Card seed data validates against expected shape.
- Forbidden categories or unknown card categories fail validation.

Checks:

- `npm run build`
- `npm test`
- `npm run lint`

## Phase 2 — Core Game Engine

Unit tests:

- Deterministic RNG produces stable results.
- Shuffle is deterministic for the same seed.
- Match initialization creates 2 players.
- Each player receives a 24-card deck before draw.
- Starting hand has 5 cards.
- Starting hand guarantee ensures at least 1 Animal.
- Mulligan does not exceed 2 cards.
- First player skips draw on turn 1.
- Turn phases follow config order.
- Animal slots enforce 3-slot limit.
- New animals do not score on the same turn.
- Score phase adds Animal level as score.
- Target score 15 wins.
- Turn limit 12 per player triggers tiebreak evaluation.

## Phase 3 — Card Effect Engine

Unit tests:

- Every `logic_key` in `cards_seed.json` has a resolver.
- Unknown `logic_key` fails.
- Support matching species increases level up to 3.
- Off-target Support effects do not increase level.
- Weakness direct-target effects reduce level or remove level 1 Animals.
- Weakness off-target effects apply next score minus 1.
- Special effects validate all preconditions.
- Reaction card cancels Weakness and applies utility lock.
- Status effects expire at the correct timing.
- Recycle uses the configured utility action resource.

## Phase 4 — Local Hot-seat UI

UI tests:

- Battle screen renders Thai UI labels.
- Active player's hand is visible.
- Opponent hand is hidden.
- Player switch screen hides both hands.
- Card detail opens for selected card.
- Graveyard view opens.
- Invalid actions show engine validation messages.
- End turn moves to privacy screen before next player.

Manual browser checks:

- Desktop layout.
- Mobile layout.
- Keyboard focus for primary controls.

## Phase 5 — Persistence and Match Results

Unit and UI tests:

- Save current match to Local Storage.
- Restore saved match after reload.
- Clear saved match.
- Invalid save version is handled safely.
- Match result screen shows winner and finish reason.
- Action log survives save and restore.

## Phase 6 — QA, Accessibility and Production Build

Final checks:

- Full unit test suite.
- Full UI test suite.
- Lint.
- Production build.
- Manual complete-match smoke test.
- Local Storage restore smoke test.
- Forbidden-scope scan.

