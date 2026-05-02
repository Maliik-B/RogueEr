# 1.3 — Colyseus Room & Schema Design

## Architecture Principle

**Server is authoritative.** The server holds the complete game state — deck order, all hole cards, RNG seeds, vote tallies. Clients receive only what they're allowed to see. Clients send **actions** (intents), the server validates and applies them, and Colyseus auto-syncs the resulting state delta to all clients.

---

## State Schemas

Colyseus uses `@type()` decorators for auto-serialization and `@filter()` for per-client visibility control.

### RoomState (top-level)

```typescript
class RoomState extends Schema {
  @type("string")       phase: GamePhase;          // "lobby" | "round_start" | "deal" | "pre_flop_bet" | etc.
  @type("uint16")       roundNumber: number;
  @type("uint8")        dealerSeatIndex: number;
  @type("uint8")        activeSeatIndex: number;   // whose turn it is (betting phases)
  @type("uint32")       pot: number;
  @type("uint32")       currentBet: number;        // highest bet in current betting round
  @type("uint16")       timeRemaining: number;     // seconds left on current timer

  @type([CommunityCard]) communityCards: ArraySchema<CommunityCard>;
  @type([SidePot])       sidePots: ArraySchema<SidePot>;
  @type({ map: Player }) players: MapSchema<Player>;   // keyed by sessionId
  @type([RuleSlot])      ruleSlots: ArraySchema<RuleSlot>;
  @type(VotingState)     votingState: VotingState;
  @type(LobbySettings)   settings: LobbySettings;
}
```

### Player

```typescript
class Player extends Schema {
  @type("string")   sessionId: string;
  @type("string")   displayName: string;
  @type("uint8")    seatIndex: number;
  @type("uint32")   chips: number;
  @type("uint32")   currentBet: number;          // this player's bet in current round
  @type("string")   status: PlayerStatus;         // "waiting" | "acting" | "folded" | "all_in" | "eliminated" | "disconnected"
  @type("boolean")  isReady: boolean;             // lobby phase only
  @type("boolean")  isHost: boolean;

  // FILTERED — only the owning client receives their hole cards
  @filter(function(this: Player, client: Client) {
    return client.sessionId === this.sessionId;
  })
  @type([Card])     holeCards: ArraySchema<Card>;

  // FILTERED — visibility depends on vote_visibility setting
  // See Voting State section for details
  @type(Vote)       vote: Vote | null;
}
```

### Card / CommunityCard

```typescript
class Card extends Schema {
  @type("uint8")    value: number;    // 2-14 (14 = Ace)
  @type("string")   suit: string;     // "hearts" | "diamonds" | "clubs" | "spades"
}

class CommunityCard extends Schema {
  @type("uint8")    value: number;
  @type("string")   suit: string;
  @type("boolean")  revealed: boolean;  // false until the phase where it's shown
}
```

### RuleSlot

```typescript
class RuleSlot extends Schema {
  @type("uint8")    index: number;        // 0, 1, 2
  @type("string")   category: string;     // "hierarchy" | "card_property" | "composition"
  @type("string")   slotState: string;    // "active" | "solidified" | "empty"
  @type(RuleInfo)   rule: RuleInfo | null;
  @type([RuleInfo]) replacementOptions: ArraySchema<RuleInfo>;  // populated during voting phases
}

class RuleInfo extends Schema {
  @type("string")   id: string;           // e.g., "H01"
  @type("string")   category: string;
  @type("string")   name: string;         // e.g., "Underdog Straight"
  @type("string")   description: string;  // player-facing explanation
  @type("string")   tier: string;         // "standard" | "advanced"
}
```

Note: `RuleInfo` is the serializable metadata. The actual `apply()` function lives server-side only in the rule engine — clients never receive executable rule logic.

### VotingState

```typescript
class VotingState extends Schema {
  @type("boolean")  active: boolean;
  @type("uint8")    phase: number;              // 1 or 2
  @type("uint16")   timeRemaining: number;
  @type("uint8")    totalEligible: number;      // how many players can vote
  @type("uint8")    lockedCount: number;        // how many have submitted
  @type(VoteResult) lastResult: VoteResult | null;  // result of most recent vote resolution
}

class Vote extends Schema {
  @type("uint8")    targetSlot: number;         // 0, 1, or 2
  @type("string")   action: string;             // "solidify" | "delete" | "replace" | "abstain"
  @type("string")   replacementId: string;      // rule ID if action is "replace", else ""
  @type("boolean")  locked: boolean;            // once true, cannot change
}

class VoteResult extends Schema {
  @type("uint8")    targetSlot: number;
  @type("string")   action: string;
  @type("string")   replacementId: string;      // if applicable
  @type("boolean")  noAction: boolean;          // true if tie or all abstain
  @type("string")   summary: string;            // human-readable result, e.g., "Slot 1: Replaced with 'Flush Crusher'"
}
```

### SidePot

```typescript
class SidePot extends Schema {
  @type("uint32")       amount: number;
  @type(["string"])     eligiblePlayerIds: ArraySchema<string>;  // sessionIds
}
```

### LobbySettings

```typescript
class LobbySettings extends Schema {
  @type("string")   votingPhases: string;           // "both" | "flop_only" | "turn_only" | "none"
  @type("uint16")   votingTimer: number;            // seconds
  @type("uint16")   turnTimer: number;              // seconds
  @type("boolean")  blindsEnabled: boolean;
  @type("uint32")   smallBlind: number;
  @type("uint32")   bigBlind: number;
  @type("boolean")  antesEnabled: boolean;
  @type("uint32")   anteAmount: number;
  @type("uint8")    ruleSlotCount: number;          // 1, 2, or 3
  @type("uint32")   startingChips: number;
  @type("uint8")    minPlayers: number;
  @type("uint8")    maxPlayers: number;
  @type("boolean")  eliminationMode: boolean;
  @type("string")   voteVisibility: string;         // "hidden" | "after_lock" | "live"
  @type("boolean")  blindEscalation: boolean;
  @type("string")   emptySlotDistribution: string;  // "balanced" | "fully_random"
  @type("string")   ruleTier: string;               // "standard_only" | "all"
}
```

---

## Vote Visibility Filtering

The `vote` field on each `Player` needs conditional filtering based on the lobby's `voteVisibility` setting:

| Setting      | Owner sees own vote? | Others see vote? | When? |
|-------------|---------------------|-----------------|-------|
| `hidden`     | Yes                 | No              | Results shown only after resolution |
| `after_lock` | Yes                 | Yes             | Only after that player's vote is `locked: true` |
| `live`       | Yes                 | Yes             | Immediately, even before lock-in |

Implementation approach: Use `@filter()` on the `vote` property within `Player`:

```typescript
@filter(function(this: Player, client: Client, value: Vote, root: RoomState) {
  // Owner always sees their own vote
  if (client.sessionId === this.sessionId) return true;

  const visibility = root.settings.voteVisibility;
  if (visibility === "live") return true;
  if (visibility === "after_lock" && value?.locked) return true;
  // "hidden" — only owner sees
  return false;
})
@type(Vote) vote: Vote | null;
```

---

## Client → Server Messages

Clients send action intents. Server validates, applies, and state auto-syncs.

```typescript
// === Lobby Phase ===

interface ReadyMessage {
  type: "player_ready";
  ready: boolean;
}

interface UpdateSettingsMessage {
  type: "update_settings";
  settings: Partial<LobbySettingsData>;  // host only
}

interface StartGameMessage {
  type: "start_game";  // host only, requires all players ready
}

// === Betting Phases ===

interface PlayerActionMessage {
  type: "player_action";
  action: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  amount?: number;  // required for "bet" and "raise"
}

// === Voting Phases ===

interface PlayerVoteMessage {
  type: "player_vote";
  targetSlot: number;             // 0, 1, or 2
  action: "solidify" | "delete" | "replace" | "abstain";
  replacementId?: string;         // required if action is "replace"
}

// === Any Phase ===

interface LeaveMessage {
  type: "leave_game";
}
```

### Validation Rules (server-side)

Every message is validated before processing:

| Message | Validations |
|---------|------------|
| `player_action` | Is it this player's turn? Is the action valid for current state? Is the amount legal (min raise, max chips)? |
| `player_vote` | Is the game in a voting phase? Has this player already locked a vote? Is the target slot valid (not solidified, exists)? If replace, is replacementId in the shortlist? |
| `update_settings` | Is this player the host? Is the game still in lobby phase? Are values within allowed ranges? |
| `start_game` | Is this player the host? Are all players ready? Is player count within min/max? |

Invalid messages are rejected with an error sent back to the client only.

---

## Server → Client Messages

Most state updates are handled automatically by Colyseus schema sync. Direct messages are used for:

```typescript
// === Private Messages (sent to individual client) ===

interface ErrorMessage {
  type: "error";
  message: string;       // e.g., "Invalid action: cannot raise less than minimum"
  code: string;          // machine-readable, e.g., "INVALID_RAISE_AMOUNT"
}

// === Broadcast Messages (sent to all clients) ===

interface PhaseTransitionMessage {
  type: "phase_transition";
  from: GamePhase;
  to: GamePhase;
}

interface VoteResolvedMessage {
  type: "vote_resolved";
  result: VoteResultData;
  // All votes are revealed here (regardless of visibility setting)
  allVotes: { playerId: string; vote: VoteData }[];
}

interface RoundEndMessage {
  type: "round_end";
  winners: { playerId: string; handDescription: string; amount: number }[];
  // All hole cards revealed at showdown
  revealedHands: { playerId: string; cards: CardData[] }[];
}

interface PlayerEliminatedMessage {
  type: "player_eliminated";
  playerId: string;
}

interface ShowdownMessage {
  type: "showdown";
  hands: {
    playerId: string;
    cards: CardData[];
    bestHand: CardData[];       // the 5 cards used
    handType: string;           // e.g., "Flush" (post-rule-mutation name)
    handRank: number;           // position in current hierarchy
  }[];
}
```

---

## Room Lifecycle

### GameRoom (extends Colyseus Room)

```
onCreate(options):
  - Initialize RoomState with default settings
  - Set maxClients from settings
  - Apply lobby settings from options (if provided)

onJoin(client, options):
  - Create Player in state.players
  - Assign next available seatIndex
  - First player becomes host
  - If game in progress: join as spectator (see Spectator Support)

onLeave(client, consented):
  - If in lobby: remove player from state
  - If in game:
    - If consented (intentional leave): auto-fold, mark eliminated
    - If not consented (disconnect): mark "disconnected", start reconnect grace period

onMessage(client, type, message):
  - Route to appropriate handler based on message type
  - All handlers validate before mutating state

onDispose():
  - Persist final action log to database (see Action Log / Replay)
  - Cleanup timers, intervals
```

### Reconnection

```
allowReconnection(client, seconds):
  - Grace period: 60 seconds (configurable)
  - Player state preserved (chips, cards, status)
  - If player had a pending action timer, it continues to run
  - On reconnect: send full state sync, resume where they left off
  - On timeout: treat as intentional leave (auto-fold, mark eliminated)
```

---

## Server-Only State (NOT synced to clients)

The following data lives only on the server and is never part of the Colyseus schema:

```typescript
interface ServerOnlyState {
  deck: Card[];                   // remaining deck (card order is secret)
  allHoleCards: Map<string, Card[]>;  // backup of all hole cards (for showdown reveal)
  rngSeed: number;                // for reproducibility/anti-cheat auditing
  actionLog: ActionLogEntry[];    // full history for replay/dispute resolution
  voteTally: Map<string, Vote>;   // raw vote data before resolution
  conflictMatrix: Map<string, string[]>;  // rule conflict pairs
  rulePool: Rule[];               // full rule definitions with apply() functions
}
```

---

## Data Flow Summary

```
┌─────────┐         action intent          ┌─────────┐
│  Client  │ ──────────────────────────────→│  Server  │
│ (Phaser) │    "player_action: raise 50"   │(Colyseus)│
│          │                                │          │
│          │←── state delta (auto-sync) ────│          │
│          │    pot: 150, currentBet: 50    │          │
│          │                                │          │
│          │←── direct message ─────────────│          │
│          │    "error: min raise is 100"   │          │
│          │                                │          │
│          │←── broadcast ──────────────────│          │
│          │    "phase_transition:           │          │
│          │     flop_bet → voting_2"       │          │
└─────────┘                                └─────────┘
```

**State sync** handles: pot, bets, chips, community cards, player statuses, rule slots, timers, phase.

**Direct messages** handle: errors, private information.

**Broadcasts** handle: phase transitions, vote resolutions, showdown reveals, round results.

---

## Spectator Support

Spectators are clients that receive state but cannot send game actions.

### Spectator Schema

```typescript
class Spectator extends Schema {
  @type("string")   sessionId: string;
  @type("string")   displayName: string;
}
```

Add to `RoomState`:
```typescript
@type({ map: Spectator }) spectators: MapSchema<Spectator>;
```

### What Spectators See
- Everything players see EXCEPT hole cards. No `@filter()` will match a spectator's sessionId against any Player, so hole cards are never sent.
- Community cards, pot, bets, player statuses, rule slots, voting results — all visible.
- During showdown, spectators receive the `ShowdownMessage` broadcast with all revealed hands.

### What Spectators Cannot Do
- Cannot send `player_action` or `player_vote` messages (server rejects).
- Cannot modify lobby settings.
- CAN send chat messages (if chat is implemented).

### Joining as Spectator
- If a client joins while a game is in progress, they are automatically added as a spectator.
- If a client joins during lobby phase and all seats are full, they are added as a spectator.
- Spectators can optionally "queue" for a seat — if a player leaves or is eliminated, a queued spectator fills the seat at the next round start.

### Spectator Lifecycle
```
onJoin(client, options):
  - If game in progress OR seats full:
    - Add to state.spectators
    - Send full current state (minus hole cards)
    - Client renders in spectator mode (no action controls)
  - Spectator can leave at any time without affecting the game

  Spectator → Player promotion:
    - Only between rounds (during ROUND_END → ROUND_START transition)
    - Requires an open seat
    - Spectator receives starting chips from lobby settings
    - Moved from state.spectators to state.players
```

### Hole Card Delay (Anti-Stream-Sniping)
Spectators see hole cards on a configurable delay (lobby setting). Default: no delay for casual play. Streamers can set a 60-120 second delay.

Add to `LobbySettings`:
```typescript
@type("uint16") spectatorCardDelay: number;  // seconds, 0 = see at showdown only
```

---

## Room Persistence (Redis-Backed)

Room state survives server restarts. Colyseus supports this via `@colyseus/redis-presence` and `@colyseus/redis-driver`.

### Architecture

```
┌─────────┐       ┌───────────┐       ┌─────────┐
│  Client  │◄────►│  Colyseus  │◄────►│  Redis   │
│          │  WS  │  Server    │      │          │
└─────────┘       └───────────┘       └─────────┘
                        │
                        ▼
                  ┌───────────┐
                  │  Database  │  (action logs, completed games)
                  │ (Postgres) │
                  └───────────┘
```

### What Redis Stores
- **Room presence:** Which rooms exist, which clients are connected (Colyseus built-in).
- **Room state snapshot:** Full serialized `RoomState` + `ServerOnlyState`, written:
  - On every phase transition (low frequency, ~10-15 per round)
  - NOT on every player action (too frequent, state sync handles real-time)
- **Reconnection tokens:** For client reconnection within grace period.

### Recovery Flow
```
Server crash/restart:
  1. Colyseus boots, connects to Redis
  2. Reads existing room presence data
  3. Recreates GameRoom instances from persisted state snapshots
  4. Rooms resume from last snapshotted phase
  5. Clients reconnect using stored reconnection tokens
  6. Any client whose action timer expired during downtime: auto-fold/auto-abstain
  7. Game continues from the last phase transition checkpoint
```

### What Gets Lost on Crash
- Sub-phase progress within a betting round (e.g., if 3 of 5 players had acted). These players re-act from the top of the betting round.
- This is acceptable — worst case, a few players re-submit their bets. No chips or cards are lost because the last phase transition is the checkpoint.

### Database (PostgreSQL)
Redis is for hot state. Completed game data moves to PostgreSQL:
- Completed game summaries (who won, final chip counts)
- Full action logs (for replay, see below)
- Player statistics (win rate, hands played, etc.)

---

## Action Log / Replay

Every game action is logged server-side for replay and dispute resolution.

### Action Log Entry

```typescript
interface ActionLogEntry {
  timestamp: number;           // unix ms
  roundNumber: number;
  phase: GamePhase;
  type: "deal" | "player_action" | "player_vote" | "vote_result"
      | "phase_transition" | "rule_change" | "pot_awarded" | "cards_revealed";
  playerId?: string;           // who performed the action (if applicable)
  data: Record<string, any>;   // action-specific payload
}

// Examples:
// { type: "deal", data: { playerId: "abc", cards: [{value: 14, suit: "spades"}, ...] } }
// { type: "player_action", playerId: "abc", data: { action: "raise", amount: 200 } }
// { type: "vote_result", data: { slot: 1, action: "replace", newRule: "H05" } }
// { type: "pot_awarded", data: { playerId: "abc", amount: 1500 } }
```

### Storage Flow

```
During game:
  - ActionLogEntry[] accumulates in server memory (ServerOnlyState.actionLog)
  - Flushed to Redis on each phase transition (part of the state snapshot)

On round end:
  - Round's action log is appended to the full game log

On game end (room dispose):
  - Full game log is persisted to PostgreSQL
  - Redis snapshot is cleared
```

### Replay Schema (PostgreSQL)

```sql
CREATE TABLE games (
  id            UUID PRIMARY KEY,
  room_id       TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ NOT NULL,
  settings      JSONB NOT NULL,           -- lobby settings snapshot
  player_count  SMALLINT NOT NULL
);

CREATE TABLE game_players (
  game_id       UUID REFERENCES games(id),
  player_id     TEXT NOT NULL,             -- user ID
  display_name  TEXT NOT NULL,
  final_chips   INTEGER NOT NULL,
  placement     SMALLINT,                  -- 1st, 2nd, etc. (elimination mode)
  PRIMARY KEY (game_id, player_id)
);

CREATE TABLE game_actions (
  id            BIGSERIAL PRIMARY KEY,
  game_id       UUID REFERENCES games(id),
  round_number  SMALLINT NOT NULL,
  sequence      INTEGER NOT NULL,          -- order within the game
  timestamp     TIMESTAMPTZ NOT NULL,
  phase         TEXT NOT NULL,
  action_type   TEXT NOT NULL,
  player_id     TEXT,
  data          JSONB NOT NULL
);

CREATE INDEX idx_game_actions_game ON game_actions(game_id, sequence);
```

### Replay Playback
The client can request a game's action log and step through it:
- Server exposes a REST endpoint: `GET /api/games/:id/replay`
- Returns the full ordered action log + initial game settings
- Client renders the replay by applying each action sequentially to a local state machine
- Supports play/pause, speed control, step forward/backward

### Replay Message (Client → Server)

```typescript
interface ReplayRequestMessage {
  type: "request_replay";
  gameId: string;
}
```

This goes through a separate REST API, not the Colyseus room — replays are read-only and don't need real-time sync.

---

## Resolved Questions

| Decision | Resolution | Reasoning |
|----------|-----------|-----------|
| Spectator support | Included in MVP | Increases engagement; spectators can queue for seats |
| Room persistence | Redis-backed with PostgreSQL for completed games | Crash recovery is essential for a real product |
| Action log / replay | Full action logging with replay playback | Dispute resolution, replay feature, and analytics foundation |
| Spectator hole card visibility | Configurable delay (lobby setting), default showdown-only | Anti-stream-sniping, fair for competitive play |
