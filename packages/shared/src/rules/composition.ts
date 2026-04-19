import type { Rule, EvaluationContext, DetectionConfig } from "../types.js";

function makeCompositionRule(
  id: string,
  name: string,
  description: string,
  tier: "standard" | "advanced",
  configOverride: Partial<DetectionConfig>,
  conflicts: string[] = []
): Rule {
  return {
    id,
    category: "composition",
    name,
    description,
    tier,
    conflictsWith: conflicts,
    apply(ctx: EvaluationContext): EvaluationContext {
      return {
        ...ctx,
        detectionConfig: { ...ctx.detectionConfig, ...configOverride },
      };
    },
  };
}

// F01: Short Flush — Flushes require only 4 cards of the same suit
export const F01 = makeCompositionRule(
  "F01", "Short Flush", "Flushes require only 4 cards of the same suit", "standard",
  { flushMinCards: 4 },
  ["F06"]
);

// F02: Long Straight — Straights require 6 consecutive cards
export const F02 = makeCompositionRule(
  "F02", "Long Straight",
  "Straights require 6 consecutive cards. If impossible, standard 5-card straights are disabled entirely",
  "advanced",
  { straightMinCards: 6 },
  ["F03", "F07"]
);

// F03: Wrap-Around — Straights can wrap (e.g., Q-K-A-2-3)
export const F03 = makeCompositionRule(
  "F03", "Wrap-Around", "Straights can wrap (e.g., Q-K-A-2-3 is valid)", "standard",
  { straightWrapAround: true },
  ["F02"]
);

// F04: Community Anchor — Pairs/Trips/Quads need at least 1 community card
export const F04 = makeCompositionRule(
  "F04", "Community Anchor",
  "Pairs/Trips/Quads only count if at least one card is from the community cards",
  "standard",
  { pairRequiresCommunity: true },
  ["F05"]
);

// F05: Pocket Power — Pairs only count if both cards are from hole cards
export const F05 = makeCompositionRule(
  "F05", "Pocket Power",
  "Pairs only count if both cards are from the player's hole cards",
  "advanced",
  { pairRequiresBothHole: true },
  ["F04"]
);

// F06: Three-Card Flush — 3 suited cards count as a Flush (weaker than standard)
export const F06 = makeCompositionRule(
  "F06", "Three-Card Flush",
  "Any 3 cards of the same suit count as a Flush (weaker than a standard 5-card Flush)",
  "standard",
  { threeCardFlush: true },
  ["F01"]
);

// F07: Strict Straight — Ace can only be low in straights (A-2-3-4-5 only)
export const F07 = makeCompositionRule(
  "F07", "Strict Straight",
  "Straights cannot use Ace as high (A-2-3-4-5 only straight with Ace)",
  "standard",
  { straightAceHigh: false },
  ["F02"]
);

// F08: Double Pair Plus — Two Pair requires both pairs to be 8 or higher
export const F08 = makeCompositionRule(
  "F08", "Double Pair Plus",
  "Two Pair requires both pairs to be 8 or higher to count. Otherwise evaluated as High Card",
  "standard",
  { twoPairMinValue: 8 },
  []
);

// F09: Trips or Bust — Three of a Kind needs mixed sources (hole + community)
export const F09 = makeCompositionRule(
  "F09", "Trips or Bust",
  "Three of a Kind requires at least 1 hole card + at least 1 community card",
  "standard",
  { tripsRequireMixedSource: true },
  []
);

// F10: Full House Lite — 2+2+1 (two pairs + kicker) also counts as Full House
export const F10 = makeCompositionRule(
  "F10", "Full House Lite",
  "Full House can be formed with 2+2+1 (two pairs + kicker) in addition to the standard 3+2",
  "advanced",
  { fullHouseLite: true },
  []
);

export const COMPOSITION_RULES: Rule[] = [F01, F02, F03, F04, F05, F06, F07, F08, F09, F10];
