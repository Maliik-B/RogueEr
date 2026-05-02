import { describe, it, expect } from "vitest";
import { evaluateHandWithConfig } from "../../hand-evaluator.js";
import { evaluateWithRules, annotateCards } from "../../rule-engine.js";
import { F01, F02, F03, F07, F08, F06, F10 } from "../../rules/composition.js";
import { DEFAULT_HAND_RANKINGS, DEFAULT_DETECTION_CONFIG } from "../../constants.js";
import type { Card, Suit, AnnotatedCard, DetectionConfig } from "../../types.js";

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

describe("Composition Rules", () => {
  describe("F01 - Short Flush", () => {
    it("4-card flush now counts", () => {
      const hole = [c("Ah"), c("Kh")];
      const community = [c("9h"), c("7h"), c("3d"), c("Jc"), c("2s")];
      const result = evaluateWithRules(hole, community, [F01]);
      // Ah, Kh, 9h, 7h = 4 hearts = flush with F01
      expect(result.handType).toBe("flush");
    });

    it("3-card flush does NOT count", () => {
      const hole = [c("Ah"), c("Kh")];
      const community = [c("9h"), c("7d"), c("3d"), c("Jc"), c("2s")];
      const result = evaluateWithRules(hole, community, [F01]);
      // Only 3 hearts, not enough even with short flush
      expect(result.handType).not.toBe("flush");
    });
  });

  describe("F02 - Long Straight", () => {
    it("5-card straight no longer counts", () => {
      const hole = [c("Ah"), c("Kd")];
      const community = [c("Qc"), c("Js"), c("Th"), c("4d"), c("2c")];
      // Normal: A-K-Q-J-T straight. With F02: need 6 cards
      const result = evaluateWithRules(hole, community, [F02]);
      expect(result.handType).not.toBe("straight");
    });

    it("6-card straight counts", () => {
      const hole = [c("Ah"), c("Kd")];
      const community = [c("Qc"), c("Js"), c("Th"), c("9d"), c("2c")];
      // A-K-Q-J-T-9 = 6 card straight
      const result = evaluateWithRules(hole, community, [F02]);
      expect(result.handType).toBe("straight");
    });
  });

  describe("F07 - Strict Straight", () => {
    it("ace-high straight no longer works", () => {
      const hole = [c("Ah"), c("Kd")];
      const community = [c("Qc"), c("Js"), c("Th"), c("4d"), c("2c")];
      // A-K-Q-J-T normally a straight, but ace can't be high with F07
      const result = evaluateWithRules(hole, community, [F07]);
      expect(result.handType).not.toBe("straight");
    });

    it("ace-low straight still works", () => {
      const hole = [c("Ah"), c("2d")];
      const community = [c("3c"), c("4s"), c("5h"), c("9d"), c("Kc")];
      const result = evaluateWithRules(hole, community, [F07]);
      expect(result.handType).toBe("straight");
    });
  });

  describe("F08 - Double Pair Plus", () => {
    it("two pair with low pairs becomes high card", () => {
      const hole = [c("7h"), c("7d")];
      const community = [c("5c"), c("5s"), c("Ah"), c("Kd"), c("9c")];
      // 7-7 and 5-5: both below 8, so two pair doesn't count
      const result = evaluateWithRules(hole, community, [F08]);
      expect(result.handType).not.toBe("two_pair");
    });

    it("two pair with high pairs still works", () => {
      const hole = [c("Ah"), c("Ad")];
      const community = [c("Kc"), c("Ks"), c("9h"), c("4d"), c("2c")];
      // A-A and K-K: both above 8
      const result = evaluateWithRules(hole, community, [F08]);
      expect(result.handType).toBe("two_pair");
    });

    it("one pair below 8 invalidates two pair", () => {
      const hole = [c("Ah"), c("Ad")];
      const community = [c("6c"), c("6s"), c("9h"), c("4d"), c("2c")];
      // A-A and 6-6: 6 < 8, so two pair doesn't count. Falls to one pair (aces)
      const result = evaluateWithRules(hole, community, [F08]);
      expect(result.handType).not.toBe("two_pair");
    });
  });

  describe("F06 - Three-Card Flush", () => {
    it("3 suited cards count as three_card_flush", () => {
      const hole = [c("Ah"), c("Kh")];
      const community = [c("9h"), c("7d"), c("3d"), c("Jc"), c("2s")];
      const result = evaluateWithRules(hole, community, [F06]);
      // A,K,9 of hearts = 3 suited, but we also have AK high -> check what wins
      // three_card_flush ranks below one_pair in default rankings
      // No pair here, so it should be three_card_flush if it ranks above high_card
      expect(result.handType).toBe("three_card_flush");
    });
  });

  describe("F10 - Full House Lite", () => {
    it("two pair + kicker counts as full house", () => {
      const hole = [c("Ah"), c("Ad")];
      const community = [c("Kc"), c("Ks"), c("9h"), c("4d"), c("2c")];
      // A-A and K-K with kicker = full house lite (2+2+1)
      const result = evaluateWithRules(hole, community, [F10]);
      expect(result.handType).toBe("full_house");
    });
  });
});
