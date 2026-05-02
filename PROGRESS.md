# RogueEr — Development Progress

## Tech Stack
- **Client:** TypeScript + Phaser.js + Tauri
- **Server:** TypeScript + Colyseus
- **Shared:** TypeScript (hand evaluation, rule engine, constants)
- **Structure:** Monorepo — `client/`, `server/`, `shared/`

---

## Phase 1: Architecture & Design

### 1.1 Game State Machine
- [x] Define all game phases (deal, voting, flop, voting, turn, river, showdown)
- [x] Define transitions and conditions between phases
- [x] Define player action types per phase (bet, fold, check, raise, vote)
- [x] Document the full state machine diagram/spec
- **Status:** COMPLETE — see `docs/01-game-state-machine.md`

### 1.2 Rule Engine
- [x] Define rule representation format (data structure)
- [x] Define rule categories (Hierarchy, Card Property, Composition)
- [x] Define how rules mutate the hand evaluation hierarchy (3-stage pipeline)
- [x] Define voting mechanics (solidify, delete, replace + category binding)
- [x] Define rule slot system (3 slots, category-bound, randomization)
- [x] Define rule pool (~10 per category, 30 total for launch)
- **Status:** COMPLETE — see `docs/02-rule-engine.md`

### 1.3 Colyseus Room & Schema Design
- [x] Define room state schema (what clients see vs. what's server-only)
- [x] Define player schema (hand, chips, status, vote) + spectator schema
- [x] Define message types (client→server actions, server→client events)
- [x] Define room lifecycle (create, join, leave, reconnect)
- [x] Define lobby settings schema
- [x] Define spectator support (join mid-game, queue for seat, hole card delay)
- [x] Define room persistence (Redis snapshots + PostgreSQL for completed games)
- [x] Define action log / replay system (full logging, REST replay endpoint, DB schema)
- **Status:** COMPLETE — see `docs/03-colyseus-schema.md`

### 1.4 Project Scaffolding
- [x] Install pnpm, initialize monorepo with pnpm workspaces
- [x] Scaffold `shared/` with TypeScript (game types, constants)
- [x] Scaffold `server/` with Colyseus (v0.17.9, schema v4.0.20)
- [x] Scaffold `client/` with Phaser.js (v4) + Vite (v8) — Tauri deferred to Phase 5
- [x] Configure root tsconfig, per-package tsconfigs (experimentalDecorators, composite refs)
- [x] Verify: `pnpm build` compiles all 3 packages, server starts on ws://localhost:2567
- **Status:** COMPLETE

---

## Phase 2: Core Game Logic (shared/)

All code goes in `packages/shared/src/`. Must be deterministic, pure functions, no server/client dependencies.

### 2.1 Deck Management
- [x] Deck creation (52 cards)
- [x] Fisher-Yates shuffle (seeded RNG for reproducibility — mulberry32 PRNG)
- [x] Deal N cards from top of deck
- [x] Unit tests (15 tests)
- **Status:** COMPLETE — see `packages/shared/src/deck.ts`

### 2.2 Hand Evaluation Engine
- [x] Detect all 10 standard hand types from 7 cards (pick best 5)
- [x] Rank hands with proper tiebreaking (kickers)
- [x] Compare two evaluated hands to determine winner
- [x] determineWinners() for multi-player showdown (split pot support)
- [x] Unit tests for all hand types and edge cases (45 tests)
- **Status:** COMPLETE — see `packages/shared/src/hand-evaluator.ts`

### 2.3 Rule Engine Implementation
- [x] Define all 30 rules (10 per category) with apply() functions
- [x] Card transform pipeline (Card Property rules C01-C10)
- [x] Hand detection modification (Composition rules F01-F10)
- [x] Hierarchy reordering (Hierarchy rules H01-H10)
- [x] Rule conflict matrix (symmetric, prevents incompatible combos)
- [x] Rule-aware hand evaluation (4-stage pipeline: hierarchy → card transform → composition → evaluate)
- [x] Wild card solver (target-hand-type approach for C01, C09, C10)
- [x] Ace Splits support (C06: 2^N enumeration of ace interpretations)
- [x] Lucky Sevens two-pass evaluation (C10)
- [x] Rule pool management (getAvailableRules, pickRandomRules with seeded RNG)
- [x] DetectionConfig system for parameterized hand detectors
- [x] AnnotatedCard with source provenance (hole/community) for F04, F05, F09
- [x] three_card_flush HandType support (F06)
- [x] Full House Lite 2+2+1 pattern (F10)
- [x] Unit tests (56 tests: hierarchy, card-property, composition, pipeline integration)
- **Status:** COMPLETE — see `packages/shared/src/rule-engine.ts`, `packages/shared/src/rules/`

### 2.4 Pot Calculation
- [x] Main pot tracking
- [x] Side pot creation on all-in (multi-level side pots, rollover for all-folded levels)
- [x] Split pot logic for ties (odd chip distribution)
- [x] Pot distribution to winner(s) (callback-based getWinners for flexibility)
- [x] Unit tests (17 tests)
- **Status:** COMPLETE — see `packages/shared/src/pot.ts`

### 2.5 Betting Logic
- [x] Validate actions (fold, check, call, bet, raise, all-in)
- [x] Min/max raise calculations (tracks raise increment through multiple raises)
- [x] Betting round state (needsToAct model, round completion detection)
- [x] Blind & ante posting (heads-up + 3+ players, all-in edge cases)
- [x] Action order helpers (pre-flop UTG start, post-flop SB start)
- [x] All-in partial raise does not reopen action (standard Hold'em rule)
- [x] Round transition helpers (prepareNextRound, getContributions, getFoldedPlayerIds)
- [x] Unit tests (47 tests)
- **Status:** COMPLETE — see `packages/shared/src/betting.ts`

- **Status:** COMPLETE — 2.1–2.5 all done (180 total tests). Phase 2 shared game logic finished.

---

## Phase 3: Server Implementation (server/)

All code goes in `packages/server/src/`. Orchestrates shared game logic via Colyseus state sync. Existing scaffold: `index.ts` (server entry), `rooms/GameRoom.ts` (skeleton), `schema/GameState.ts` (3 fields).

### 3.1 Colyseus Schemas
- [x] Expand `GameState` with full fields from `docs/03-colyseus-schema.md` (phase, dealers, timers, collections)
- [x] `PlayerState` schema (sessionId, displayName, seatIndex, status, chips, currentBet, holeCards, vote)
- [x] `RuleSlotSchema`, `RuleInfoSchema`, `VotingStateSchema`, `VoteSchema`, `VoteResultSchema`
- [x] `SidePotSchema`, `LobbySettingsSchema`, `SpectatorSchema`, `CommunityCardSchema`, `CardSchema`
- [x] Per-client visibility via `@view()` + `StateView` (hole cards owner-only, votes tag-based)
- [x] `GameRoom.onJoin` wires up `StateView` per client (player vs spectator paths)
- [x] `GameRoom.onLeave` handles lobby removal vs in-game disconnect
- [x] Seat assignment, host assignment, spectator lifecycle
- **Status:** COMPLETE — see `packages/server/src/schema/GameState.ts`

### 3.2 Game Room & State Machine
- [x] Phase transition engine (14 phases, auto-advance for DEAL/FLOP/TURN/RIVER)
- [x] ROUND_START: rotate dealer, post blinds/antes (shared `postBlinds`), randomize rule slots (shared `pickRandomRules`)
- [x] DEAL: shuffle deck (shared `createDeck`/`shuffle`), deal hole cards
- [x] SHOWDOWN: evaluate hands with active rules (shared `evaluateWithRules`/`determineWinnersWithRules`)
- [x] ROUND_END: calculate pots (shared `calculatePots`/`distributePots`), award chips, eliminate players, check game-over
- [x] Skip betting phases when all but one active player is all-in
- **Target files:** `packages/server/src/rooms/GameRoom.ts`, `packages/server/src/rooms/PhaseEngine.ts`
- **Status:** COMPLETE

### 3.3 Betting Phase Handler
- [x] Route `player_action` messages to shared betting logic (`applyAction`, `getValidActions`)
- [x] Track `BettingRoundState` across the 4 betting phases, transition on round completion
- [x] Handle early exit (all but one folded → ROUND_END)
- [x] Use `prepareNextRound` between betting phases, `getContributions`/`getFoldedPlayerIds` for pot calc
- **Target file:** `packages/server/src/rooms/handlers/betting-handler.ts`
- **Status:** COMPLETE

### 3.4 Voting Phase Handler
- [x] Route `player_vote` messages, validate (non-folded, slot targetable, action valid)
- [x] Vote resolution algorithm: slot majority → action majority → replacement majority (per `docs/01-game-state-machine.md`)
- [x] Apply results: solidify/delete/replace rule slots using shared rule pool
- [ ] Vote visibility filtering (hidden/after_lock/live per lobby setting) — deferred, wiring stubbed
- **Target file:** `packages/server/src/rooms/handlers/voting-handler.ts`
- **Status:** COMPLETE (vote visibility cross-client wiring deferred)

### 3.5 Turn Timers
- [x] Player action timer (default 30s): auto-fold or auto-check on expiry
- [x] Voting phase timer (default 30s): auto-abstain on expiry
- [x] Round-end display delay (5s fixed)
- [x] Configurable durations from lobby settings
- **Target file:** integrated into GameRoom and handlers
- **Status:** COMPLETE

### 3.6 Lobby & Lifecycle
- [x] `onJoin`: assign seat, set host, handle spectators (queue for seat, hole card delay)
- [ ] `onLeave`: reconnect grace period (60s) — deferred, auto-fold on disconnect implemented
- [x] `onCreate`: initialize state, apply default lobby settings
- [x] Host `update_settings`, `start_game` (validate min players + all ready)
- [x] `player_ready` toggle
- **Target files:** `packages/server/src/rooms/GameRoom.ts`, `packages/server/src/rooms/handlers/lobby-handler.ts`
- **Status:** COMPLETE (reconnection grace period deferred)

- **Status:** COMPLETE — 3.1–3.6 all done. Full game loop operational. Two items deferred: vote visibility cross-client wiring, reconnection allowReconnection() grace period.

---

## Phase 4: Client Implementation (client/)

### 4.1 Network Layer + Boot Flow
- [x] `NetworkManager` singleton wrapping colyseus.js with `Events.EventEmitter` event bus
- [x] `getStateCallbacks()` proxy wiring for all schema fields, collections, and nested schemas
- [x] Typed event constants (`network/events.ts`)
- [x] `send*()` methods for all 6 client→server message types
- [x] Server broadcast handlers (phase_transition, showdown, round_end, vote_resolved, error)
- [x] BootScene with HTML name input + "Join Game" button → connects → transitions to LobbyScene
- **Status:** COMPLETE

### 4.2 Lobby Scene
- [x] Player list with name, ready indicator, host badge
- [x] Ready toggle button
- [x] Host-only settings panel (numeric +/-, toggles, cycle selectors)
- [x] Start Game button (host only, enabled when all ready + min players)
- [x] Phase transition listener → auto-start TableScene
- [x] Error toast display
- **Status:** COMPLETE

### 4.3 Table Scene Foundation
- [x] Table oval drawing with 6 seat positions (rotated so local player at bottom)
- [x] `PlayerInfo` per seat (name, chips, status badge, hole cards, bet amount, dealer/active indicators)
- [x] `CardRenderer` (text-based: 50x70 rect + value + suit symbol, face-down, empty slot)
- [x] Community card display (5 slots, revealed progressively)
- [x] Pot display, phase indicator, round number
- [x] Seat rotation system (`getVisualSeatIndex`)
- [x] State sync on scene start (existing players, community cards, pot, phase)
- **Status:** COMPLETE

### 4.4 Betting Controls + Timer
- [x] `BettingPanel` (Fold/Check/Call/Bet/Raise/All-In buttons, amount +/- controls, pot presets)
- [x] `TimerBar` (horizontal progress bar with green→yellow→red color transition)
- [x] Show only valid actions, auto-hide on phase transition
- [x] Timer syncs with server `timeRemaining`
- **Status:** COMPLETE

### 4.5 Voting UI + Rule Display
- [x] `RuleDisplay` persistent panel (top-right, 3 slots with category badge, rule name, state icon, hover tooltip)
- [x] `VotingPanel` center overlay (3 slot columns, action buttons, replacement options, lock vote button, timer, tally)
- [x] Auto-show on votingState.active, auto-hide on resolve
- [x] Vote result toast notification
- **Status:** COMPLETE

### 4.6 Showdown + Round End
- [x] Showdown: reveal all hole cards face-up, display hand type labels at seats
- [x] Round end: winner highlight with "+$X" floating chip award animation
- [x] Table reset on new round (clear cards, bets)
- [x] Phase transition to lobby on game over
- **Status:** COMPLETE

### 4.7 Polish + Edge Cases
- [x] `Toast` utility (error/info/success with auto-fade)
- [x] Phase indicator text (top-left, human-readable phase names)
- [x] Round number display
- [x] Player status badges (FOLDED, ALL IN, OUT, DC)
- [x] Settings read-only for non-host players (no +/- buttons)
- [ ] Spectator mode (join mid-game → no betting/voting panels)
- [ ] Disconnection overlay with reconnect button
- [ ] Side pot display
- **Status:** IN PROGRESS — core features complete, 3 items remaining

- **Status:** Phase 4 core COMPLETE — `pnpm build` passes. NetworkManager, LobbyScene, TableScene, BettingPanel, VotingPanel, RuleDisplay, ShowdownOverlay all implemented. 3 polish items deferred (spectator UI, disconnect overlay, side pot display).

---

## Phase 5: Integration & Polish
- [ ] End-to-end playtesting
- [ ] Tauri packaging for Steam
- [ ] Audio/SFX
- [ ] Visual polish and juice
- [ ] Steam store page and build upload
- **Status:** Not started

---

## Decisions Log
| Date | Decision | Reasoning |
|------|----------|-----------|
| 2026-04-15 | Simultaneous voting (rule + action together) | Keeps pace fast, more interesting info asymmetry |
| 2026-04-15 | 3 rule slots per round | Enough depth without overwhelming cognitive load |
| 2026-04-15 | Tauri over Electron | Near-native perf, tiny bundle, same web tech |
| 2026-04-15 | TypeScript + Phaser + Colyseus stack | Full-stack TypeScript allows shared logic across client and server |
| 2026-04-15 | Premium purchase model ($15-20) | Proven by Balatro/StS2, avoids gambling regulation issues |
| 2026-04-16 | Spectators included in MVP | Increases engagement, spectators can queue for seats |
| 2026-04-16 | Redis-backed room persistence | Crash recovery essential for real product |
| 2026-04-16 | Full action log + replay system | Dispute resolution, replay feature, analytics foundation |
| 2026-04-16 | PostgreSQL for completed game data | Long-term storage for replays, stats, player history |
| 2026-04-16 | Antes excluded from currentBet in betting module | Antes contribute to pot/totalBet but not currentBet — standard Hold'em: antes are forced contributions, not bets to match |
| 2026-04-16 | needsToAct model for betting rounds | Cleaner than tracking lastRaiser — partial all-in raises naturally handled by not reopening needsToAct |
| 2026-04-16 | Immutable betting state (applyAction returns new state) | Pure functions in shared/ — server holds the reference, each action produces a new snapshot |
| 2026-04-16 | PhaseEngine as separate class from GameRoom | Keeps GameRoom as a message router + state holder; PhaseEngine owns all 14-phase transition logic |
| 2026-04-16 | Vote resolution lives in GameRoom.resolveVotes() | 3-tier majority algorithm needs access to schema state and rule pool; handler only validates and stores votes |
| 2026-04-16 | Tie-on-replacement falls back to delete | Replace ties still produce a meaningful outcome (rule removed) rather than no-op |
| 2026-04-16 | Native setTimeout/setInterval for timers | No Colyseus clock dependency; clearTimers() called on every phase transition prevents stale callbacks |
| 2026-04-16 | Vote visibility cross-client wiring deferred | Mechanism (VIEW_TAG_VOTE StateView.add()) exists; triggering logic deferred to Phase 5 polish |
| 2026-04-16 | Reconnection grace period deferred | allowReconnection() not called; disconnect auto-folds; deferred to Phase 5 polish |
