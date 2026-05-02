import { describe, it, expect } from "vitest";
import { evaluateHand, compareHands, determineWinners } from "../hand-evaluator.js";
import type { Card, Suit } from "../types.js";

// Helper to build cards quickly: c("Ah") = Ace of hearts
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

// ============================================================
// Hand Detection Tests
// ============================================================

describe("evaluateHand", () => {
  it("throws with fewer than 5 cards", () => {
    expect(() => evaluateHand(cards("Ah", "Kh", "Qh", "Jh"))).toThrow();
  });

  describe("Royal Flush", () => {
    it("detects royal flush", () => {
      const hand = evaluateHand(cards("Ah", "Kh", "Qh", "Jh", "Th", "3d", "7c"));
      expect(hand.handType).toBe("royal_flush");
    });

    it("detects royal flush among 7 cards", () => {
      const hand = evaluateHand(cards("2s", "Ah", "Kh", "Qh", "Jh", "Th", "9c"));
      expect(hand.handType).toBe("royal_flush");
    });
  });

  describe("Straight Flush", () => {
    it("detects straight flush", () => {
      const hand = evaluateHand(cards("9h", "8h", "7h", "6h", "5h", "2d", "3c"));
      expect(hand.handType).toBe("straight_flush");
      expect(hand.kickers[0]).toBe(9);
    });

    it("detects ace-low straight flush (wheel)", () => {
      const hand = evaluateHand(cards("5d", "4d", "3d", "2d", "Ad", "Kc", "Qs"));
      expect(hand.handType).toBe("straight_flush");
      expect(hand.kickers[0]).toBe(5);
    });

    it("higher straight flush beats lower", () => {
      const a = evaluateHand(cards("9h", "8h", "7h", "6h", "5h", "2d", "3c"));
      const b = evaluateHand(cards("8d", "7d", "6d", "5d", "4d", "2c", "3s"));
      expect(compareHands(a, b)).toBe(-1);
    });
  });

  describe("Four of a Kind", () => {
    it("detects four of a kind", () => {
      const hand = evaluateHand(cards("Ah", "Ad", "Ac", "As", "Kh", "3d", "7c"));
      expect(hand.handType).toBe("four_of_a_kind");
      expect(hand.kickers).toEqual([14, 13]);
    });

    it("higher quads beat lower quads", () => {
      const a = evaluateHand(cards("Ah", "Ad", "Ac", "As", "Kh", "3d", "7c"));
      const b = evaluateHand(cards("Kh", "Kd", "Kc", "Ks", "Ah", "3d", "7c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("same quads — higher kicker wins", () => {
      const a = evaluateHand(cards("9h", "9d", "9c", "9s", "Ah", "3d", "7c"));
      const b = evaluateHand(cards("9h", "9d", "9c", "9s", "Kh", "3d", "7c"));
      expect(compareHands(a, b)).toBe(-1);
    });
  });

  describe("Full House", () => {
    it("detects full house", () => {
      const hand = evaluateHand(cards("Ah", "Ad", "Ac", "Kh", "Kd", "3s", "7c"));
      expect(hand.handType).toBe("full_house");
      expect(hand.kickers).toEqual([14, 13]);
    });

    it("higher trips win in full house", () => {
      const a = evaluateHand(cards("Ah", "Ad", "Ac", "Kh", "Kd", "3s", "7c"));
      const b = evaluateHand(cards("Kh", "Kd", "Kc", "Ah", "Ad", "3s", "7c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("same trips — higher pair wins", () => {
      const a = evaluateHand(cards("Ah", "Ad", "Ac", "Kh", "Kd", "3s", "7c"));
      const b = evaluateHand(cards("Ah", "Ad", "Ac", "Qh", "Qd", "3s", "7c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("detects full house with two trips (picks best)", () => {
      const hand = evaluateHand(cards("Ah", "Ad", "Ac", "Kh", "Kd", "Kc", "7c"));
      expect(hand.handType).toBe("full_house");
      expect(hand.kickers).toEqual([14, 13]);
    });
  });

  describe("Flush", () => {
    it("detects flush", () => {
      const hand = evaluateHand(cards("Ah", "Jh", "9h", "7h", "3h", "2d", "Kc"));
      expect(hand.handType).toBe("flush");
    });

    it("higher flush beats lower flush", () => {
      const a = evaluateHand(cards("Ah", "Jh", "9h", "7h", "3h", "2d", "Kc"));
      const b = evaluateHand(cards("Kh", "Jh", "9h", "7h", "3h", "2d", "4c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("flushes tie on first four, fifth card breaks tie", () => {
      const a = evaluateHand(cards("Ah", "Kh", "Qh", "Jh", "9h", "2d", "3c"));
      const b = evaluateHand(cards("Ah", "Kh", "Qh", "Jh", "8h", "2d", "3c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("picks the best 5 of 6+ suited cards", () => {
      const hand = evaluateHand(cards("Ah", "Kh", "Qh", "Jh", "9h", "7h", "3c"));
      expect(hand.handType).toBe("flush");
      expect(hand.cards).toHaveLength(5);
      expect(hand.kickers).toEqual([14, 13, 12, 11, 9]);
    });
  });

  describe("Straight", () => {
    it("detects straight", () => {
      const hand = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "Th", "3d", "7c"));
      expect(hand.handType).toBe("straight");
      expect(hand.kickers[0]).toBe(14);
    });

    it("detects ace-low straight (wheel)", () => {
      const hand = evaluateHand(cards("5h", "4d", "3c", "2s", "Ah", "Kd", "9c"));
      expect(hand.handType).toBe("straight");
      expect(hand.kickers[0]).toBe(5);
    });

    it("higher straight beats lower", () => {
      const a = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "Th", "3d", "7c"));
      const b = evaluateHand(cards("Kh", "Qd", "Jc", "Ts", "9h", "3d", "2c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("same straight is a tie", () => {
      const a = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "Th", "3d", "7c"));
      const b = evaluateHand(cards("Ad", "Kh", "Qs", "Jc", "Td", "4s", "8h"));
      expect(compareHands(a, b)).toBe(0);
    });
  });

  describe("Three of a Kind", () => {
    it("detects three of a kind", () => {
      const hand = evaluateHand(cards("Ah", "Ad", "Ac", "Ks", "9h", "7d", "3c"));
      expect(hand.handType).toBe("three_of_a_kind");
      expect(hand.kickers[0]).toBe(14);
    });

    it("higher trips beat lower trips", () => {
      const a = evaluateHand(cards("Ah", "Ad", "Ac", "Ks", "9h", "7d", "3c"));
      const b = evaluateHand(cards("Kh", "Kd", "Kc", "As", "9h", "7d", "3c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("same trips — kickers break tie", () => {
      const a = evaluateHand(cards("Ah", "Ad", "Ac", "Ks", "Qh", "7d", "3c"));
      const b = evaluateHand(cards("Ah", "Ad", "Ac", "Ks", "Jh", "7d", "3c"));
      expect(compareHands(a, b)).toBe(-1);
    });
  });

  describe("Two Pair", () => {
    it("detects two pair", () => {
      const hand = evaluateHand(cards("Ah", "Ad", "Kc", "Ks", "9h", "7d", "3c"));
      expect(hand.handType).toBe("two_pair");
    });

    it("higher top pair wins", () => {
      const a = evaluateHand(cards("Ah", "Ad", "Kc", "Ks", "9h", "7d", "3c"));
      const b = evaluateHand(cards("Kh", "Kd", "Qc", "Qs", "Ah", "7d", "3c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("same top pair — higher second pair wins", () => {
      const a = evaluateHand(cards("Ah", "Ad", "Kc", "Ks", "9h", "7d", "3c"));
      const b = evaluateHand(cards("Ah", "Ad", "Qc", "Qs", "Kh", "7d", "3c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("same two pair — kicker breaks tie", () => {
      const a = evaluateHand(cards("Ah", "Ad", "Kc", "Ks", "Qh", "7d", "3c"));
      const b = evaluateHand(cards("Ah", "Ad", "Kc", "Ks", "Jh", "7d", "3c"));
      expect(compareHands(a, b)).toBe(-1);
    });
  });

  describe("One Pair", () => {
    it("detects one pair", () => {
      const hand = evaluateHand(cards("Ah", "Ad", "Kc", "Qs", "9h", "7d", "3c"));
      expect(hand.handType).toBe("one_pair");
    });

    it("higher pair wins", () => {
      const a = evaluateHand(cards("Ah", "Ad", "Kc", "Qs", "9h", "7d", "3c"));
      const b = evaluateHand(cards("Kh", "Kd", "Ac", "Qs", "9h", "7d", "3c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("same pair — kickers break tie", () => {
      const a = evaluateHand(cards("Ah", "Ad", "Kc", "Qs", "9h", "7d", "3c"));
      const b = evaluateHand(cards("Ah", "Ad", "Kc", "Js", "9h", "7d", "3c"));
      expect(compareHands(a, b)).toBe(-1);
    });
  });

  describe("High Card", () => {
    it("detects high card", () => {
      const hand = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "9h", "7d", "3c"));
      expect(hand.handType).toBe("high_card");
    });

    it("higher card wins", () => {
      const a = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "9h", "7d", "3c"));
      const b = evaluateHand(cards("Kh", "Qd", "Jc", "9s", "8h", "7d", "3c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("same top cards — lower kickers break tie", () => {
      const a = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "9h", "7d", "3c"));
      const b = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "8h", "7d", "3c"));
      expect(compareHands(a, b)).toBe(-1);
    });

    it("exact same values tie", () => {
      const a = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "9h", "7d", "3c"));
      const b = evaluateHand(cards("Ad", "Kh", "Qs", "Jc", "9d", "6h", "2s"));
      expect(compareHands(a, b)).toBe(0);
    });
  });
});

// ============================================================
// Hand Ranking Order Tests
// ============================================================

describe("hand ranking order", () => {
  const royalFlush = evaluateHand(cards("Ah", "Kh", "Qh", "Jh", "Th", "3d", "7c"));
  const straightFlush = evaluateHand(cards("9h", "8h", "7h", "6h", "5h", "2d", "3c"));
  const fourKind = evaluateHand(cards("Ah", "Ad", "Ac", "As", "Kh", "3d", "7c"));
  const fullHouse = evaluateHand(cards("Ah", "Ad", "Ac", "Kh", "Kd", "3s", "7c"));
  const flush = evaluateHand(cards("Ah", "Jh", "9h", "7h", "3h", "2d", "Kc"));
  const straight = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "Th", "3d", "7c"));
  const threeKind = evaluateHand(cards("Ah", "Ad", "Ac", "Ks", "9h", "7d", "3c"));
  const twoPair = evaluateHand(cards("Ah", "Ad", "Kc", "Ks", "9h", "7d", "3c"));
  const onePair = evaluateHand(cards("Ah", "Ad", "Kc", "Qs", "9h", "7d", "3c"));
  const highCard = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "9h", "7d", "3c"));

  const allHands = [
    royalFlush,
    straightFlush,
    fourKind,
    fullHouse,
    flush,
    straight,
    threeKind,
    twoPair,
    onePair,
    highCard,
  ];

  it("each hand type beats all weaker hand types", () => {
    for (let i = 0; i < allHands.length; i++) {
      for (let j = i + 1; j < allHands.length; j++) {
        expect(compareHands(allHands[i], allHands[j])).toBe(-1);
      }
    }
  });
});

// ============================================================
// determineWinners Tests
// ============================================================

describe("determineWinners", () => {
  it("single winner", () => {
    const player1 = cards("Ah", "Kh", "Qh", "Jh", "Th", "3d", "7c"); // royal flush
    const player2 = cards("9d", "8d", "7d", "6d", "5d", "2c", "3s"); // straight flush
    expect(determineWinners([player1, player2])).toEqual([0]);
  });

  it("split pot on tie", () => {
    // Both have the same straight (A-K-Q-J-T)
    const player1 = cards("Ah", "Kd", "Qc", "Js", "Th", "3d", "7c");
    const player2 = cards("Ad", "Kh", "Qs", "Jc", "Td", "4s", "8h");
    expect(determineWinners([player1, player2])).toEqual([0, 1]);
  });

  it("three players — one winner", () => {
    const player1 = cards("Ah", "Ad", "Kc", "Qs", "9h", "7d", "3c"); // pair of aces
    const player2 = cards("Kh", "Kd", "Ac", "Qs", "9h", "7d", "3c"); // pair of kings
    const player3 = cards("Qh", "Qd", "Ac", "Ks", "9h", "7d", "3c"); // pair of queens
    expect(determineWinners([player1, player2, player3])).toEqual([0]);
  });

  it("three players — two-way tie", () => {
    // Same straight for players 0 and 2
    const player1 = cards("Ah", "Kd", "Qc", "Js", "Th", "3d", "7c");
    const player2 = cards("9h", "9d", "2c", "3s", "4h", "6d", "8c"); // pair of 9s
    const player3 = cards("Ad", "Kh", "Qs", "Jc", "Td", "4s", "8h");
    expect(determineWinners([player1, player2, player3])).toEqual([0, 2]);
  });
});

// ============================================================
// Edge Cases
// ============================================================

describe("edge cases", () => {
  it("exactly 5 cards works", () => {
    const hand = evaluateHand(cards("Ah", "Kd", "Qc", "Js", "9h"));
    expect(hand.handType).toBe("high_card");
  });

  it("6 cards works", () => {
    const hand = evaluateHand(cards("Ah", "Ad", "Kd", "Qc", "Js", "9h"));
    expect(hand.handType).toBe("one_pair");
  });

  it("prefers flush over straight when both present (flush ranks higher)", () => {
    // A flush should beat a straight
    const hand = evaluateHand(cards("Ah", "Qh", "Th", "8h", "6h", "Kd", "Qd"));
    expect(hand.handType).toBe("flush");
  });

  it("handles board-plays (community cards are the best hand)", () => {
    // Community: A-K-Q-J-T straight. Hole cards are low.
    const hand = evaluateHand(cards("2h", "3d", "Ac", "Ks", "Qh", "Jd", "Tc"));
    expect(hand.handType).toBe("straight");
    expect(hand.kickers[0]).toBe(14);
  });

  it("three pairs — picks best two pair + best kicker", () => {
    const hand = evaluateHand(cards("Ah", "Ad", "Kc", "Ks", "Qh", "Qd", "3c"));
    expect(hand.handType).toBe("two_pair");
    // Should pick aces and kings with queen kicker
    expect(hand.kickers).toEqual([14, 13, 12]);
  });
});
