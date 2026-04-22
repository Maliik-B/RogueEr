import { describe, it, expect } from "vitest";
import { evaluateWithRules, annotateCards } from "../../rule-engine.js";
import { C01, C02, C03, C04, C05, C07, C08, C09 } from "../../rules/card-property.js";
import type { Card, Suit } from "../../types.js";

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

describe("Card Property Rules", () => {
  describe("C01 - Deuces Wild", () => {
    it("2s become wild and improve hand", () => {
      // Hole: 2h, Kh. Community: Kd, Qs, Jh, 9c, 4d
      // Without wild: pair of kings
      // With wild: 2h wild -> becomes K -> three of a kind kings
      const hole = [c("2h"), c("Kh")];
      const community = [c("Kd"), c("Qs"), c("Jh"), c("9c"), c("4d")];
      const result = evaluateWithRules(hole, community, [C01]);
      // With wild, the 2 should help form a better hand
      expect(["three_of_a_kind", "four_of_a_kind", "full_house", "straight", "flush", "straight_flush", "royal_flush"]).toContain(result.handType);
    });

    it("multiple wilds can form strong hands", () => {
      const hole = [c("2h"), c("2d")];
      const community = [c("Ah"), c("Kh"), c("Qh"), c("7c"), c("3s")];
      const result = evaluateWithRules(hole, community, [C01]);
      // Two wilds + A,K,Q of hearts should make at least a flush or better
      expect(result.rank).toBeLessThan(6); // better than three_of_a_kind
    });
  });

  describe("C02 - Ace Grounded", () => {
    it("aces become value 1 (low)", () => {
      // A-K-Q-J-T would normally be a straight, but with ace grounded, ace is 1
      // So no straight: just high card (K high)
      const hole = [c("Ah"), c("Kd")];
      const community = [c("Qc"), c("Js"), c("9h"), c("7d"), c("3c")];
      const result = evaluateWithRules(hole, community, [C02]);
      expect(result.handType).toBe("high_card");
    });

    it("ace-low straight still works (A-2-3-4-5 with ace as 1)", () => {
      const hole = [c("Ah"), c("2d")];
      const community = [c("3c"), c("4s"), c("5h"), c("9d"), c("Kc")];
      const result = evaluateWithRules(hole, community, [C02]);
      // Ace is now value 1, so 1-2-3-4-5 is a straight
      expect(result.handType).toBe("straight");
    });
  });

  describe("C03 - Face Collapse", () => {
    it("J, Q, K all become value 10, creating pairs/trips", () => {
      const hole = [c("Jh"), c("Qd")];
      const community = [c("Kc"), c("9s"), c("7h"), c("4d"), c("2c")];
      // J=10, Q=10, K=10 -> three of a kind (all value 10)
      const result = evaluateWithRules(hole, community, [C03]);
      expect(result.handType).toBe("three_of_a_kind");
    });

    it("face cards matching a 10 creates more groups", () => {
      const hole = [c("Th"), c("Jd")];
      const community = [c("9c"), c("8s"), c("7h"), c("4d"), c("2c")];
      // T=10, J=10 -> pair of 10s
      const result = evaluateWithRules(hole, community, [C03]);
      expect(result.handType).toBe("one_pair");
    });
  });

  describe("C04 - Suit Merge Red", () => {
    it("hearts become diamonds, making flushes easier", () => {
      const hole = [c("Ah"), c("Kd")];
      const community = [c("9h"), c("7d"), c("3h"), c("Jc"), c("2s")];
      // Ah->Ad, 9h->9d, 3h->3d: now Ad,Kd,9d,7d,3d = flush!
      const result = evaluateWithRules(hole, community, [C04]);
      expect(result.handType).toBe("flush");
    });
  });

  describe("C05 - Suit Merge Black", () => {
    it("spades become clubs, making flushes easier", () => {
      const hole = [c("As"), c("Kc")];
      const community = [c("9s"), c("7c"), c("3s"), c("Jh"), c("2d")];
      // As->Ac, 9s->9c, 3s->3c: now Ac,Kc,9c,7c,3c = flush!
      const result = evaluateWithRules(hole, community, [C05]);
      expect(result.handType).toBe("flush");
    });
  });

  describe("C07 - Middle Strength", () => {
    it("6, 7, 8 are promoted to value 12", () => {
      const hole = [c("6h"), c("7d")];
      const community = [c("8c"), c("2s"), c("3h"), c("4d"), c("9c")];
      // 6=12, 7=12, 8=12 -> three of a kind (value 12)
      const result = evaluateWithRules(hole, community, [C07]);
      expect(result.handType).toBe("three_of_a_kind");
    });
  });

  describe("C08 - Royal Rags", () => {
    it("K=4, Q=3, J=2 demotion", () => {
      const hole = [c("Kh"), c("4d")];
      const community = [c("9c"), c("7s"), c("5h"), c("3d"), c("2c")];
      // K becomes 4, so we have two 4s -> pair
      const result = evaluateWithRules(hole, community, [C08]);
      expect(result.handType).toBe("one_pair");
    });
  });

  describe("C09 - One-Eyed Jacks Wild", () => {
    it("Jack of hearts is wild", () => {
      const hole = [c("Jh"), c("Kh")];
      const community = [c("Kd"), c("Qs"), c("9c"), c("4d"), c("2s")];
      // Jh is wild -> can become K -> three kings
      const result = evaluateWithRules(hole, community, [C09]);
      expect(["three_of_a_kind", "four_of_a_kind", "full_house"]).toContain(result.handType);
    });

    it("Jack of diamonds is NOT wild", () => {
      const hole = [c("Jd"), c("9h")];
      const community = [c("Kd"), c("Qs"), c("7c"), c("4d"), c("2s")];
      // Jd is not one-eyed, should remain normal
      const result = evaluateWithRules(hole, community, [C09]);
      expect(result.handType).toBe("high_card");
    });
  });
});
