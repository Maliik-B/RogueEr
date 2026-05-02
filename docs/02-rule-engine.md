# 1.2 — Rule Engine

## Core Concept

Each round begins with 3 rule slots, each bound to a specific **category**. Rules within those slots modify how hands are evaluated at showdown. Players can vote to solidify, delete, or replace rules during voting phases.

---

## Rule Categories

Each slot is assigned a fixed category. The 3 categories target different axes of poker hand evaluation:

### Slot 1 — Hierarchy Rules
Directly alter the ranking order of hand types.

**Examples:**
| ID | Name | Effect |
|----|------|--------|
| `H01` | Underdog Straight | Straight outranks Flush |
| `H02` | Pair Supremacy | One Pair outranks Two Pair |
| `H03` | Trip Demotion | Two Pair outranks Three of a Kind |
| `H04` | Flush Crusher | Full House no longer outranks Flush (they tie, resolved by high card) |
| `H05` | Boat Sinks | Flush outranks Full House |
| `H06` | Quad Humbled | Full House outranks Four of a Kind |
| `H07` | Royal Dethrone | Straight Flush outranks Royal Flush (Royal treated as lowest Straight Flush) |
| `H08` | High Card Hero | High Card outranks One Pair |
| `H09` | Straight Royalty | Straight outranks Three of a Kind |
| `H10` | Nothing Beats Everything | High Card outranks Two Pair |

**Implementation:** These rules modify a `handRankings` array that maps hand types to their relative power. Default order is the standard poker hierarchy. Hierarchy rules swap or reassign positions in this array.

---

### Slot 2 — Card Property Rules
Alter how individual cards, values, or suits behave during evaluation.

**Examples:**
| ID | Name | Effect |
|----|------|--------|
| `C01` | Deuces Wild | 2s act as wild cards (substitute for any card) |
| `C02` | Ace Grounded | Aces count as low only (value 1, cannot be high) |
| `C03` | Face Collapse | J, Q, K all share the same value (10). Creates more pairs/trips but breaks some straights |
| `C04` | Suit Merge: Red | Hearts and Diamonds are treated as the same suit |
| `C05` | Suit Merge: Black | Spades and Clubs are treated as the same suit |
| `C06` | Ace Splits | Each Ace counts as BOTH high and low simultaneously (best interpretation used) |
| `C07` | Middle Strength | 6, 7, 8 are promoted — treated as value 12 (between Q and K) |
| `C08` | Royal Rags | K, Q, J are demoted — treated as value 4, 3, 2 respectively |
| `C09` | One-Eyed Jacks Wild | Jack of Hearts and Jack of Spades are wild |
| `C10` | Lucky Sevens | 7s count as wild, but only in pairs or better (single 7 is normal) |

**Implementation:** These rules apply transformation functions to the card values/suits BEFORE hand evaluation occurs. The evaluation engine sees the transformed cards.

---

### Slot 3 — Hand Composition Rules
Change what constitutes a valid hand formation.

**Examples:**
| ID | Name | Effect |
|----|------|--------|
| `F01` | Short Flush | Flushes require only 4 cards of the same suit |
| `F02` | Long Straight | Straights require 6 consecutive cards (using both hole cards + community). If impossible, standard 5-card straights are disabled entirely |
| `F03` | Wrap-Around | Straights can wrap (e.g., Q-K-A-2-3 is valid) |
| `F04` | Community Anchor | Pairs/Trips/Quads only count if at least one card is from the community cards |
| `F05` | Pocket Power | Pairs only count if both cards are from the player's hole cards |
| `F06` | Three-Card Flush | Any 3 cards of the same suit count as a Flush (weaker than a standard 5-card Flush) |
| `F07` | Strict Straight | Straights cannot use Ace as high (A-2-3-4-5 only straight with Ace) |
| `F08` | Double Pair Plus | Two Pair requires both pairs to be 8 or higher to count. Otherwise it's evaluated as High Card |
| `F09` | Trips or Bust | Three of a Kind requires all 3 cards to be from different sources (at least 1 hole + at least 1 community) |
| `F10` | Full House Lite | Full House can be formed with 2+2+1 (two pairs + kicker) in addition to the standard 3+2 |

**Implementation:** These rules modify the hand detection functions themselves — changing what patterns the evaluator looks for.

---

## Rule Slot System

### Round Start
At the beginning of each round:
1. Slot 1 receives a random **Hierarchy Rule** from the pool
2. Slot 2 receives a random **Card Property Rule** from the pool
3. Slot 3 receives a random **Hand Composition Rule** from the pool

No duplicates of currently active rules. Rules used in the previous round CAN appear again (full re-randomization).

### Slot States
Each slot has one of three states:
```
ACTIVE      — Rule is in effect and can be voted on
SOLIDIFIED  — Rule is locked in for the rest of the round (cannot be targeted)
EMPTY       — Rule was deleted; slot can be filled via replace
```

---

## Replace Mechanics — Category Binding

This is where slot categories interact with voting strategy:

### Direct Replace (vote "replace" on an ACTIVE or SOLIDIFIED slot... wait, solidified can't be targeted)
**Direct Replace:** Vote "replace" on an ACTIVE slot.
- Replacement options are drawn **from the same category pool** as the slot.
- Slot 1 replace → 3 random Hierarchy rules offered
- Slot 2 replace → 3 random Card Property rules offered
- Slot 3 replace → 3 random Hand Composition rules offered
- This is the "safe" play — you know what type of rule you're getting.

### Fill Empty Slot (vote "replace" on an EMPTY slot)
- Replacement options are drawn from **ANY category pool**.
- The server offers 3 random rules pulled from across all categories.
- The slot's category label updates to match whatever rule is placed in it.
- This is the "wild card" play — more flexible but unpredictable.

### Strategic Implications
- **Delete + later refill** is a two-phase gambit: sacrifice a known rule now for the chance to pull cross-category later.
- **Direct replace** is a one-phase play: immediate swap within the same category.
- This gives "delete" a distinct strategic identity beyond just "remove something bad."
- A player might delete a Hierarchy rule they don't like, hoping to fill that slot later with a favorable Card Property rule instead.

---

## Replacement Option Presentation

When "replace" wins a vote, the replacement options must have already been visible to voters:

### During Voting Phase
1. Server generates a **shortlist of 3 replacement options** per slot at the start of the voting phase.
   - For ACTIVE slots: 3 from the slot's category (excluding the current rule)
   - For EMPTY slots: 3 from any category (1 from each, or random distribution — TBD)
2. All players see the shortlists for all slots before voting.
3. A player voting "replace" on a slot also picks which of the 3 replacements they want.
4. If "replace" wins, the most-voted replacement from the shortlist is applied.

This means players have full information about what COULD happen before they commit their vote.

---

## Rule Representation (Data Structure)

```typescript
interface Rule {
  id: string;              // e.g., "H01", "C05", "F03"
  category: "hierarchy" | "card_property" | "composition";
  name: string;            // Display name, e.g., "Underdog Straight"
  description: string;     // Player-facing explanation
  apply: (context: EvaluationContext) => EvaluationContext;
  // The transformation function — details depend on category:
  //   hierarchy:    modifies handRankings order
  //   card_property: modifies card values/suits before eval
  //   composition:  modifies hand detection logic
}

interface RuleSlot {
  index: 0 | 1 | 2;
  category: "hierarchy" | "card_property" | "composition";
  state: "active" | "solidified" | "empty";
  rule: Rule | null;       // null when empty
  replacementOptions: Rule[];  // populated at start of each voting phase
}

interface RoundRules {
  slots: [RuleSlot, RuleSlot, RuleSlot];
  baseHandRankings: HandType[];  // standard poker hierarchy
  effectiveHandRankings: HandType[];  // after hierarchy rules applied
}
```

---

## Hand Evaluation Pipeline

The rule engine modifies hand evaluation through a pipeline:

```
1. CARD TRANSFORM
   Apply Card Property rules (Slot 2) to all cards
   → e.g., "Deuces Wild" transforms 2s into best possible card
   → e.g., "Face Collapse" maps J/Q/K → 10

2. HAND DETECTION
   Apply Composition rules (Slot 3) to hand pattern matching
   → e.g., "Short Flush" checks for 4-card flushes
   → e.g., "Wrap-Around" allows A-2 continuity in straights

3. HAND RANKING
   Apply Hierarchy rules (Slot 1) to determine which detected hand wins
   → e.g., "Flush Crusher" makes Flush tie with Full House
   → e.g., "Underdog Straight" promotes Straight above Flush

4. TIEBREAK
   Standard poker tiebreak rules (high card, kicker) using
   TRANSFORMED card values from step 1
```

This pipeline order matters: cards are transformed first, then patterns are detected on transformed cards, then detected hands are ranked according to the modified hierarchy.

---

## Rule Pool Management

### Pool Size
- Target: ~10 rules per category (30 total) for launch
- Expandable post-launch via updates

### Exclusion Rules
- A rule cannot appear if it contradicts another active rule in a way that creates an unresolvable conflict.
  - Example: "Ace Grounded" (Ace is low only) + "Ace Splits" (Ace is both) → conflict.
  - The server maintains a **conflict matrix** and excludes conflicting rules from randomization and replacement shortlists.

### Balance Considerations
- Rules should create roughly symmetric advantage shifts (buffing weak hands should be as common as nerfing strong ones).
- No rule should make the game unplayable or reduce all hands to the same value.
- Wild card rules (Deuces Wild, etc.) are the most powerful — consider limiting to 1 wild-type rule active at a time.

---

## Resolved Design Decisions

| Decision | Resolution | Reasoning |
|----------|-----------|-----------|
| Slots bound to categories? | Yes — each slot has a fixed category | Prevents chaotic stacking of same-type rules |
| Direct replace = same category? | Yes | Safe, predictable option for voters |
| Empty slot replace = any category? | Yes | Gives "delete" a distinct strategic purpose |
| Slot category updates on cross-category fill? | Yes | Slot becomes whatever it now holds |
| Replacement options visible before voting? | Yes | Full information → better strategic decisions |
| Shortlist size | 3 options per slot | Enough choice without overwhelming |
| Empty slot shortlist | 1-per-category default, `fully_random` toggle | Balanced diversity by default, chaos as an option |
| Rule complexity tiers | `standard` and `advanced` tiers, lobby toggle | Lets beginners avoid wild rules, lets veterans embrace them |

---

## Resolved Questions

1. **Empty slot shortlist distribution:** Default is 1-per-category. Lobby setting `empty_slot_distribution`: `balanced` (1 per category) or `fully_random`. Default: `balanced`.
2. **Rule complexity tiers:** Yes — rules tagged with a `tier` field (`standard` or `advanced`). Lobby setting `rule_tier`: `standard_only` or `all`. Default: `all`. Allows the community to play with "broken" rules intentionally or exclude them.

## Remaining Work

- Enumerate all pairwise rule interactions to identify conflicts (conflict matrix). This is a testing/balance task for Phase 2.
