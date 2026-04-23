import { describe, it, expect } from "vitest";
import {
  postBlinds,
  getPreFlopOrder,
  getPostFlopOrder,
  createBettingRound,
  getCurrentPlayerId,
  getValidActions,
  applyAction,
  getActivePlayers,
  getContributions,
  getFoldedPlayerIds,
  prepareNextRound,
} from "../betting.js";

// ============================================================
// postBlinds
// ============================================================

describe("postBlinds", () => {
  it("posts blinds for 3 players", () => {
    const players = [
      { id: "A", chips: 1000 },
      { id: "B", chips: 1000 },
      { id: "C", chips: 1000 },
    ];
    const result = postBlinds(players, 0, 10, 20);
    // Dealer=A(0), SB=B(1), BB=C(2)
    expect(result.players[0].chips).toBe(1000); // dealer
    expect(result.players[1].chips).toBe(990);  // SB posted 10
    expect(result.players[1].currentBet).toBe(10);
    expect(result.players[2].chips).toBe(980);  // BB posted 20
    expect(result.players[2].currentBet).toBe(20);
    expect(result.pot).toBe(30);
    expect(result.currentBet).toBe(20);
  });

  it("posts blinds for heads-up (dealer = SB)", () => {
    const players = [
      { id: "A", chips: 500 },
      { id: "B", chips: 500 },
    ];
    const result = postBlinds(players, 0, 10, 20);
    // Dealer(0)=SB, Player(1)=BB
    expect(result.players[0].chips).toBe(490); // SB
    expect(result.players[0].currentBet).toBe(10);
    expect(result.players[1].chips).toBe(480); // BB
    expect(result.players[1].currentBet).toBe(20);
    expect(result.pot).toBe(30);
    expect(result.currentBet).toBe(20);
  });

  it("handles player who cannot cover big blind (all-in)", () => {
    const players = [
      { id: "A", chips: 1000 },
      { id: "B", chips: 1000 },
      { id: "C", chips: 5 }, // BB can only post 5
    ];
    const result = postBlinds(players, 0, 10, 20);
    expect(result.players[2].chips).toBe(0);
    expect(result.players[2].currentBet).toBe(5);
    expect(result.players[2].status).toBe("all_in");
    expect(result.pot).toBe(15); // 10 SB + 5 BB
    expect(result.currentBet).toBe(10); // SB is the max bet
  });

  it("handles player who cannot cover small blind", () => {
    const players = [
      { id: "A", chips: 1000 },
      { id: "B", chips: 3 }, // SB can only post 3
      { id: "C", chips: 1000 },
    ];
    const result = postBlinds(players, 0, 10, 20);
    expect(result.players[1].chips).toBe(0);
    expect(result.players[1].currentBet).toBe(3);
    expect(result.players[1].status).toBe("all_in");
    expect(result.pot).toBe(23);
  });

  it("posts antes", () => {
    const players = [
      { id: "A", chips: 1000 },
      { id: "B", chips: 1000 },
      { id: "C", chips: 1000 },
    ];
    const result = postBlinds(players, 0, 10, 20, 5);
    // Each player antes 5, then SB=10, BB=20
    expect(result.players[0].chips).toBe(995);  // ante only
    expect(result.players[0].totalBet).toBe(5);
    expect(result.players[0].currentBet).toBe(0); // ante doesn't count as bet
    expect(result.players[1].chips).toBe(985);  // ante + SB
    expect(result.players[1].totalBet).toBe(15);
    expect(result.players[1].currentBet).toBe(10);
    expect(result.players[2].chips).toBe(975);  // ante + BB
    expect(result.players[2].totalBet).toBe(25);
    expect(result.players[2].currentBet).toBe(20);
    expect(result.pot).toBe(45);
  });

  it("handles ante causing all-in before blind", () => {
    const players = [
      { id: "A", chips: 1000 },
      { id: "B", chips: 3 }, // SB all-in from ante
      { id: "C", chips: 1000 },
    ];
    const result = postBlinds(players, 0, 10, 20, 5);
    // B antes 3 (all they have), goes all-in, can't post SB
    expect(result.players[1].chips).toBe(0);
    expect(result.players[1].totalBet).toBe(3);
    expect(result.players[1].currentBet).toBe(0); // couldn't post blind
    expect(result.players[1].status).toBe("all_in");
  });

  it("throws with fewer than 2 players", () => {
    expect(() => postBlinds([{ id: "A", chips: 100 }], 0, 5, 10)).toThrow();
  });
});

// ============================================================
// Action Order
// ============================================================

describe("getPreFlopOrder", () => {
  it("heads-up: dealer acts first", () => {
    const order = getPreFlopOrder(["A", "B"], 0);
    expect(order).toEqual(["A", "B"]); // dealer first
  });

  it("3 players: UTG acts first", () => {
    // Dealer=0, SB=1, BB=2, UTG=0 (wraps)
    const order = getPreFlopOrder(["A", "B", "C"], 0);
    expect(order).toEqual(["A", "B", "C"]); // UTG=(0+3)%3=0
  });

  it("4 players: UTG is left of BB", () => {
    // Dealer=1, SB=2, BB=3, UTG=0
    const order = getPreFlopOrder(["A", "B", "C", "D"], 1);
    expect(order).toEqual(["A", "B", "C", "D"]); // UTG=(1+3)%4=0
  });

  it("6 players: correct order", () => {
    // Dealer=2, SB=3, BB=4, UTG=5
    const ids = ["P0", "P1", "P2", "P3", "P4", "P5"];
    const order = getPreFlopOrder(ids, 2);
    expect(order).toEqual(["P5", "P0", "P1", "P2", "P3", "P4"]);
  });
});

describe("getPostFlopOrder", () => {
  it("heads-up: BB acts first", () => {
    const order = getPostFlopOrder(["A", "B"], 0);
    expect(order).toEqual(["B", "A"]); // BB first
  });

  it("3 players: SB acts first", () => {
    const order = getPostFlopOrder(["A", "B", "C"], 0);
    expect(order).toEqual(["B", "C", "A"]); // SB=(0+1)%3=1
  });

  it("4 players: left of dealer first", () => {
    const order = getPostFlopOrder(["A", "B", "C", "D"], 2);
    expect(order).toEqual(["D", "A", "B", "C"]); // SB=(2+1)%4=3
  });
});

// ============================================================
// createBettingRound
// ============================================================

describe("createBettingRound", () => {
  it("creates pre-flop round with correct initial state", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 990, currentBet: 10, totalBet: 10, status: "active" as const },
      { id: "C", chips: 980, currentBet: 20, totalBet: 20, status: "active" as const },
    ];
    const order = ["A", "B", "C"];
    const state = createBettingRound(players, order, 20, 20, true);

    expect(state.currentBet).toBe(20);
    expect(state.minRaise).toBe(20);
    expect(state.isPreFlop).toBe(true);
    expect(state.roundComplete).toBe(false);
    expect(getCurrentPlayerId(state)).toBe("A");
  });

  it("detects round complete when all players are all-in", () => {
    const players = [
      { id: "A", chips: 0, currentBet: 100, totalBet: 100, status: "all_in" as const },
      { id: "B", chips: 0, currentBet: 100, totalBet: 100, status: "all_in" as const },
    ];
    const state = createBettingRound(players, ["A", "B"], 100, 20, true);
    expect(state.roundComplete).toBe(true);
  });

  it("skips folded players for first active", () => {
    const players = [
      { id: "A", chips: 500, currentBet: 0, totalBet: 50, status: "folded" as const },
      { id: "B", chips: 500, currentBet: 0, totalBet: 50, status: "active" as const },
      { id: "C", chips: 500, currentBet: 0, totalBet: 50, status: "active" as const },
    ];
    const state = createBettingRound(players, ["A", "B", "C"], 0, 20, false);
    expect(getCurrentPlayerId(state)).toBe("B");
  });
});

// ============================================================
// getValidActions
// ============================================================

describe("getValidActions", () => {
  function makeState(overrides: Partial<{
    chips: number;
    currentBetPlayer: number;
    currentBetState: number;
    minRaise: number;
    bigBlind: number;
  }> = {}) {
    const chips = overrides.chips ?? 1000;
    const pBet = overrides.currentBetPlayer ?? 0;
    const sBet = overrides.currentBetState ?? 0;
    const players = [
      { id: "P", chips, currentBet: pBet, totalBet: pBet, needsToAct: true, status: "active" as const },
      { id: "Q", chips: 1000, currentBet: 0, totalBet: 0, needsToAct: true, status: "active" as const },
    ];
    return createBettingRound(
      players.map(({ needsToAct, ...p }) => p),
      ["P", "Q"],
      sBet,
      overrides.bigBlind ?? 20,
      false
    );
  }

  it("allows check when no bet", () => {
    const valid = getValidActions(makeState());
    expect(valid.canCheck).toBe(true);
    expect(valid.canCall).toBe(false);
    expect(valid.canBet).toBe(true);
    expect(valid.canRaise).toBe(false);
  });

  it("allows call/raise when there is a bet", () => {
    const valid = getValidActions(makeState({ currentBetState: 40 }));
    expect(valid.canCheck).toBe(false);
    expect(valid.canCall).toBe(true);
    expect(valid.callAmount).toBe(40);
    expect(valid.canBet).toBe(false);
    expect(valid.canRaise).toBe(true);
    expect(valid.minRaise).toBe(60); // 40 + 20 (bigBlind as min raise)
    expect(valid.maxRaise).toBe(1000); // 0 + 1000
  });

  it("cannot call when chips are insufficient", () => {
    const valid = getValidActions(makeState({ currentBetState: 40, chips: 30 }));
    expect(valid.canCall).toBe(false);
    expect(valid.canAllIn).toBe(true);
    expect(valid.allInAmount).toBe(30);
  });

  it("min bet is big blind or remaining chips", () => {
    const valid = getValidActions(makeState({ chips: 10, bigBlind: 20 }));
    expect(valid.canBet).toBe(true);
    expect(valid.minBet).toBe(10); // can't afford full BB
    expect(valid.maxBet).toBe(10);
  });

  it("raise range with existing bet", () => {
    // Player has 1000 chips, currentBet=0, state currentBet=60, minRaise=20
    const state = createBettingRound(
      [
        { id: "P", chips: 1000, currentBet: 0, totalBet: 0, status: "active" },
        { id: "Q", chips: 1000, currentBet: 60, totalBet: 60, status: "active" },
      ],
      ["P", "Q"],
      60,
      20,
      false
    );
    const valid = getValidActions(state);
    expect(valid.canRaise).toBe(true);
    expect(valid.minRaise).toBe(80); // 60 + 20
    expect(valid.maxRaise).toBe(1000); // 0 + 1000
  });

  it("returns no actions when round is complete", () => {
    const players = [
      { id: "A", chips: 0, currentBet: 100, totalBet: 100, status: "all_in" as const },
      { id: "B", chips: 0, currentBet: 100, totalBet: 100, status: "all_in" as const },
    ];
    const state = createBettingRound(players, ["A", "B"], 100, 20, false);
    const valid = getValidActions(state);
    expect(valid.canFold).toBe(false);
    expect(valid.canAllIn).toBe(false);
  });
});

// ============================================================
// applyAction — core betting flows
// ============================================================

describe("applyAction", () => {
  function threePlayerPreFlop() {
    // Dealer=A(0), SB=B(1), BB=C(2). Pre-flop order: A, B, C
    const blinds = postBlinds(
      [
        { id: "A", chips: 1000 },
        { id: "B", chips: 1000 },
        { id: "C", chips: 1000 },
      ],
      0, 10, 20
    );
    const order = getPreFlopOrder(["A", "B", "C"], 0);
    return createBettingRound(blinds.players, order, blinds.currentBet, 20, true);
  }

  it("call-call-check completes the round", () => {
    let state = threePlayerPreFlop();
    // A(UTG) calls 20
    state = applyAction(state, "call");
    expect(state.roundComplete).toBe(false);
    // B(SB) calls 20 (puts in 10 more)
    state = applyAction(state, "call");
    expect(state.roundComplete).toBe(false);
    // C(BB) checks
    state = applyAction(state, "check");
    expect(state.roundComplete).toBe(true);

    const contribs = getContributions(state);
    expect(contribs.every((c) => c.amount === 20)).toBe(true);
  });

  it("fold-fold ends with last player standing", () => {
    let state = threePlayerPreFlop();
    state = applyAction(state, "fold"); // A folds
    state = applyAction(state, "fold"); // B folds
    expect(state.roundComplete).toBe(true);
    // Only C remains
    const active = getActivePlayers(state);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("C");
  });

  it("raise reopens action for all players", () => {
    let state = threePlayerPreFlop();
    // A calls 20
    state = applyAction(state, "call");
    // B raises to 60
    state = applyAction(state, "raise", 60);
    expect(state.currentBet).toBe(60);
    expect(state.roundComplete).toBe(false);
    // C must act (call/fold/raise)
    expect(getCurrentPlayerId(state)).toBe("C");
    state = applyAction(state, "call"); // C calls 60
    // A must act again (raise reopened)
    expect(getCurrentPlayerId(state)).toBe("A");
    expect(state.roundComplete).toBe(false);
    state = applyAction(state, "call"); // A calls 60
    expect(state.roundComplete).toBe(true);
  });

  it("min raise tracks correctly through multiple raises", () => {
    let state = threePlayerPreFlop();
    // A raises to 60 (raise of 40 from BB 20)
    state = applyAction(state, "raise", 60);
    expect(state.minRaise).toBe(40); // last raise increment
    // B raises to 140 (raise of 80)
    state = applyAction(state, "raise", 140);
    expect(state.minRaise).toBe(80);
    // C must raise to at least 140+80=220
    const valid = getValidActions(state);
    expect(valid.minRaise).toBe(220);
  });

  it("fold produces correct foldedPlayerIds", () => {
    let state = threePlayerPreFlop();
    state = applyAction(state, "fold"); // A folds
    const folded = getFoldedPlayerIds(state);
    expect(folded.has("A")).toBe(true);
    expect(folded.size).toBe(1);
  });

  it("check completes a post-flop round", () => {
    // Post-flop: no bets, order B, C, A
    const players = [
      { id: "A", chips: 980, currentBet: 0, totalBet: 20, status: "active" as const },
      { id: "B", chips: 990, currentBet: 0, totalBet: 10, status: "active" as const },
      { id: "C", chips: 980, currentBet: 0, totalBet: 20, status: "active" as const },
    ];
    const order = getPostFlopOrder(["A", "B", "C"], 0);
    let state = createBettingRound(players, order, 0, 20, false);
    state = applyAction(state, "check"); // B checks
    state = applyAction(state, "check"); // C checks
    state = applyAction(state, "check"); // A checks
    expect(state.roundComplete).toBe(true);
  });

  it("bet then call completes a post-flop round", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
    ];
    let state = createBettingRound(players, ["A", "B"], 0, 20, false);
    state = applyAction(state, "bet", 50);
    expect(state.currentBet).toBe(50);
    expect(state.roundComplete).toBe(false);
    state = applyAction(state, "call");
    expect(state.roundComplete).toBe(true);
  });
});

// ============================================================
// All-in scenarios
// ============================================================

describe("all-in", () => {
  it("all-in call uses remaining chips", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 30, currentBet: 0, totalBet: 0, status: "active" as const },
    ];
    let state = createBettingRound(players, ["A", "B"], 0, 20, false);
    state = applyAction(state, "bet", 100); // A bets 100
    // B can't call 100, goes all-in
    state = applyAction(state, "all_in");
    expect(state.players.find((p) => p.id === "B")!.currentBet).toBe(30);
    expect(state.players.find((p) => p.id === "B")!.status).toBe("all_in");
    // Partial raise (30 < 100 + minRaise) — doesn't reopen
    expect(state.roundComplete).toBe(true);
  });

  it("all-in full raise reopens action", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 200, currentBet: 0, totalBet: 0, status: "active" as const },
    ];
    let state = createBettingRound(players, ["A", "B"], 0, 20, false);
    state = applyAction(state, "bet", 50); // A bets 50
    // B all-in 200, which is >= 50 + 50(minRaise) = 100 → full raise
    state = applyAction(state, "all_in");
    expect(state.currentBet).toBe(200);
    expect(state.roundComplete).toBe(false); // A needs to act
    state = applyAction(state, "call");
    expect(state.roundComplete).toBe(true);
  });

  it("all-in partial raise does not reopen", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 70, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "C", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
    ];
    let state = createBettingRound(players, ["A", "B", "C"], 0, 20, false);
    state = applyAction(state, "bet", 50);  // A bets 50
    state = applyAction(state, "all_in");   // B all-in 70 (partial raise, < 50+50)
    expect(state.currentBet).toBe(70);
    // C still needs to act (hasn't acted yet)
    expect(getCurrentPlayerId(state)).toBe("C");
    state = applyAction(state, "call");     // C calls 70
    // A should NOT need to act again (partial raise doesn't reopen)
    expect(state.roundComplete).toBe(true);
  });

  it("all players all-in ends the round", () => {
    const players = [
      { id: "A", chips: 100, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 100, currentBet: 0, totalBet: 0, status: "active" as const },
    ];
    let state = createBettingRound(players, ["A", "B"], 0, 20, false);
    state = applyAction(state, "all_in"); // A all-in
    state = applyAction(state, "all_in"); // B all-in
    expect(state.roundComplete).toBe(true);
  });

  it("call that uses all chips sets all_in status", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 50, currentBet: 0, totalBet: 0, status: "active" as const },
    ];
    let state = createBettingRound(players, ["A", "B"], 0, 20, false);
    state = applyAction(state, "bet", 50);
    state = applyAction(state, "call"); // B calls exactly 50 (all chips)
    const b = state.players.find((p) => p.id === "B")!;
    expect(b.status).toBe("all_in");
    expect(b.chips).toBe(0);
    expect(state.roundComplete).toBe(true);
  });
});

// ============================================================
// Error cases
// ============================================================

describe("action validation errors", () => {
  it("throws on check when bet exists", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 1000, currentBet: 50, totalBet: 50, status: "active" as const },
    ];
    const state = createBettingRound(players, ["A", "B"], 50, 20, false);
    expect(() => applyAction(state, "check")).toThrow("Cannot check");
  });

  it("throws on call when nothing to call", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
    ];
    const state = createBettingRound(players, ["A", "B"], 0, 20, false);
    expect(() => applyAction(state, "call")).toThrow("Nothing to call");
  });

  it("throws on bet when bet exists", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 1000, currentBet: 50, totalBet: 50, status: "active" as const },
    ];
    const state = createBettingRound(players, ["A", "B"], 50, 20, false);
    expect(() => applyAction(state, "bet", 60)).toThrow("Cannot bet");
  });

  it("throws on raise when no bet", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
    ];
    const state = createBettingRound(players, ["A", "B"], 0, 20, false);
    expect(() => applyAction(state, "raise", 40)).toThrow("Cannot raise");
  });

  it("throws on bet below minimum", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
    ];
    const state = createBettingRound(players, ["A", "B"], 0, 20, false);
    expect(() => applyAction(state, "bet", 10)).toThrow("at least");
  });

  it("throws on raise below minimum", () => {
    const players = [
      { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" as const },
      { id: "B", chips: 1000, currentBet: 50, totalBet: 50, status: "active" as const },
    ];
    const state = createBettingRound(players, ["A", "B"], 50, 20, false);
    // min raise = 50 + 20 = 70
    expect(() => applyAction(state, "raise", 60)).toThrow("at least");
  });

  it("throws when round is complete", () => {
    const players = [
      { id: "A", chips: 0, currentBet: 100, totalBet: 100, status: "all_in" as const },
      { id: "B", chips: 0, currentBet: 100, totalBet: 100, status: "all_in" as const },
    ];
    const state = createBettingRound(players, ["A", "B"], 100, 20, false);
    expect(() => applyAction(state, "fold")).toThrow("already complete");
  });
});

// ============================================================
// Utilities
// ============================================================

describe("utilities", () => {
  it("getContributions returns totalBet per player", () => {
    const players = [
      { id: "A", chips: 900, currentBet: 50, totalBet: 100, status: "active" as const },
      { id: "B", chips: 800, currentBet: 50, totalBet: 200, status: "active" as const },
    ];
    const state = createBettingRound(players, ["A", "B"], 50, 20, false);
    const contribs = getContributions(state);
    expect(contribs).toEqual([
      { playerId: "A", amount: 100 },
      { playerId: "B", amount: 200 },
    ]);
  });

  it("prepareNextRound resets currentBet but keeps totalBet", () => {
    const players = [
      { id: "A", chips: 900, currentBet: 50, totalBet: 100, status: "active" as const },
      { id: "B", chips: 800, currentBet: 50, totalBet: 200, status: "folded" as const },
    ];
    const state = createBettingRound(players, ["A", "B"], 50, 20, false);
    const next = prepareNextRound(state);
    expect(next[0].currentBet).toBe(0);
    expect(next[0].totalBet).toBe(100);
    expect(next[1].currentBet).toBe(0);
    expect(next[1].totalBet).toBe(200);
    expect(next[1].status).toBe("folded");
  });

  it("getActivePlayers excludes folded", () => {
    let state = createBettingRound(
      [
        { id: "A", chips: 1000, currentBet: 0, totalBet: 0, status: "active" },
        { id: "B", chips: 1000, currentBet: 0, totalBet: 0, status: "active" },
        { id: "C", chips: 1000, currentBet: 0, totalBet: 0, status: "active" },
      ],
      ["A", "B", "C"],
      0, 20, false
    );
    state = applyAction(state, "fold");
    const active = getActivePlayers(state);
    expect(active.map((p) => p.id)).toEqual(["B", "C"]);
  });
});

// ============================================================
// Integration: full betting round flow
// ============================================================

describe("full round integration", () => {
  it("pre-flop with raise, call, fold, then post-flop bet-call", () => {
    // 3 players, dealer=0
    const blinds = postBlinds(
      [
        { id: "A", chips: 1000 },
        { id: "B", chips: 1000 },
        { id: "C", chips: 1000 },
      ],
      0, 10, 20
    );

    // Pre-flop
    const preOrder = getPreFlopOrder(["A", "B", "C"], 0);
    let pre = createBettingRound(blinds.players, preOrder, blinds.currentBet, 20, true);
    pre = applyAction(pre, "raise", 60); // A raises to 60
    pre = applyAction(pre, "call");      // B calls 60
    pre = applyAction(pre, "fold");      // C folds
    expect(pre.roundComplete).toBe(true);

    // Verify chip counts
    const pA = pre.players.find((p) => p.id === "A")!;
    const pB = pre.players.find((p) => p.id === "B")!;
    const pC = pre.players.find((p) => p.id === "C")!;
    expect(pA.chips).toBe(940); // 1000 - 60
    expect(pB.chips).toBe(940); // 1000 - 10(SB) - 50(call diff)
    expect(pC.chips).toBe(980); // 1000 - 20(BB)
    expect(pC.status).toBe("folded");

    // Transition to post-flop
    const postPlayers = prepareNextRound(pre);
    const postOrder = getPostFlopOrder(["A", "B", "C"], 0);
    let post = createBettingRound(postPlayers, postOrder, 0, 20, false);

    // B acts first (SB position, but check — C is folded so skip)
    expect(getCurrentPlayerId(post)).toBe("B");
    post = applyAction(post, "bet", 40); // B bets 40
    // C is folded, skip to A
    expect(getCurrentPlayerId(post)).toBe("A");
    post = applyAction(post, "call");    // A calls 40
    expect(post.roundComplete).toBe(true);

    // Check total contributions for pot calculation
    const contribs = getContributions(post);
    expect(contribs.find((c) => c.playerId === "A")!.amount).toBe(100); // 60 + 40
    expect(contribs.find((c) => c.playerId === "B")!.amount).toBe(100); // 60 + 40
    expect(contribs.find((c) => c.playerId === "C")!.amount).toBe(20);  // folded at 20
  });
});
