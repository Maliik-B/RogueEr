import { describe, it, expect } from "vitest";
import { evaluateHand, compareHands } from "../../hand-evaluator.js";
import { H01, H02, H03, H04, H05, H06, H07, H08, H09, H10 } from "../../rules/hierarchy.js";
import { DEFAULT_HAND_RANKINGS } from "../../constants.js";
import type { Card, Suit, EvaluationContext, HandType } from "../../types.js";
import { DEFAULT_DETECTION_CONFIG } from "../../constants.js";

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

function cards(...notations: string[]): Card[] {
  return notations.map(c);
}

function makeCtx(rankings?: HandType[]): EvaluationContext {
  return {
    cards: [],
    handRankings: rankings ?? [...DEFAULT_HAND_RANKINGS],
    detectionConfig: { ...DEFAULT_DETECTION_CONFIG },
    activeRules: [],
  };
}

describe("Hierarchy Rules", () => {
  describe("H01 - Underdog Straight", () => {
    it("straight now outranks flush", () => {
      const ctx = H01.apply(makeCtx());
      const straightIdx = ctx.handRankings.indexOf("straight");
      const flushIdx = ctx.handRankings.indexOf("flush");
      expect(straightIdx).toBeLessThan(flushIdx);
    });

    it("player with straight beats player with flush", () => {
      const ctx = H01.apply(makeCtx());
      const straight = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "Th", "3d", "7c"), ctx.handRankings);
      const flush = evaluateHand(cards("Ah", "Jh", "9h", "7h", "3h", "2d", "Kc"), ctx.handRankings);
      expect(compareHands(straight, flush)).toBe(-1);
    });
  });

  describe("H02 - Pair Supremacy", () => {
    it("one pair outranks two pair", () => {
      const ctx = H02.apply(makeCtx());
      const onePairIdx = ctx.handRankings.indexOf("one_pair");
      const twoPairIdx = ctx.handRankings.indexOf("two_pair");
      expect(onePairIdx).toBeLessThan(twoPairIdx);
    });
  });

  describe("H03 - Trip Demotion", () => {
    it("two pair outranks three of a kind", () => {
      const ctx = H03.apply(makeCtx());
      const twoPairIdx = ctx.handRankings.indexOf("two_pair");
      const tripsIdx = ctx.handRankings.indexOf("three_of_a_kind");
      expect(twoPairIdx).toBeLessThan(tripsIdx);
    });
  });

  describe("H04 - Flush Crusher", () => {
    it("full house and flush are adjacent in rankings", () => {
      const ctx = H04.apply(makeCtx());
      const fhIdx = ctx.handRankings.indexOf("full_house");
      const flIdx = ctx.handRankings.indexOf("flush");
      expect(Math.abs(fhIdx - flIdx)).toBe(1);
    });
  });

  describe("H05 - Boat Sinks", () => {
    it("flush outranks full house", () => {
      const ctx = H05.apply(makeCtx());
      const flushIdx = ctx.handRankings.indexOf("flush");
      const fhIdx = ctx.handRankings.indexOf("full_house");
      expect(flushIdx).toBeLessThan(fhIdx);
    });

    it("player with flush beats player with full house", () => {
      const ctx = H05.apply(makeCtx());
      const flush = evaluateHand(cards("Ah", "Jh", "9h", "7h", "3h", "2d", "Kc"), ctx.handRankings);
      const fullHouse = evaluateHand(cards("Ah", "Ad", "Ac", "Kh", "Kd", "3s", "7c"), ctx.handRankings);
      expect(compareHands(flush, fullHouse)).toBe(-1);
    });
  });

  describe("H06 - Quad Humbled", () => {
    it("full house outranks four of a kind", () => {
      const ctx = H06.apply(makeCtx());
      const fhIdx = ctx.handRankings.indexOf("full_house");
      const fourIdx = ctx.handRankings.indexOf("four_of_a_kind");
      expect(fhIdx).toBeLessThan(fourIdx);
    });
  });

  describe("H07 - Royal Dethrone", () => {
    it("royal flush ranks below straight flush", () => {
      const ctx = H07.apply(makeCtx());
      const royalIdx = ctx.handRankings.indexOf("royal_flush");
      const sfIdx = ctx.handRankings.indexOf("straight_flush");
      expect(royalIdx).toBeGreaterThan(sfIdx);
    });
  });

  describe("H08 - High Card Hero", () => {
    it("high card outranks one pair", () => {
      const ctx = H08.apply(makeCtx());
      const highIdx = ctx.handRankings.indexOf("high_card");
      const pairIdx = ctx.handRankings.indexOf("one_pair");
      expect(highIdx).toBeLessThan(pairIdx);
    });
  });

  describe("H09 - Straight Royalty", () => {
    it("three of a kind outranks straight", () => {
      const ctx = H09.apply(makeCtx());
      const straightIdx = ctx.handRankings.indexOf("straight");
      const tripsIdx = ctx.handRankings.indexOf("three_of_a_kind");
      expect(tripsIdx).toBeLessThan(straightIdx);
    });
  });

  describe("H10 - Nothing Beats Everything", () => {
    it("high card outranks two pair", () => {
      const ctx = H10.apply(makeCtx());
      const highIdx = ctx.handRankings.indexOf("high_card");
      const twoPairIdx = ctx.handRankings.indexOf("two_pair");
      expect(highIdx).toBeLessThan(twoPairIdx);
    });
  });
});
