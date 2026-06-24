# ACCEPTANCE_CRITERIA.md

## Global Acceptance Criteria

- Game is local hot-seat for exactly 2 players.
- Deck size is 24 cards per player.
- Card composition is Animal 8, Support 6, Weakness 5, Special 5.
- Starting hand size is 5.
- Hand limit is 7.
- Animal zone has 3 slots per player.
- Target score is 15.
- Animal levels are 1 to 3.
- Turn limit is 12 turns per player.
- Turn phases follow `READY`, `DRAW`, `SCORE`, `ACTION`, `END`.
- First player does not draw on turn 1.
- New animals do not score the same turn.
- Recycle exists and follows the configured action limits.
- UI is Thai.
- Active player's hand is hidden during player switch.
- Engine is separate from React.
- Engine supports deterministic RNG.
- Engine uses validation before effect resolution.
- Engine writes action logs suitable for future replay.
- Local Storage is used only for temporary local game saves.
- Forbidden systems are absent.

## Phase 0 Acceptance

- Specification files are audited.
- Governance files are created.
- Architecture is proposed.
- Conflicts are documented.
- No implementation starts.

## Phase 1 Acceptance

- React + TypeScript + Vite foundation exists.
- Vitest, React Testing Library, and ESLint are configured.
- Static seed/config loading has tests.
- App shell renders.

## Phase 2 Acceptance

- Core engine initializes deterministic matches.
- Decks, hands, phases, scoring, action limits, and win checks work where rules are clear.
- Engine unit tests cover core rules.

## Phase 3 Acceptance

- All card `logic_key` values are mapped or explicitly blocked by approved conflicts.
- Card effects validate targets and resources before resolution.
- Status effects and durations are tested.

## Phase 4 Acceptance

- Hot-seat UI supports local play actions.
- Opponent hand remains hidden.
- Player switch screen prevents accidental hand reveal.
- Wireframe structure is respected.

## Phase 5 Acceptance

- Match can be saved, restored, and cleared from Local Storage.
- Result screen explains winner and finish reason.

## Phase 6 Acceptance

- Full test suite passes.
- Lint passes.
- Production build succeeds.
- Manual local browser smoke test passes.

