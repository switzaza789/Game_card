# TASKS.md

## Phase 0 — Specification Audit

### Tasks

- Inspect all supplied specification files.
- Confirm source-of-truth priority.
- Compare card counts, card ids, categories, and key config values.
- Identify specification conflicts.
- Create project governance documents.
- Propose architecture without implementing features.

### Files to Create or Edit

- `AGENTS.md`
- `ARCHITECTURE.md`
- `TASKS.md`
- `ACCEPTANCE_CRITERIA.md`
- `SPEC_CONFLICTS.md`
- `TEST_PLAN.md`

### Acceptance Criteria

- All supplied specification files are listed as inspected or blocked.
- Conflicts are documented in `SPEC_CONFLICTS.md`.
- No React app is created.
- No game engine logic is written.
- No dependencies are installed.

### Tests Required

- Manual data audit of JSON, Excel, SQLite, SQL, README, HTML, and PNG.
- No automated tests required in Phase 0.

### Out of Scope

- React application setup.
- Game engine implementation.
- Card effect implementation.
- Dependency installation.
- UI implementation.

### Suggested Git Checkpoint

`phase-0-spec-audit`

## Phase 1 — Project Foundation

Status: Completed in Phase 1.

### Tasks

- Create React + TypeScript + Vite project foundation.
- Add Vitest, React Testing Library, and ESLint.
- Establish folder structure from `ARCHITECTURE.md`.
- Import config and card seed data as typed local data.
- Add minimal app shell with Thai UI placeholder.

### Files to Create or Edit

- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `eslint.config.*`
- `index.html`
- `src/main.tsx`
- `src/app/App.tsx`
- `src/data/*`
- `src/ui/*`

### Acceptance Criteria

- App starts locally in a browser.
- Build, test, and lint commands exist.
- No game logic beyond static loading and validation scaffolding.
- Forbidden systems are absent.

Phase 1 result:

- React + TypeScript + Vite foundation created.
- ESLint, Vitest, and React Testing Library configured.
- Strict TypeScript config enabled.
- Static config and card seed loaders added with runtime validation.
- Minimal Thai start shell renders game title, version, loaded card count, and disabled start button.
- `npm run lint`, `npm test`, and `npm run build` passed.

### Tests Required

- App renders smoke test.
- Seed data shape validation test.
- Config shape validation test.

### Out of Scope

- Full match flow.
- Card effect resolution.
- Persistence.

### Suggested Git Checkpoint

`phase-1-project-foundation`

## Phase 2 — Core Game Engine

Status: Completed in Phase 2.

### Tasks

- Define core game state types.
- Implement deterministic RNG and deck shuffle.
- Build 24-card deck per player from seed data.
- Implement starting hand draw, animal guarantee, and mulligan limit.
- Implement phase progression.
- Implement score phase baseline.
- Implement action log structure.
- Implement win detection and tiebreak scaffold.

### Files to Create or Edit

- `src/engine/state/*`
- `src/engine/rng/*`
- `src/engine/actions/*`
- `src/engine/validation/*`
- `src/engine/replay/*`
- `src/engine/config/*`
- `src/engine/cards/*`

### Acceptance Criteria

- Engine has no React imports.
- Engine functions return new state.
- Match setup is deterministic from seed.
- Turn phases follow config order.
- First player does not draw on turn 1.
- New animals do not score the same turn.

Phase 2 result:

- Core engine layer added under `src/engine/*`.
- Deterministic RNG and seeded shuffle implemented.
- Match creation builds 24-card decks per player and draws guaranteed Animal starting hands.
- Generic validated actions implemented for phase advance, mulligan, play card, recycle, and end turn.
- Generic placeholder utility handling added without card-specific effects.
- Score phase, hand limit, action limits, turn limit, win condition, and tiebreakers implemented.
- Action log entries are written for accepted and rejected transitions.
- Engine coverage exceeded 85% across statements, branches, functions, and lines.
- `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` passed.

### Tests Required

- Deterministic shuffle tests.
- Match initialization tests.
- Starting hand guarantee tests.
- Phase transition tests.
- Score phase tests.
- Turn limit and tiebreak tests where rules are clear.

### Out of Scope

- Detailed individual card effects.
- Full UI.
- Local Storage.

### Suggested Git Checkpoint

`phase-2-core-engine`

## Phase 3 — Card Effect Engine

Status: Completed in Phase 3.

### Tasks

- Map all 24 `logic_key` values to resolvers.
- Validate targets before resolving effects.
- Implement Support, Weakness, Special, and Animal triggered/passive effects.
- Implement status effects and expiration.
- Implement pending choices where effects need player decisions.
- Expand action logging for effect results.

### Files to Create or Edit

- `src/engine/effects/*`
- `src/engine/status/*`
- `src/engine/validation/*`
- `src/engine/actions/*`
- `src/test/fixtures/*`

### Acceptance Criteria

- Unknown `logic_key` fails clearly.
- Every card in `cards_seed.json` has covered behavior or approved deferral.
- Effects cannot resolve against illegal targets.
- Utility action limits and locks are enforced.
- Recycle consumes the correct action resource.

Phase 3 result:

- Card Effect Registry maps all 24 `logic_key` values.
- `validateEffect`, `resolveEffect`, `applyStatus`, and `removeExpiredStatus` responsibilities are separated.
- Animal, Support, Weakness, and Special card effects implemented from `cards_seed.json`.
- Weakness direct and off-target branches implemented.
- Status effects implemented for score skip, score minus, temporary immunity, removal shield, and utility lock.
- Weakness Shield reaction, Quick Swap, Monkey support return, and first-use protections covered by integration tests.
- Engine line, statement, and function coverage exceeded 90%; branch coverage passed the configured 85% threshold.
- `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` passed.

### Tests Required

- Resolver coverage test for every `logic_key`.
- Unit tests for each card effect.
- Status expiration tests.
- Invalid target validation tests.
- Recycle tests.

### Out of Scope

- Online play.
- AI.
- Backend validation server.

### Suggested Git Checkpoint

`phase-3-card-effects`

## Phase 4 — Local Hot-seat UI

Status: Completed in Phase 4.

### Tasks

- Build Thai battle screen based on wireframe.
- Render two player boards, deck counts, graveyard counts, scores, phase, action log, and current hand.
- Add hand privacy transition screen between players.
- Implement card selection and target selection.
- Display validation errors from the engine.
- Add graveyard and card detail views.

### Files to Create or Edit

- `src/ui/screens/*`
- `src/ui/components/*`
- `src/ui/styles/*`
- `src/app/App.tsx`

### Acceptance Criteria

- Only active player's hand is visible.
- Opponent hand is hidden.
- UI text is Thai.
- Placeholder art is acceptable.
- Layout works on desktop and mobile widths.

Phase 4 result:

- Main Menu, How to Play, Card Library, Battle Screen, Player Handoff Privacy Screen, Card Detail Modal, Graveyard Modal, and Match Result Screen implemented.
- Battle screen renders current player, turn, phase, scores, deck counts, opponent hand count, current hand, Animal zones, levels, supports, statuses, graveyard counts, utility status, Recycle, End Turn, and Action Log.
- Card selection, target selection, invalid target disabling, validation messages, important-card confirmation, Weakness Shield reaction prompt, Recycle, and handoff privacy flow implemented.
- UI tests cover start game, handoff screen, playing Animal, Support, Weakness, Recycle, End Turn, card library/modal, and result display.
- `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` passed.
- Screenshot automation was attempted but blocked because no browser automation tool or Chrome/Edge executable was available in the environment.

### Tests Required

- UI smoke tests.
- Active hand visibility tests.
- Hot-seat transition tests.
- Action button availability tests.
- Validation error display tests.

### Out of Scope

- Complex animation.
- Online PvP.
- Login.

### Suggested Git Checkpoint

`phase-4-hot-seat-ui`

## Phase 5 — Persistence and Match Results

### Tasks

- Save and load current match from Local Storage.
- Add new game, continue game, and clear saved game controls.
- Show match result summary.
- Preserve action log with saved game.
- Add version guard for persisted state.

### Files to Create or Edit

- `src/persistence/*`
- `src/ui/screens/*`
- `src/app/App.tsx`

### Acceptance Criteria

- Refreshing the browser can restore an active local match.
- Saved state remains serializable.
- Invalid persisted version is handled safely.
- Result screen shows winner and finish reason.

### Tests Required

- Local Storage adapter tests.
- Restore match tests.
- Clear save tests.
- Result screen tests.

### Out of Scope

- Backend storage.
- Accounts.
- Cloud sync.

### Suggested Git Checkpoint

`phase-5-persistence-results`

## Phase 6 — QA, Accessibility and Production Build

### Tasks

- Run full test suite.
- Run lint and production build.
- Verify keyboard-accessible core controls.
- Verify responsive layout.
- Review Thai copy.
- Check forbidden systems are absent.
- Document remaining known limitations.

### Files to Create or Edit

- Test files as needed.
- Documentation updates as needed.

### Acceptance Criteria

- Build succeeds.
- Tests pass.
- Lint passes.
- Core game can be completed locally by 2 players.
- No forbidden scope has been introduced.

### Tests Required

- Full Vitest suite.
- React Testing Library suite.
- Manual browser smoke test.
- Local Storage restore smoke test.

### Out of Scope

- New gameplay systems.
- New card sets.
- Network features.

### Suggested Git Checkpoint

`phase-6-qa-production-build`
