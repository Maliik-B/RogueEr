# 1.1 — Game State Machine

## Round Flow Overview

```
LOBBY
  │
  ▼
ROUND_START ─── Post blinds/antes, randomize 3 rule slots, assign dealer
  │
  ▼
DEAL ─── Deal 2 hole cards to each player
  │
  ▼
PRE_FLOP_BET ─── Standard betting round (starting left of big blind)
  │
  ├── (all but one folded?) ──→ ROUND_END
  │
  ▼
VOTING_1 ─── Players vote on rule modifications (configurable: on/off)
  │
  ▼
FLOP ─── Reveal 3 community cards
  │
  ▼
FLOP_BET ─── Standard betting round (starting left of dealer)
  │
  ├── (all but one folded?) ──→ ROUND_END
  │
  ▼
VOTING_2 ─── Players vote on rule modifications (configurable: on/off)
  │
  ▼
TURN ─── Reveal 1 community card
  │
  ▼
TURN_BET ─── Standard betting round
  │
  ├── (all but one folded?) ──→ ROUND_END
  │
  ▼
RIVER ─── Reveal 1 community card
  │
  ▼
RIVER_BET ─── Standard betting round
  │
  ├── (all but one folded?) ──→ ROUND_END
  │
  ▼
SHOWDOWN ─── Evaluate hands using CURRENT ruleset, determine winner(s)
  │
  ▼
ROUND_END ─── Award pot, reset state, rotate dealer
  │
  ├── (players remain?) ──→ ROUND_START
  └── (game over?) ──→ LOBBY
```

---

## States

### LOBBY
- **Description:** Players join/leave, host configures settings.
- **Valid actions:** `join`, `leave`, `update_settings` (host only), `ready`, `start_game` (host, when all ready)
- **Transitions to:** `ROUND_START` when host starts and minimum players met (2+)

### ROUND_START
- **On enter:**
  - Rotate dealer button
  - Post small blind and big blind (and antes if enabled)
  - Randomize 3 rule slots from the rule pool
  - Broadcast active rules to all players
- **Auto-transitions to:** `DEAL` (no player input needed)

### DEAL
- **On enter:**
  - Shuffle deck
  - Deal 2 hole cards to each player (server-only; each client sees only their own)
- **Auto-transitions to:** `PRE_FLOP_BET`

### PRE_FLOP_BET
- **Description:** Standard pre-flop betting.
- **Action order:** Starts with player left of big blind, wraps around.
- **Valid actions:** `fold`, `call`, `raise`, `all_in`
  - Big blind can also `check` if no raise occurred.
- **Transitions to:**
  - `ROUND_END` — if all but one player folded
  - `VOTING_1` — if voting before flop is enabled in lobby settings
  - `FLOP` — if voting before flop is disabled

### VOTING_1
- **Description:** First rule modification vote. Only non-folded players participate.
- **On enter:** Start vote timer.
- **Valid actions:** `vote(slot, action, [replacement_rule])` or `abstain`
  - `slot`: Which rule slot (1, 2, or 3) the player wants to target
  - `action`: `solidify`, `delete`, or `replace`
  - `replacement_rule`: Required only if action is `replace` — chosen from a presented set of options
- **Resolution:** See Voting Mechanics below.
- **Transitions to:** `FLOP`

### FLOP
- **On enter:** Reveal 3 community cards.
- **Auto-transitions to:** `FLOP_BET`
- **Skipped if:** All but one active player is all-in (go straight to TURN with no betting)

### FLOP_BET
- **Description:** Standard post-flop betting.
- **Action order:** Starts with first active player left of dealer.
- **Valid actions:** `fold`, `check`, `bet`, `raise`, `all_in`
- **Transitions to:**
  - `ROUND_END` — if all but one player folded
  - `VOTING_2` — if voting before turn is enabled
  - `TURN` — if voting before turn is disabled
- **Skipped if:** All active players are all-in

### VOTING_2
- **Description:** Second rule modification vote. Same mechanics as VOTING_1.
- **Transitions to:** `TURN`

### TURN
- **On enter:** Reveal 1 community card.
- **Auto-transitions to:** `TURN_BET`
- **Skipped if:** All but one active player is all-in

### TURN_BET
- **Description:** Standard betting round.
- **Transitions to:**
  - `ROUND_END` — if all but one player folded
  - `RIVER`
- **Skipped if:** All active players are all-in

### RIVER
- **On enter:** Reveal 1 community card.
- **Auto-transitions to:** `RIVER_BET`
- **Skipped if:** All but one active player is all-in

### RIVER_BET
- **Description:** Final betting round.
- **Transitions to:**
  - `ROUND_END` — if all but one player folded
  - `SHOWDOWN`
- **Skipped if:** All active players are all-in

### SHOWDOWN
- **On enter:**
  - Reveal all remaining players' hole cards
  - Evaluate each hand using the **current** (possibly mutated) ruleset
  - Determine winner(s), handle split pots
- **Auto-transitions to:** `ROUND_END`

### ROUND_END
- **On enter:**
  - Award pot(s) to winner(s)
  - Clear community cards, hole cards, rule slots
  - Eliminate players with 0 chips (if elimination mode)
  - Brief pause for players to see results
- **Transitions to:**
  - `ROUND_START` — if 2+ players remain
  - `LOBBY` — if game is over (1 player left or configurable end condition)

---

## Voting Mechanics

### Simultaneous Voting
All eligible players submit their vote within the timer. Default visibility is `after_lock` — votes are revealed as players lock them in, but cannot be changed once submitted.

### Vote Structure (per player)
Each player submits ONE vote consisting of:
```
{
  target_slot: 1 | 2 | 3,       // which rule slot to act on
  action: "solidify" | "delete" | "replace",
  replacement_id?: string        // only if action is "replace"
}
```

### Resolution
1. **Group votes by target slot.** The slot with the most votes is the one acted upon.
   - Tie on slot → no action is taken (rules stay as-is).
2. **Within the winning slot, group by action.** The action with the most votes wins.
   - Tie on action → no action is taken.
3. **If action is "replace", group by replacement_id.** Most-voted replacement wins.
   - Tie on replacement → no replacement; rule is deleted instead (partial resolution).

### Special Cases
- **Abstain:** Player chooses not to vote. Does not count toward any total.
- **All abstain:** No changes to rules.
- **Solidified rules:** Once solidified, a rule cannot be targeted in future voting phases this round. It locks in.
- **Deleted slot:** An empty slot CAN be targeted with "replace" to fill it in a later voting phase. Cannot be targeted with "solidify" or "delete."
- **Timer expiry:** Unsubmitted votes count as abstain.
- **Single voter:** If only one non-folded player remains eligible to vote, their vote auto-wins.
- **All-in players:** CAN still vote (they have a stake in the outcome). Only folded players are excluded.

### Replacement Options
When a player picks "replace," they choose from a **server-generated shortlist** (e.g., 3 random rules from the pool, excluding currently active rules). All players see the same shortlist.

---

## Betting Mechanics (Standard Hold'em)

### Action Validity
| Action   | When Valid                                      |
|----------|-------------------------------------------------|
| `fold`   | Always (when it's your turn)                    |
| `check`  | No bet/raise to match                           |
| `call`   | There is a bet/raise to match                   |
| `bet`    | No bet placed yet this round                    |
| `raise`  | A bet has been placed; player raises above it   |
| `all_in` | Always (when it's your turn); bets all chips    |

### Round Completion
A betting round ends when:
- All active players have acted AND all bets are matched
- All but one player has folded
- All active players are all-in

### Side Pots
When a player goes all-in for less than the current bet, a side pot is created. Standard Texas Hold'em side pot rules apply.

---

## Player States (per round)

```
WAITING      — not yet their turn
ACTING       — it's their turn to act
FOLDED       — out of this round
ALL_IN       — has bet all chips, no more actions (can still vote)
ELIMINATED   — 0 chips, out of the game (if elimination mode)
DISCONNECTED — temporarily disconnected, timer still runs
```

---

## Timers

| Phase        | Default Duration | Configurable? |
|--------------|------------------|---------------|
| Player turn  | 30 seconds       | Yes           |
| Voting phase | 30 seconds       | Yes           |
| Round end    | 5 seconds        | No            |

- **Turn timeout:** Auto-fold (or auto-check if check is available).
- **Vote timeout:** Auto-abstain.

---

## Lobby Settings (affecting state machine)

| Setting                  | Values                              | Default        |
|--------------------------|-------------------------------------|----------------|
| `voting_phases`          | `both`, `flop_only`, `turn_only`, `none` | `both`    |
| `voting_timer`           | 15-60 seconds                       | 30             |
| `turn_timer`             | 15-60 seconds                       | 30             |
| `blinds`                 | on/off + amounts                    | on             |
| `antes`                  | on/off + amount                     | off            |
| `rule_slot_count`        | 1, 2, or 3                          | 3              |
| `starting_chips`         | number                              | 1000           |
| `min_players`            | 2-8                                 | 2              |
| `max_players`            | 2-8                                 | 6              |
| `elimination_mode`       | on/off                              | off            |
| `vote_visibility`        | `hidden`, `after_lock`, `live`      | `after_lock`   |
| `blind_escalation`       | on/off + schedule                   | off            |
| `empty_slot_distribution`| `balanced`, `fully_random`          | `balanced`     |
| `rule_tier`              | `standard_only`, `all`              | `all`          |

---

## Resolved Questions

1. **Can a deleted rule slot be filled via "replace" in a later voting phase?** YES — otherwise deleting is always strictly worse than solidifying.
2. **Should players see each other's votes before resolution, or only the result?** Lobby setting (`vote_visibility`). Default: `after_lock` — votes shown as players lock them in, but immutable once submitted.
3. **Pre-flop betting before voting or after?** BEFORE — bet on current rules, then rules may shift. Creates core tension and rewards adaptability.
4. **Should blind levels escalate over time (tournament structure)?** YES, as a lobby setting (`blind_escalation`). Off by default. Deferred to Phase 2 implementation but accounted for in the state machine.
