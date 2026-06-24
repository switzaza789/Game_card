# ARCHITECTURE.md

## Goal

Build Animal Score Card Game — Prototype v0.3 as a local hot-seat browser game for 2 players using React, TypeScript, Vite, CSS or CSS Modules, Vitest, React Testing Library, ESLint, and Local Storage.

Phase 0 only proposes architecture. It does not create the React app or game engine.

## High-Level Architecture

```text
src/
  app/
    App.tsx
    routes-or-screens/
  ui/
    components/
    screens/
    styles/
  engine/
    config/
    cards/
    rng/
    state/
    actions/
    effects/
    validation/
    replay/
  persistence/
    localStorageAdapter.ts
  data/
    gameConfig.ts
    cardsSeed.ts
  test/
    fixtures/
```

## Boundaries

### Game Engine

The engine owns:

- Match initialization.
- Deck construction and deterministic shuffle.
- Turn phase progression.
- Score calculation.
- Action validation.
- Card effect resolution.
- Status effects.
- Recycle rules.
- Win and tiebreak evaluation.
- Action log generation.
- Replay-compatible action records.

The engine must not:

- Import React.
- Read or write Local Storage directly.
- Read DOM or browser UI state.
- Mutate existing state objects.
- Depend on timers, network, backend servers, or hidden globals.

### UI

The UI owns:

- Thai labels and user-facing messages.
- Local hot-seat flow.
- Hidden-hand transition screen between players.
- Card selection, target selection, and confirmation.
- Placeholder card visuals.
- Rendering action log and game state.
- Calling engine actions and displaying validation errors.

### Persistence

Persistence owns:

- Saving the current match snapshot to Local Storage.
- Loading or clearing saved local matches.
- Versioning persisted state.

Persistence must not resolve game rules.

## State Model Proposal

Core state should be serializable:

- `GameState`
- `PlayerState`
- `CardDefinition`
- `CardInstance`
- `BoardSlot`
- `StatusEffect`
- `TurnState`
- `ActionLogEntry`
- `PendingChoice`, if an effect needs player choice.

Use card instance ids for all in-match cards. Use card definition ids for static seed data.

## Action Model Proposal

Actions should be explicit and replayable:

- `START_MATCH`
- `MULLIGAN`
- `ADVANCE_PHASE`
- `PLAY_ANIMAL`
- `PLAY_SUPPORT`
- `PLAY_WEAKNESS`
- `PLAY_SPECIAL`
- `RECYCLE`
- `RESOLVE_CHOICE`
- `END_TURN`

Each action should include:

- Acting player id.
- Phase.
- Turn number.
- Payload.
- Validation result.
- Result summary.
- RNG seed state when randomness is consumed.

## Deterministic RNG

Use an injectable deterministic RNG interface:

```ts
type RngState = {
  seed: string;
  step: number;
};

type RngResult<T> = {
  value: T;
  rng: RngState;
};
```

All shuffle and random operations must accept and return RNG state.

## Validation Before Resolve

Each action should follow this flow:

1. Parse action.
2. Validate actor, phase, resources, card ownership, target legality, and active status effects.
3. Resolve effect using pure logic.
4. Produce next state and action log entry.
5. Evaluate score, win, and turn-limit conditions if relevant.

## Card Effect Engine

Card effects should map from `logic_key` in `cards_seed.json` to resolver functions. Unknown `logic_key` must fail validation and be logged as a development error, not guessed.

Resolvers should be small and composable:

- Target validation.
- Level adjustment.
- Support attachment or discard.
- Status application and expiration.
- Score modification.
- Bounce or removal.
- Utility lock.

## UI Proposal

Use `battle_wireframe.html` and `battle_wireframe.png` as layout references:

- Opponent hidden hand.
- Player visible hand.
- 3 animal slots per side.
- Deck and graveyard counters.
- Score display.
- Current phase display.
- Action log.
- Buttons for Recycle, Graveyard, Card Detail, End Turn.

Add a required hot-seat privacy screen between turns before showing the next player's hand.

## Local Storage Proposal

Persist:

- Schema version.
- Current `GameState`.
- Action log.
- Last saved timestamp.

Do not persist secrets, accounts, login, wallet, or online identifiers.

## Future Server Compatibility

The engine should be portable to a future server by keeping it pure and serializable. This prototype must not include a backend server.

