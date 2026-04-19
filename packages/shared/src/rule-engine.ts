import type {
  Card, AnnotatedCard, Suit, Rule, EvaluatedHand, HandType,
  EvaluationContext, RuleCategory, RuleTierSetting,
} from "./types.js";
import { DEFAULT_HAND_RANKINGS, DEFAULT_DETECTION_CONFIG } from "./constants.js";
import { evaluateHandWithConfig, evaluateHandWithWilds, compareHands } from "./hand-evaluator.js";
import { generateAceSplitCombinations, markSevensWild } from "./rules/card-property.js";
import { RULE_POOL } from "./rules/index.js";

// ============================================================
// Card Annotation
// ============================================================

/** Annotate cards with source provenance for rule evaluation. */
export function annotateCards(holeCards: Card[], communityCards: Card[]): AnnotatedCard[] {
  const annotated: AnnotatedCard[] = [];
  for (const card of holeCards) {
    annotated.push({
      ...card,
      source: "hole",
      originalValue: card.value,
      originalSuit: card.suit,
      isWild: false,
    });
  }
  for (const card of communityCards) {
    annotated.push({
      ...card,
      source: "community",
      originalValue: card.value,
      originalSuit: card.suit,
      isWild: false,
    });
  }
  return annotated;
}

// ============================================================
// Conflict Matrix
// ============================================================

export const CONFLICT_MATRIX: Record<string, string[]> = {
  // Card Property conflicts
  C01: ["C09", "C10", "C08"],   // wild-type group + deuces becoming J-demoted-to-2
  C02: ["C06"],                  // ace grounded vs ace splits
  C03: ["C08"],                  // face collapse vs royal rags (both remap J/Q/K)
  C04: ["C05"],                  // red merge vs black merge (too many flushes)
  C05: ["C04"],
  C06: ["C02"],
  C07: [],
  C08: ["C03", "C01"],
  C09: ["C01", "C10"],           // wild-type group
  C10: ["C01", "C09"],           // wild-type group
  // Composition conflicts
  F01: ["F06"],                  // short flush vs three-card flush
  F02: ["F03", "F07"],           // long straight vs wrap-around/strict
  F03: ["F02"],
  F04: ["F05"],                  // community anchor vs pocket power
  F05: ["F04"],
  F06: ["F01"],
  F07: ["F02"],
  F08: [],
  F09: [],
  F10: [],
  // Hierarchy rules don't conflict — they compose via sequential swaps
};

/** Check if two rules conflict with each other. */
export function rulesConflict(ruleA: string, ruleB: string): boolean {
  return (CONFLICT_MATRIX[ruleA]?.includes(ruleB)) || (CONFLICT_MATRIX[ruleB]?.includes(ruleA)) || false;
}

// ============================================================
// Rule Pool Management
// ============================================================

/** Get rules available for a slot, excluding active and conflicting rules. */
export function getAvailableRules(
  category: RuleCategory,
  activeRuleIds: string[],
  tier: RuleTierSetting
): Rule[] {
  const conflicting = new Set<string>();
  for (const id of activeRuleIds) {
    const conflicts = CONFLICT_MATRIX[id] ?? [];
    for (const c of conflicts) conflicting.add(c);
  }

  return [...RULE_POOL.values()].filter((rule) =>
    rule.category === category &&
    !activeRuleIds.includes(rule.id) &&
    !conflicting.has(rule.id) &&
    (tier === "all" || rule.tier === "standard")
  );
}

/** Pick N random rules from available pool using provided RNG. */
export function pickRandomRules(available: Rule[], count: number, rng: () => number): Rule[] {
  if (available.length <= count) return [...available];
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// ============================================================
// Evaluation Pipeline
// ============================================================

/**
 * Evaluate a hand with active rules applied.
 * This is the main entry point for the rule engine.
 *
 * Pipeline order:
 * 1. Apply hierarchy rules (modify hand rankings)
 * 2. Apply card property rules (transform card values/suits/wilds)
 * 3. Apply composition rules (modify detection config)
 * 4. Evaluate hand (with wild card support if needed)
 */
export function evaluateWithRules(
  holeCards: Card[],
  communityCards: Card[],
  activeRules: Rule[]
): EvaluatedHand {
  // Build initial context
  const annotated = annotateCards(holeCards, communityCards);
  let context: EvaluationContext = {
    cards: annotated,
    handRankings: [...DEFAULT_HAND_RANKINGS],
    detectionConfig: { ...DEFAULT_DETECTION_CONFIG },
    activeRules,
  };

  // Step 1: Apply hierarchy rules
  for (const rule of activeRules.filter((r) => r.category === "hierarchy")) {
    context = rule.apply(context);
  }

  // Step 2: Apply card property rules
  for (const rule of activeRules.filter((r) => r.category === "card_property")) {
    context = rule.apply(context);
  }

  // Step 3: Apply composition rules
  for (const rule of activeRules.filter((r) => r.category === "composition")) {
    context = rule.apply(context);
  }

  // Step 4: Evaluate
  const hasC06 = activeRules.some((r) => r.id === "C06");
  const hasC10 = activeRules.some((r) => r.id === "C10");
  const hasWilds = context.cards.some((c) => c.isWild);

  if (hasC06) {
    return evaluateWithAceSplits(context, hasWilds);
  }

  if (hasC10) {
    return evaluateWithLuckySevens(context);
  }

  if (hasWilds) {
    return evaluateHandWithWilds(context.cards, context.handRankings, context.detectionConfig);
  }

  return evaluateHandWithConfig(context.cards, context.handRankings, context.detectionConfig);
}

/** Handle C06 Ace Splits: enumerate all ace interpretations, return best. */
function evaluateWithAceSplits(context: EvaluationContext, hasOtherWilds: boolean): EvaluatedHand {
  const combinations = generateAceSplitCombinations(context.cards);
  let best: EvaluatedHand | null = null;

  for (const combo of combinations) {
    let result: EvaluatedHand;
    if (hasOtherWilds || combo.some((c) => c.isWild)) {
      result = evaluateHandWithWilds(combo, context.handRankings, context.detectionConfig);
    } else {
      result = evaluateHandWithConfig(combo, context.handRankings, context.detectionConfig);
    }
    if (!best || compareHands(result, best) === -1) {
      best = result;
    }
  }

  return best!;
}

/** Handle C10 Lucky Sevens: evaluate twice (without wilds, then with 7s as wilds if pair+). */
function evaluateWithLuckySevens(context: EvaluationContext): EvaluatedHand {
  // First pass: evaluate without 7s being wild
  const hasOtherWilds = context.cards.some((c) => c.isWild);
  let baseResult: EvaluatedHand;
  if (hasOtherWilds) {
    baseResult = evaluateHandWithWilds(context.cards, context.handRankings, context.detectionConfig);
  } else {
    baseResult = evaluateHandWithConfig(context.cards, context.handRankings, context.detectionConfig);
  }

  // Check if base result is one_pair or better
  const pairOrBetterTypes: HandType[] = [
    "royal_flush", "straight_flush", "four_of_a_kind", "full_house",
    "flush", "straight", "three_of_a_kind", "two_pair", "one_pair",
  ];
  if (!pairOrBetterTypes.includes(baseResult.handType)) {
    return baseResult; // Not pair or better, 7s stay normal
  }

  // Second pass: mark 7s as wild and re-evaluate
  const wilded = markSevensWild(context.cards);
  const wildResult = evaluateHandWithWilds(wilded, context.handRankings, context.detectionConfig);

  // Return the better result
  return compareHands(wildResult, baseResult) === -1 ? wildResult : baseResult;
}

/**
 * Evaluate multiple players' hands with rules and determine winners.
 * Returns indices of winning players.
 */
export function determineWinnersWithRules(
  players: { holeCards: Card[]; communityCards: Card[] }[],
  activeRules: Rule[]
): { winnerIndices: number[]; evaluatedHands: EvaluatedHand[] } {
  const evaluated = players.map((p) => evaluateWithRules(p.holeCards, p.communityCards, activeRules));

  let bestIndices: number[] = [0];
  for (let i = 1; i < evaluated.length; i++) {
    const cmp = compareHands(evaluated[i], evaluated[bestIndices[0]]);
    if (cmp === -1) bestIndices = [i];
    else if (cmp === 0) bestIndices.push(i);
  }

  return { winnerIndices: bestIndices, evaluatedHands: evaluated };
}
