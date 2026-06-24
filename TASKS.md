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

Status: Completed in Phase 5.

### Tasks

- Save and load current match from Local Storage.
- Add new game, continue game, and clear saved game controls.
- Show match result summary.
- Preserve action log with saved game.
- Add version guard for persisted state.
- Add local match history.
- Add result summary stats for final score, turns, duration, recycle count, board exits, and highest scoring card.
- Add match log export/import for local debug.
- Handle corrupted or unsupported saved data safely.

### Files to Create or Edit

- `src/persistence/*`
- `src/ui/screens/*`
- `src/app/App.tsx`

### Acceptance Criteria

- Refreshing the browser can restore an active local match.
- Saved state remains serializable.
- Invalid persisted version is handled safely.
- Result screen shows winner and finish reason.
- Finished matches are moved into local match history and active saves are cleared.
- Imported match logs are runtime-validated before loading.
- No personal data, cloud storage, backend, login, or external database is added.

Phase 5 result:

- Local Storage adapter added for active match saves and match history.
- Runtime validation added for persisted match shape, schema version, card ownership, card locations, board slots, statuses, and card definition ids.
- Persistence coordinator added to save after valid transitions, recover finished active saves, and move completed matches into history.
- Match stats tracking added for recycle count, board exits, and highest scoring card.
- UI now supports continue saved game, clear save, reset active match, local match history, export match log JSON, and import match log JSON.
- Result screen now displays winner, final scores, turn count, duration, finish reason, recycle count, board exit counts, and highest scoring card.
- `npm run lint`, `npm test`, `npm run test:coverage`, and `npm run build` passed.

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

Status: Completed in Phase 6.

### Tasks

- Run full test suite.
- Run lint and production build.
- Verify keyboard-accessible core controls.
- Verify responsive layout.
- Review Thai copy.
- Check forbidden systems are absent.
- Document remaining known limitations.
- Verify complete local hot-seat flow through automated regression coverage and manual review.
- Verify active save, resume, handoff privacy, finished-match recovery, match history, import, and export.
- Move practical Phase 5 inline styles into `src/ui/styles/global.css`.
- Add Clipboard API fallback UI for match log export.
- Scan for direct Local Storage access outside persistence and tests.
- Scan production engine for `Date.now()` and `new Date()`.
- Run dependency audit.

### Files to Create or Edit

- Test files as needed.
- Documentation updates as needed.

### Acceptance Criteria

- Build succeeds.
- Tests pass.
- Lint passes.
- Core game can be completed locally by 2 players.
- No forbidden scope has been introduced.
- Production engine has no direct wall-clock calls.
- React UI uses persistence adapter instead of direct Local Storage access.
- Export remains usable when Clipboard API is unavailable or blocked.
- Keyboard focus is visible for core controls and modals move focus into their main input or close control.

Phase 6 result:

- QA regression checks completed for Phases 0–5.
- Accessibility improved with visible focus states, modal focus handling, dialog labels, and export/import text-area labels.
- Desktop/mobile responsive CSS reviewed and strengthened for result/history grids.
- Phase 5 inline styles were moved into the shared CSS layer where practical.
- Clipboard-blocked export now shows a JSON fallback modal.
- Forbidden-scope, direct Local Storage, production engine time calls, dependency, lint, test, coverage, build, and audit checks passed.
- Known limitations documented in `README_TH.txt`.

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

## Phase 7 — Deployment and Playtest Readiness

Status: Completed locally in Phase 7. Public GitHub Pages activation and URL verification remain pending until the workflow runs from `main`.

### Tasks

- Add GitHub Pages deployment workflow using official Pages actions.
- Configure Vite production base path for `/Game_card/`.
- Add Playtest feedback JSON export from the result screen.
- Add runtime validation for optional playtest feedback ratings.
- Add Thai playtest guide and playtest report template.
- Add GitHub issue templates for bug, playtest, and balance reports.
- Update README with deployment, Local Storage, export/import, and Phase 7 status.
- Verify Phase 7 UI additions for keyboard access, labels, disabled states, and narrow layouts.

### Files to Create or Edit

- `.github/workflows/deploy-pages.yml`
- `.github/ISSUE_TEMPLATE/*`
- `PLAYTEST_GUIDE_TH.md`
- `PLAYTEST_REPORT_TEMPLATE_TH.md`
- `vite.config.ts`
- `package.json`
- `README_TH.txt`
- `TASKS.md`
- `TEST_PLAN.md`
- `src/playtest/*`
- `src/app/App.tsx`
- `src/app/App.test.tsx`
- `src/ui/styles/global.css`

### Acceptance Criteria

- Deployment workflow runs `npm ci`, lint, tests, and build before deploying `dist`.
- Production build uses `/Game_card/` asset base while local dev uses `/`.
- Result screen can export local Playtest feedback JSON without network requests.
- Rating fields are optional and validated as integers from 1 to 5.
- Exported playtest JSON contains no names, emails, wallet addresses, IP addresses, device fingerprints, telemetry, or analytics fields.
- GitHub templates request reproduction steps, browser/viewport details, and optional match logs without requesting sensitive secrets.
- Documentation clearly distinguishes deployment configuration complete, GitHub Pages activation pending, and public deployment not yet verified.

### Tests Required

- Full Vitest suite.
- Production base path test.
- Playtest feedback validation tests.
- Result-screen feedback export UI tests.
- Clipboard fallback regression test.
- Existing save, resume, import, export, history, and engine tests.

### Out of Scope

- Public URL verification before GitHub Pages workflow runs.
- Backend submission of feedback.
- Analytics, telemetry, accounts, cloud storage, online PvP, AI, blockchain, NFT, wallet, marketplace, new cards, or balance changes.

### Suggested Git Checkpoint

`phase-7-playtest-release`
