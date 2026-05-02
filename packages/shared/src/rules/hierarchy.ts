import type { Rule, EvaluationContext, HandType } from "../types.js";

/** Swap two hand types' positions in the rankings. */
function swapRanks(rankings: HandType[], a: HandType, b: HandType): HandType[] {
  const result = [...rankings];
  const idxA = result.indexOf(a);
  const idxB = result.indexOf(b);
  if (idxA !== -1 && idxB !== -1) {
    result[idxA] = b;
    result[idxB] = a;
  }
  return result;
}

/** Move a hand type to the position just after another (making it weaker). */
function moveAfter(rankings: HandType[], toMove: HandType, after: HandType): HandType[] {
  const result = [...rankings];
  const moveIdx = result.indexOf(toMove);
  const afterIdx = result.indexOf(after);
  if (moveIdx === -1 || afterIdx === -1) return result;
  result.splice(moveIdx, 1);
  const insertIdx = result.indexOf(after) + 1;
  result.splice(insertIdx, 0, toMove);
  return result;
}

function makeHierarchyRule(
  id: string,
  name: string,
  description: string,
  tier: "standard" | "advanced",
  transform: (rankings: HandType[]) => HandType[],
  conflicts: string[] = []
): Rule {
  return {
    id,
    category: "hierarchy",
    name,
    description,
    tier,
    conflictsWith: conflicts,
    apply(ctx: EvaluationContext): EvaluationContext {
      return { ...ctx, handRankings: transform(ctx.handRankings) };
    },
  };
}

export const H01 = makeHierarchyRule(
  "H01", "Underdog Straight", "Straight outranks Flush", "standard",
  (r) => swapRanks(r, "straight", "flush")
);

export const H02 = makeHierarchyRule(
  "H02", "Pair Supremacy", "One Pair outranks Two Pair", "standard",
  (r) => swapRanks(r, "one_pair", "two_pair")
);

export const H03 = makeHierarchyRule(
  "H03", "Trip Demotion", "Two Pair outranks Three of a Kind", "standard",
  (r) => swapRanks(r, "two_pair", "three_of_a_kind")
);

export const H04 = makeHierarchyRule(
  "H04", "Flush Crusher",
  "Full House no longer outranks Flush (they tie, resolved by high card)",
  "advanced",
  (r) => {
    // Give flush the same rank position as full_house (the better one)
    const result = [...r];
    const fhIdx = result.indexOf("full_house");
    const flIdx = result.indexOf("flush");
    if (fhIdx === -1 || flIdx === -1) return result;
    // Remove flush from its position and place it right after full_house
    // so they're adjacent. We'll handle tie logic in the evaluator by
    // giving them the same effective rank via adjacent placement.
    // Actually, for true tie: remove both, re-insert at the better position side by side
    const betterIdx = Math.min(fhIdx, flIdx);
    const filtered = result.filter((h) => h !== "full_house" && h !== "flush") as HandType[];
    filtered.splice(betterIdx, 0, "full_house" as HandType, "flush" as HandType);
    return filtered;
  }
);

export const H05 = makeHierarchyRule(
  "H05", "Boat Sinks", "Flush outranks Full House", "standard",
  (r) => swapRanks(r, "flush", "full_house")
);

export const H06 = makeHierarchyRule(
  "H06", "Quad Humbled", "Full House outranks Four of a Kind", "advanced",
  (r) => swapRanks(r, "full_house", "four_of_a_kind")
);

export const H07 = makeHierarchyRule(
  "H07", "Royal Dethrone",
  "Straight Flush outranks Royal Flush (Royal treated as lowest Straight Flush)",
  "advanced",
  (r) => moveAfter(r, "royal_flush", "straight_flush")
);

export const H08 = makeHierarchyRule(
  "H08", "High Card Hero", "High Card outranks One Pair", "advanced",
  (r) => swapRanks(r, "high_card", "one_pair")
);

export const H09 = makeHierarchyRule(
  "H09", "Straight Royalty", "Three of a Kind outranks Straight", "standard",
  (r) => swapRanks(r, "straight", "three_of_a_kind")
);

export const H10 = makeHierarchyRule(
  "H10", "Nothing Beats Everything", "High Card outranks Two Pair", "advanced",
  (r) => swapRanks(r, "high_card", "two_pair")
);

export const HIERARCHY_RULES: Rule[] = [H01, H02, H03, H04, H05, H06, H07, H08, H09, H10];
