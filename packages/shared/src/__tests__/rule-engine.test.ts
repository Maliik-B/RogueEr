import { describe, it, expect } from "vitest";
import {
  evaluateWithRules, annotateCards, rulesConflict,
  getAvailableRules, pickRandomRules, determineWinnersWithRules,
} from "../rule-engine.js";
import { H01, H05, H07 } from "../rules/hierarchy.js";
import { C01, C02, C03, C04, C06, C09 } from "../rules/card-property.js";
import { F01, F07, F08, F10 } from "../rules/composition.js";
import { ALL_RULES, RULE_POOL } from "../rules/index.js";
import { createRng } from "../deck.js";
import type { Card, Suit } from "../types.js";

function c(notation: string): Card {
  const suitMap: Record<string, Suit> = { h: "hearts", d: "diamonds", c: "clubs", s: "spades" };
  const rankStr = notation.slice(0, -1);
  const suit = suitMap[notation.slice(-1)];
  let value: number;
  switch (rankStr) {
    case "A": value = 14; break;
    case "K": value = 13; break;
    case "Q": value = 12; break;
    case "J": value = 11; break;
    case "T": value = 10; break;
    default: value = parseInt(rankStr, 10);
  }
  return { value, suit };
}

describe("annotateCards", () => {
  it("marks hole cards and community cards correctly", () => {
    const annotated = annotateCards([c("Ah"), c("Kd")], [c("Qc"), c("Js"), c("Th")]);
    expect(annotated).toHaveLength(5);
    expect(annotated[0].source).toBe("hole");
    expect(annotated[1].source).toBe("hole");
    expect(annotated[2].source).toBe("community");
    expect(annotated[3].source).toBe("community");
    expect(annotated[4].source).toBe("community");
  });

  it("preserves original values", () => {
    const annotated = annotateCards([c("Ah")], [c("Kd")]);
    expect(annotated[0].originalValue).toBe(14);
    expect(annotated[0].originalSuit).toBe("hearts");
  });
});

describe("Conflict Matrix", () => {
  it("C02 and C06 conflict", () => {
    expect(rulesConflict("C02", "C06")).toBe(true);
    expect(rulesConflict("C06", "C02")).toBe(true);
  });

  it("C01 and C09 conflict (wild group)", () => {
    expect(rulesConflict("C01", "C09")).toBe(true);
  });

  it("C03 and C08 conflict", () => {
    expect(rulesConflict("C03", "C08")).toBe(true);
  });

  it("F04 and F05 conflict", () => {
    expect(rulesConflict("F04", "F05")).toBe(true);
  });

  it("H01 and H02 do not conflict", () => {
    expect(rulesConflict("H01", "H02")).toBe(false);
  });

  it("C07 has no conflicts", () => {
    expect(rulesConflict("C07", "C01")).toBe(false);
    expect(rulesConflict("C07", "C02")).toBe(false);
  });
});

describe("Rule Pool", () => {
  it("contains 30 rules", () => {
    expect(ALL_RULES).toHaveLength(30);
    expect(RULE_POOL.size).toBe(30);
  });

  it("has 10 per category", () => {
    const hierarchy = ALL_RULES.filter((r) => r.category === "hierarchy");
    const cardProp = ALL_RULES.filter((r) => r.category === "card_property");
    const composition = ALL_RULES.filter((r) => r.category === "composition");
    expect(hierarchy).toHaveLength(10);
    expect(cardProp).toHaveLength(10);
    expect(composition).toHaveLength(10);
  });
});

describe("getAvailableRules", () => {
  it("excludes active rules", () => {
    const available = getAvailableRules("hierarchy", ["H01"], "all");
    expect(available.find((r) => r.id === "H01")).toBeUndefined();
    expect(available.length).toBeLessThan(10);
  });

  it("excludes conflicting rules", () => {
    const available = getAvailableRules("card_property", ["C01"], "all");
    expect(available.find((r) => r.id === "C09")).toBeUndefined();
    expect(available.find((r) => r.id === "C10")).toBeUndefined();
    expect(available.find((r) => r.id === "C08")).toBeUndefined();
  });

  it("filters by tier", () => {
    const standardOnly = getAvailableRules("card_property", [], "standard_only");
    expect(standardOnly.every((r) => r.tier === "standard")).toBe(true);
  });
});

describe("pickRandomRules", () => {
  it("picks the requested number of rules", () => {
    const available = getAvailableRules("hierarchy", [], "all");
    const picked = pickRandomRules(available, 3, createRng(42));
    expect(picked).toHaveLength(3);
  });

  it("is deterministic with same seed", () => {
    const available = getAvailableRules("hierarchy", [], "all");
    const a = pickRandomRules(available, 3, createRng(42));
    const b = pickRandomRules(available, 3, createRng(42));
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });

  it("returns all if fewer available than requested", () => {
    const available = getAvailableRules("hierarchy", [], "all");
    const picked = pickRandomRules(available, 20, createRng(42));
    expect(picked).toHaveLength(available.length);
  });
});

describe("evaluateWithRules (no rules)", () => {
  it("works the same as standard evaluation", () => {
    const hole = [c("Ah"), c("Kh")];
    const community = [c("Qh"), c("Jh"), c("Th"), c("3d"), c("7c")];
    const result = evaluateWithRules(hole, community, []);
    expect(result.handType).toBe("royal_flush");
  });
});

describe("evaluateWithRules (multi-rule combos)", () => {
  it("hierarchy + composition: H01 (straight > flush) + F01 (short flush)", () => {
    const hole = [c("Ah"), c("Kd")];
    const community = [c("Qc"), c("Js"), c("Th"), c("9h"), c("7h")];
    // Has: A-K-Q-J-T straight, also 3 hearts (not enough for short flush)
    // With H01: straight outranks flush, so straight is ranked higher
    const result = evaluateWithRules(hole, community, [H01, F01]);
    expect(result.handType).toBe("straight");
  });

  it("card property + hierarchy: C04 (red merge) + H05 (flush > full house)", () => {
    const hole = [c("Ah"), c("Kd")];
    const community = [c("9h"), c("7d"), c("3h"), c("Kc"), c("Ks")];
    // With C04: hearts->diamonds. Now: Ad,Kd,9d,7d,3d = diamond flush
    // Also have KK pair (+ original K). With H05: flush > full house anyway
    const result = evaluateWithRules(hole, community, [C04, H05]);
    expect(result.handType).toBe("flush");
  });
});

describe("determineWinnersWithRules", () => {
  it("determines correct winner with rules", () => {
    const community = [c("Qc"), c("Js"), c("Th"), c("4d"), c("2c")];
    const players = [
      { holeCards: [c("Ah"), c("Kd")], communityCards: community }, // straight A-K-Q-J-T
      { holeCards: [c("9h"), c("8d")], communityCards: community }, // straight Q-J-T-9-8
    ];
    const { winnerIndices } = determineWinnersWithRules(players, []);
    expect(winnerIndices).toEqual([0]);
  });

  it("handles split pots", () => {
    const community = [c("Ac"), c("Ks"), c("Qh"), c("Jd"), c("Tc")];
    const players = [
      { holeCards: [c("2h"), c("3d")], communityCards: community },
      { holeCards: [c("4h"), c("5d")], communityCards: community },
    ];
    // Both play the board: A-K-Q-J-T straight
    const { winnerIndices } = determineWinnersWithRules(players, []);
    expect(winnerIndices).toEqual([0, 1]);
  });
});
