# AGENTS.md

## Project

Animal Score Card Game — Prototype v0.3

Local hot-seat web browser card game for 2 players. The prototype must stay offline and local-only.

## Repository Structure

Current Phase 0 structure:

- `game_config.json` — highest-priority machine-readable game rules.
- `cards_seed.json` — second-priority card seed data.
- `Animal_Score_Card_Database_v0.3.xlsx` — third-priority workbook reference.
- `README_TH.txt` — fourth-priority delivery/readme reference.
- `battle_wireframe.html` — fifth-priority UI wireframe reference.
- `battle_wireframe.png` — fifth-priority UI preview reference.
- `prototype_schema.sql` — SQLite schema reference.
- `prototype.sqlite` — SQLite prototype database with seeded cards.
- `AGENTS.md` — project agent instructions.
- `ARCHITECTURE.md` — proposed technical architecture.
- `TASKS.md` — phased implementation plan.
- `ACCEPTANCE_CRITERIA.md` — acceptance criteria by phase.
- `SPEC_CONFLICTS.md` — specification conflicts and decisions needed.
- `TEST_PLAN.md` — test strategy and required coverage.

Requested but currently missing source folder:

- `docs/specification/`

The supplied specification files currently exist at repository root. Do not move them without explicit approval.

## Source of Truth Priority

Use this order when sources disagree:

1. `game_config.json`
2. `cards_seed.json`
3. `Animal_Score_Card_Database_v0.3.xlsx`
4. `README_TH.txt`
5. `battle_wireframe.html` and `battle_wireframe.png`

If a rule conflict affects implementation, document it in `SPEC_CONFLICTS.md` and wait for approval before writing that logic.

## Commands

No React/Vite project exists in Phase 0.

Planned commands after Phase 1 creates the app:

- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Dev server: `npm run dev`

Do not install dependencies during Phase 0.

## Coding Conventions

- Use TypeScript for all production code after Phase 1.
- Keep the game engine separate from React UI.
- Prefer pure functions in the engine.
- Never mutate game state directly; return the next state plus action log entries.
- Use deterministic random number generation for shuffle and draw setup.
- Validate every action before resolving card effects.
- Keep Thai UI copy in UI-facing layers, not embedded inside core logic when avoidable.
- Use placeholder card art only for this prototype.
- Avoid unnecessary dependencies.

## Forbidden Scope

Do not add:

- NFT
- Blockchain
- BNB Chain
- Wallet
- Token
- Marketplace
- Login
- Online PvP
- Backend Server
- AI
- Card Pack
- Rarity
- Real-money payment
- Complex animation

## Rule Change Policy

Do not change game rules without explicit instruction. If the rules are unclear or contradictory, update `SPEC_CONFLICTS.md` and stop before implementing the affected logic.

## Definition of Done

For each phase:

- Scope matches `TASKS.md`.
- Acceptance criteria in `ACCEPTANCE_CRITERIA.md` are satisfied.
- Required tests in `TEST_PLAN.md` pass or blocked tests are documented.
- No forbidden systems are introduced.
- Specification conflicts are either avoided or explicitly approved.
- Work summary includes changed files and verification performed.

## Phase Report Format

After each phase, report:

- What was completed.
- Files created or changed.
- Specification conflicts found or resolved.
- Tests and checks run.
- Known risks.
- Suggested git checkpoint.

