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
- Reset active match and clear the active save.
- Invalid save version is handled safely.
- Corrupted JSON save is rejected and deleted safely.
- Storage unavailable or blocked access returns a safe storage error.
- Runtime validation rejects invalid match status, phase, player score, screen, and card definition ids.
- Runtime validation accepts attached Support cards as valid counted card locations.
- Match result screen shows winner and finish reason.
- Action log survives save and restore.
- Active match dispatch saves valid transitions.
- Invalid actions do not update statistics or save a changed state.
- Resume from saved `handoff` screen preserves hand privacy.
- Finished-match recovery saves result history and deletes active save.
- Finished-match recovery is idempotent and does not duplicate history.
- History save happens before active save deletion.
- Match history appends, lists, clears, deduplicates same results, reports conflicts for changed duplicate ids, and keeps the newest 100 entries.
- Export match log produces schema version 1 JSON with `savedAt`.
- Import match log uses the same runtime validator as stored saves.
- Import rejects corrupted JSON and unsupported schema versions.
- Result statistics track recycle count, board exits, Food Thief score contribution, Quick Swap voluntary swaps, and highest-scoring-card contribution.
- Quick Swap does not double-count returned-to-hand statistics.
- Highest-scoring-card tie-breaking is deterministic using replayable action-log order.
- UI tests cover continue saved game, reset game, import debug log, and local match history.

## Phase 6 — QA, Accessibility and Production Build

Final checks:

- Full unit test suite.
- Full UI test suite.
- Lint.
- Production build.
- Manual complete-match smoke test.
- Local Storage restore smoke test.
- Forbidden-scope scan.
- Coverage run.
- Dependency audit with moderate vulnerability threshold.
- Production engine scan for `Date.now()` and `new Date()`.
- Direct Local Storage scan outside `src/persistence` and tests.
- Clipboard export fallback test when `navigator.clipboard.writeText` fails.
- Import modal focus test.
- Handoff privacy resume regression test.
- Finished-match recovery, history, import, and export regression tests.
- Keyboard focus visibility review for buttons, hand cards, library cards, slots, and text areas.
- Modal dialog labels and focus behavior review.
- Desktop and mobile layout review for menu, battle, result, history, import, and export screens.
- Thai UI copy consistency review.

## Phase 7 — Deployment and Playtest Readiness

Automated checks:

- GitHub Pages production build base path is `/Game_card/`.
- Local development base path remains `/`.
- App result screen opens the Playtest feedback dialog.
- Playtest rating validation accepts integer values 1-5.
- Playtest rating validation rejects blank-invalid, below-range, above-range, and decimal values while allowing optional blank fields.
- Playtest feedback export contains schema version, application version, match id, playedAt, winner, final scores, turn count, duration, finish reason, recycle count, board exit count, highest scoring card, and optional feedback object.
- Playtest feedback export does not include prohibited personal-data fields such as names, emails, wallet addresses, IP addresses, or device fingerprints.
- Clipboard failure fallback remains functional for exported JSON.
- Existing save, resume, handoff privacy, finished-match recovery, history, import, export, engine, and UI regression tests remain passing.

Manual checks:

- GitHub Pages workflow uses official actions, minimum permissions, concurrency protection, `npm ci`, lint, tests, build, artifact upload, and Pages deploy.
- GitHub Pages public URL must be verified after activation from GitHub repository settings and a successful workflow run.
- Result and Playtest feedback modals remain keyboard usable without a mouse.
- Feedback form controls have visible labels and visible focus states.
- Narrow mobile widths do not overflow for Phase 7 modal additions.
- Thai deployment and playtest copy is consistent.
- Issue templates do not ask for passwords, private keys, seed phrases, wallet credentials, or sensitive personal information.
