import { describe, it, expect } from "vitest";
import { calculatePots, distributePots } from "../pot.js";

describe("calculatePots", () => {
  it("creates a single main pot when all contribute equally", () => {
    const contributions = [
      { playerId: "A", amount: 100 },
      { playerId: "B", amount: 100 },
      { playerId: "C", amount: 100 },
    ];
    const pots = calculatePots(contributions, new Set());
    expect(pots).toEqual([
      { amount: 300, eligiblePlayerIds: ["A", "B", "C"] },
    ]);
  });

  it("creates side pots for all-in at different levels", () => {
    const contributions = [
      { playerId: "A", amount: 50 },   // all-in short
      { playerId: "B", amount: 200 },
      { playerId: "C", amount: 200 },
    ];
    const pots = calculatePots(contributions, new Set());
    expect(pots).toHaveLength(2);
    expect(pots[0]).toEqual({ amount: 150, eligiblePlayerIds: ["A", "B", "C"] });
    expect(pots[1]).toEqual({ amount: 300, eligiblePlayerIds: ["B", "C"] });
  });

  it("creates multiple side pots for multiple all-in levels", () => {
    const contributions = [
      { playerId: "A", amount: 30 },
      { playerId: "B", amount: 80 },
      { playerId: "C", amount: 200 },
      { playerId: "D", amount: 200 },
    ];
    const pots = calculatePots(contributions, new Set());
    expect(pots).toHaveLength(3);
    expect(pots[0]).toEqual({ amount: 120, eligiblePlayerIds: ["A", "B", "C", "D"] });
    expect(pots[1]).toEqual({ amount: 150, eligiblePlayerIds: ["B", "C", "D"] });
    expect(pots[2]).toEqual({ amount: 240, eligiblePlayerIds: ["C", "D"] });
  });

  it("excludes folded players from eligibility but includes their contributions", () => {
    const contributions = [
      { playerId: "A", amount: 100 },
      { playerId: "B", amount: 100 },
      { playerId: "C", amount: 50 },  // folded after putting in 50
    ];
    const pots = calculatePots(contributions, new Set(["C"]));
    expect(pots).toHaveLength(2);
    // Main pot: 50 * 3 = 150, eligible: A, B (not C)
    expect(pots[0]).toEqual({ amount: 150, eligiblePlayerIds: ["A", "B"] });
    // Side pot: (100 - 50) * 2 = 100, eligible: A, B
    expect(pots[1]).toEqual({ amount: 100, eligiblePlayerIds: ["A", "B"] });
  });

  it("handles folded player with higher contribution (dead money)", () => {
    const contributions = [
      { playerId: "A", amount: 100 },
      { playerId: "B", amount: 200 },  // folded
      { playerId: "C", amount: 200 },
    ];
    const pots = calculatePots(contributions, new Set(["B"]));
    expect(pots).toHaveLength(2);
    expect(pots[0]).toEqual({ amount: 300, eligiblePlayerIds: ["A", "C"] });
    // Side pot: (200-100)*2 = 200, eligible: only C (B folded)
    expect(pots[1]).toEqual({ amount: 200, eligiblePlayerIds: ["C"] });
  });

  it("rolls over pot amount when all contributors at a level folded", () => {
    // A: 50 (all-in), B: 100 (folded), C: 200
    // Level 50: pot = 150, eligible = A, C → pot created
    // Level 100: pot = (100-50)*2 = 100, eligible = C only (B folded) → pot created
    // Level 200: pot = (200-100)*1 = 100, eligible = C → pot created
    const contributions = [
      { playerId: "A", amount: 50 },
      { playerId: "B", amount: 100 },
      { playerId: "C", amount: 200 },
    ];
    const pots = calculatePots(contributions, new Set(["B"]));
    expect(pots[0]).toEqual({ amount: 150, eligiblePlayerIds: ["A", "C"] });
    expect(pots[1]).toEqual({ amount: 100, eligiblePlayerIds: ["C"] });
    expect(pots[2]).toEqual({ amount: 100, eligiblePlayerIds: ["C"] });
  });

  it("handles single player (everyone else folded)", () => {
    const contributions = [
      { playerId: "A", amount: 100 },
      { playerId: "B", amount: 20 },
    ];
    const pots = calculatePots(contributions, new Set(["B"]));
    expect(pots).toHaveLength(2);
    expect(pots[0].eligiblePlayerIds).toEqual(["A"]);
  });

  it("returns empty for no contributions", () => {
    expect(calculatePots([], new Set())).toEqual([]);
  });

  it("returns empty when all contributions are zero", () => {
    const contributions = [
      { playerId: "A", amount: 0 },
      { playerId: "B", amount: 0 },
    ];
    expect(calculatePots(contributions, new Set())).toEqual([]);
  });

  it("handles all-in for less than others with a fold", () => {
    // A all-in 30, B bets 100, C folds with 50 in
    const contributions = [
      { playerId: "A", amount: 30 },
      { playerId: "B", amount: 100 },
      { playerId: "C", amount: 50 },
    ];
    const pots = calculatePots(contributions, new Set(["C"]));
    // Level 30: 3 * 30 = 90, eligible: A, B
    expect(pots[0]).toEqual({ amount: 90, eligiblePlayerIds: ["A", "B"] });
    // Level 50: (50-30) * 2 = 40, eligible: B (C folded)
    expect(pots[1]).toEqual({ amount: 40, eligiblePlayerIds: ["B"] });
    // Level 100: (100-50) * 1 = 50, eligible: B
    expect(pots[2]).toEqual({ amount: 50, eligiblePlayerIds: ["B"] });
  });
});

describe("distributePots", () => {
  it("awards single pot to single winner", () => {
    const pots = [{ amount: 300, eligiblePlayerIds: ["A", "B", "C"] }];
    const payouts = distributePots(pots, () => ["A"]);
    expect(payouts.get("A")).toBe(300);
    expect(payouts.size).toBe(1);
  });

  it("splits pot equally between two winners", () => {
    const pots = [{ amount: 200, eligiblePlayerIds: ["A", "B"] }];
    const payouts = distributePots(pots, () => ["A", "B"]);
    expect(payouts.get("A")).toBe(100);
    expect(payouts.get("B")).toBe(100);
  });

  it("gives odd chip to first winner on uneven split", () => {
    const pots = [{ amount: 301, eligiblePlayerIds: ["A", "B"] }];
    const payouts = distributePots(pots, () => ["A", "B"]);
    expect(payouts.get("A")).toBe(151);
    expect(payouts.get("B")).toBe(150);
  });

  it("distributes odd chips across 3-way split", () => {
    const pots = [{ amount: 100, eligiblePlayerIds: ["A", "B", "C"] }];
    const payouts = distributePots(pots, () => ["A", "B", "C"]);
    // 100 / 3 = 33 remainder 1
    expect(payouts.get("A")).toBe(34);
    expect(payouts.get("B")).toBe(33);
    expect(payouts.get("C")).toBe(33);
  });

  it("handles side pots with different winners", () => {
    const pots = [
      { amount: 150, eligiblePlayerIds: ["A", "B", "C"] },
      { amount: 200, eligiblePlayerIds: ["B", "C"] },
    ];
    // A wins main pot, B wins side pot
    const payouts = distributePots(pots, (eligible) => {
      if (eligible.includes("A")) return ["A"];
      return ["B"];
    });
    expect(payouts.get("A")).toBe(150);
    expect(payouts.get("B")).toBe(200);
  });

  it("accumulates winnings across multiple pots for same winner", () => {
    const pots = [
      { amount: 100, eligiblePlayerIds: ["A", "B"] },
      { amount: 200, eligiblePlayerIds: ["A", "B"] },
    ];
    const payouts = distributePots(pots, () => ["A"]);
    expect(payouts.get("A")).toBe(300);
  });

  it("handles empty pots array", () => {
    const payouts = distributePots([], () => []);
    expect(payouts.size).toBe(0);
  });

  it("handles getWinners returning empty (no winners)", () => {
    const pots = [{ amount: 100, eligiblePlayerIds: ["A", "B"] }];
    const payouts = distributePots(pots, () => []);
    expect(payouts.size).toBe(0);
  });
});
