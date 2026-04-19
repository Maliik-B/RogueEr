import type { Rule, EvaluationContext, AnnotatedCard, Suit } from "../types.js";

function makeCardPropertyRule(
  id: string,
  name: string,
  description: string,
  tier: "standard" | "advanced",
  transform: (cards: AnnotatedCard[]) => AnnotatedCard[],
  conflicts: string[] = []
): Rule {
  return {
    id,
    category: "card_property",
    name,
    description,
    tier,
    conflictsWith: conflicts,
    apply(ctx: EvaluationContext): EvaluationContext {
      return { ...ctx, cards: transform(ctx.cards) };
    },
  };
}

function cloneCard(card: AnnotatedCard, overrides: Partial<AnnotatedCard>): AnnotatedCard {
  return { ...card, ...overrides };
}

// C01: Deuces Wild — 2s act as wild cards
export const C01 = makeCardPropertyRule(
  "C01", "Deuces Wild", "2s act as wild cards (substitute for any card)", "advanced",
  (cards) => cards.map((c) => c.value === 2 ? cloneCard(c, { isWild: true }) : c),
  ["C09", "C10", "C08"]
);

// C02: Ace Grounded — Aces count as low only (value 1)
export const C02 = makeCardPropertyRule(
  "C02", "Ace Grounded", "Aces count as low only (value 1, cannot be high)", "standard",
  (cards) => cards.map((c) => c.value === 14 ? cloneCard(c, { value: 1 }) : c),
  ["C06"]
);

// C03: Face Collapse — J, Q, K all share value 10
export const C03 = makeCardPropertyRule(
  "C03", "Face Collapse",
  "J, Q, K all share the same value (10). Creates more pairs/trips but breaks some straights",
  "standard",
  (cards) => cards.map((c) => {
    if (c.value >= 11 && c.value <= 13) return cloneCard(c, { value: 10 });
    return c;
  }),
  ["C08"]
);

// C04: Suit Merge Red — Hearts and Diamonds treated as same suit
export const C04 = makeCardPropertyRule(
  "C04", "Suit Merge: Red",
  "Hearts and Diamonds are treated as the same suit",
  "standard",
  (cards) => cards.map((c) => {
    if (c.suit === "hearts") return cloneCard(c, { suit: "diamonds" as Suit });
    return c;
  }),
  ["C05"]
);

// C05: Suit Merge Black — Spades and Clubs treated as same suit
export const C05 = makeCardPropertyRule(
  "C05", "Suit Merge: Black",
  "Spades and Clubs are treated as the same suit",
  "standard",
  (cards) => cards.map((c) => {
    if (c.suit === "spades") return cloneCard(c, { suit: "clubs" as Suit });
    return c;
  }),
  ["C04"]
);

// C06: Ace Splits — Each Ace counts as BOTH high and low (best interpretation used)
// This is handled specially in the rule engine pipeline: evaluate 2^N combinations
// where N is the number of aces, each ace either value 14 or value 1.
export const C06: Rule = {
  id: "C06",
  category: "card_property",
  name: "Ace Splits",
  description: "Each Ace counts as BOTH high and low simultaneously (best interpretation used)",
  tier: "advanced",
  conflictsWith: ["C02"],
  apply(ctx: EvaluationContext): EvaluationContext {
    // Mark aces for split evaluation. The pipeline handles the combinatorics.
    // We tag the context so the pipeline knows to enumerate ace interpretations.
    return { ...ctx, cards: ctx.cards.map((c) => {
      if (c.value === 14) return cloneCard(c, { isWild: false }); // not wild, but tagged
      return c;
    }) };
  },
};

// C07: Middle Strength — 6, 7, 8 promoted to value 12
export const C07 = makeCardPropertyRule(
  "C07", "Middle Strength",
  "6, 7, 8 are promoted — treated as value 12 (between Q and K)",
  "standard",
  (cards) => cards.map((c) => {
    if (c.value >= 6 && c.value <= 8) return cloneCard(c, { value: 12 });
    return c;
  }),
  []
);

// C08: Royal Rags — K=4, Q=3, J=2
export const C08 = makeCardPropertyRule(
  "C08", "Royal Rags",
  "K, Q, J are demoted — treated as value 4, 3, 2 respectively",
  "advanced",
  (cards) => cards.map((c) => {
    if (c.value === 13) return cloneCard(c, { value: 4 });
    if (c.value === 12) return cloneCard(c, { value: 3 });
    if (c.value === 11) return cloneCard(c, { value: 2 });
    return c;
  }),
  ["C03", "C01"]
);

// C09: One-Eyed Jacks Wild — Jack of Hearts and Jack of Spades are wild
export const C09 = makeCardPropertyRule(
  "C09", "One-Eyed Jacks Wild",
  "Jack of Hearts and Jack of Spades are wild",
  "advanced",
  (cards) => cards.map((c) => {
    if (c.value === 11 && (c.originalSuit === "hearts" || c.originalSuit === "spades")) {
      return cloneCard(c, { isWild: true });
    }
    return c;
  }),
  ["C01", "C10"]
);

// C10: Lucky Sevens — 7s are wild, but only if hand is pairs or better
// Handled via two-pass evaluation in the pipeline.
export const C10: Rule = {
  id: "C10",
  category: "card_property",
  name: "Lucky Sevens",
  description: "7s count as wild, but only in pairs or better (single 7 is normal)",
  tier: "advanced",
  conflictsWith: ["C01", "C09"],
  apply(ctx: EvaluationContext): EvaluationContext {
    // First pass: don't mark 7s as wild. The pipeline will do a second pass.
    // Tag the context so the pipeline knows to try the two-pass approach.
    return ctx;
  },
};

/**
 * For C06 (Ace Splits): generate all 2^N interpretations of aces.
 * Each ace can be value 14 (high) or value 1 (low).
 */
export function generateAceSplitCombinations(cards: AnnotatedCard[]): AnnotatedCard[][] {
  const aceIndices = cards.reduce<number[]>((acc, c, i) => {
    if (c.originalValue === 14) acc.push(i);
    return acc;
  }, []);

  if (aceIndices.length === 0) return [cards];

  const combinations: AnnotatedCard[][] = [];
  const numCombos = 1 << aceIndices.length; // 2^N

  for (let mask = 0; mask < numCombos; mask++) {
    const combo = [...cards];
    for (let i = 0; i < aceIndices.length; i++) {
      const idx = aceIndices[i];
      const asLow = (mask >> i) & 1;
      combo[idx] = cloneCard(cards[idx], { value: asLow ? 1 : 14 });
    }
    combinations.push(combo);
  }

  return combinations;
}

/**
 * For C10 (Lucky Sevens): create a version of the cards with 7s marked as wild.
 */
export function markSevensWild(cards: AnnotatedCard[]): AnnotatedCard[] {
  return cards.map((c) => c.value === 7 ? cloneCard(c, { isWild: true }) : c);
}

export const CARD_PROPERTY_RULES: Rule[] = [C01, C02, C03, C04, C05, C06, C07, C08, C09, C10];
