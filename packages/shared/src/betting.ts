// ============================================================
// Betting Logic — Blinds, actions, round management
// ============================================================

import type { BettingAction } from "./types.js";

// ============================================================
// Types
// ============================================================

export interface BettingPlayer {
  id: string;
  chips: number;
  /** Amount bet in the current betting round. */
  currentBet: number;
  /** Total amount contributed across all rounds (for pot calc). */
  totalBet: number;
  /** Whether this player still needs to act before the round can end. */
  needsToAct: boolean;
  status: "active" | "folded" | "all_in";
}

export interface BettingRoundState {
  players: BettingPlayer[];
  /** Player IDs in action order (full table — folded/all-in are skipped). */
  actionOrder: string[];
  /** Index into actionOrder for the current actor. */
  activePlayerIndex: number;
  /** Highest bet placed this round. */
  currentBet: number;
  /** Minimum raise increment (last raise size or big blind). */
  minRaise: number;
  bigBlind: number;
  isPreFlop: boolean;
  roundComplete: boolean;
}

export interface ValidActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  minBet: number;
  maxBet: number;
  canRaise: boolean;
  /** Minimum "raise to" total. */
  minRaise: number;
  /** Maximum "raise to" total (= currentBet + all remaining chips). */
  maxRaise: number;
  canAllIn: boolean;
  allInAmount: number;
}

export interface BlindPostResult {
  players: {
    id: string;
    chips: number;
    currentBet: number;
    totalBet: number;
    status: "active" | "all_in";
  }[];
  pot: number;
  /** The bet to match (max of actual blind posts). */
  currentBet: number;
}

// ============================================================
// Blind & Ante Posting
// ============================================================

/**
 * Post small blind, big blind, and optional antes.
 * Antes go into totalBet (pot contribution) but NOT currentBet
 * (they don't count as a bet for the betting round).
 */
export function postBlinds(
  players: { id: string; chips: number }[],
  dealerIndex: number,
  smallBlind: number,
  bigBlind: number,
  ante: number = 0
): BlindPostResult {
  const n = players.length;
  if (n < 2) throw new Error("Need at least 2 players");

  const result: BlindPostResult["players"] = players.map((p) => ({
    id: p.id,
    chips: p.chips,
    currentBet: 0,
    totalBet: 0,
    status: "active" as const,
  }));
  let pot = 0;

  // Post antes (contribute to pot/totalBet but not currentBet)
  if (ante > 0) {
    for (const p of result) {
      const actual = Math.min(ante, p.chips);
      p.chips -= actual;
      p.totalBet += actual;
      pot += actual;
      if (p.chips === 0) p.status = "all_in";
    }
  }

  // Determine blind positions
  const sbIndex = n === 2 ? dealerIndex : (dealerIndex + 1) % n;
  const bbIndex = n === 2 ? (dealerIndex + 1) % 2 : (dealerIndex + 2) % n;

  // Post small blind
  const sbPlayer = result[sbIndex];
  if (sbPlayer.status !== "all_in") {
    const actual = Math.min(smallBlind, sbPlayer.chips);
    sbPlayer.chips -= actual;
    sbPlayer.currentBet += actual;
    sbPlayer.totalBet += actual;
    pot += actual;
    if (sbPlayer.chips === 0) sbPlayer.status = "all_in";
  }

  // Post big blind
  const bbPlayer = result[bbIndex];
  if (bbPlayer.status !== "all_in") {
    const actual = Math.min(bigBlind, bbPlayer.chips);
    bbPlayer.chips -= actual;
    bbPlayer.currentBet += actual;
    bbPlayer.totalBet += actual;
    pot += actual;
    if (bbPlayer.chips === 0) bbPlayer.status = "all_in";
  }

  const maxBet = Math.max(...result.map((p) => p.currentBet));

  return { players: result, pot, currentBet: maxBet };
}

// ============================================================
// Action Order
// ============================================================

/**
 * Pre-flop: UTG (left of BB) acts first. Heads-up: dealer/SB acts first.
 */
export function getPreFlopOrder(
  playerIds: string[],
  dealerIndex: number
): string[] {
  const n = playerIds.length;
  if (n === 2) {
    return [playerIds[dealerIndex], playerIds[(dealerIndex + 1) % 2]];
  }
  const utg = (dealerIndex + 3) % n;
  return Array.from({ length: n }, (_, i) => playerIds[(utg + i) % n]);
}

/**
 * Post-flop: left of dealer (SB) acts first. Heads-up: BB acts first.
 */
export function getPostFlopOrder(
  playerIds: string[],
  dealerIndex: number
): string[] {
  const n = playerIds.length;
  if (n === 2) {
    return [playerIds[(dealerIndex + 1) % 2], playerIds[dealerIndex]];
  }
  const sb = (dealerIndex + 1) % n;
  return Array.from({ length: n }, (_, i) => playerIds[(sb + i) % n]);
}

// ============================================================
// Betting Round
// ============================================================

/**
 * Create a new betting round state.
 *
 * @param players - Player states (from postBlinds or prepareNextRound)
 * @param actionOrder - Player IDs in action order
 * @param currentBet - The bet to match (BB for pre-flop, 0 for post-flop)
 * @param bigBlind - Big blind amount (used for min bet/raise)
 * @param isPreFlop - Whether this is the pre-flop round
 */
export function createBettingRound(
  players: {
    id: string;
    chips: number;
    currentBet: number;
    totalBet: number;
    status: "active" | "folded" | "all_in";
  }[],
  actionOrder: string[],
  currentBet: number,
  bigBlind: number,
  isPreFlop: boolean
): BettingRoundState {
  const bettingPlayers: BettingPlayer[] = players.map((p) => ({
    ...p,
    needsToAct: p.status === "active",
  }));

  const activePlayerIndex = findNextActive(bettingPlayers, actionOrder, 0);
  const roundComplete = checkRoundComplete(bettingPlayers);

  return {
    players: bettingPlayers,
    actionOrder,
    activePlayerIndex,
    currentBet,
    minRaise: bigBlind,
    bigBlind,
    isPreFlop,
    roundComplete,
  };
}

/** Get the ID of the player who needs to act, or null if round is complete. */
export function getCurrentPlayerId(state: BettingRoundState): string | null {
  if (state.roundComplete) return null;
  return state.actionOrder[state.activePlayerIndex] ?? null;
}

/** Get valid actions for the current player. */
export function getValidActions(state: BettingRoundState): ValidActions {
  const playerId = getCurrentPlayerId(state);
  if (!playerId) {
    return {
      canFold: false, canCheck: false, canCall: false, callAmount: 0,
      canBet: false, minBet: 0, maxBet: 0,
      canRaise: false, minRaise: 0, maxRaise: 0,
      canAllIn: false, allInAmount: 0,
    };
  }

  const player = state.players.find((p) => p.id === playerId)!;
  const chips = player.chips;
  const toCall = state.currentBet - player.currentBet;

  const canCheck = toCall <= 0;
  const canCall = toCall > 0 && chips >= toCall;
  const callAmount = canCall ? toCall : 0;

  const canBet = state.currentBet === 0 && chips > 0;
  const minBet = canBet ? Math.min(state.bigBlind, chips) : 0;
  const maxBet = canBet ? chips : 0;

  const minRaiseTotal = state.currentBet + state.minRaise;
  const raiseChipsNeeded = minRaiseTotal - player.currentBet;
  const canRaise = state.currentBet > 0 && chips >= raiseChipsNeeded;
  const minRaiseAmt = canRaise ? minRaiseTotal : 0;
  const maxRaiseAmt = canRaise ? player.currentBet + chips : 0;

  const canAllIn = chips > 0;

  return {
    canFold: true,
    canCheck,
    canCall,
    callAmount,
    canBet,
    minBet,
    maxBet,
    canRaise,
    minRaise: minRaiseAmt,
    maxRaise: maxRaiseAmt,
    canAllIn,
    allInAmount: chips,
  };
}

/**
 * Apply a player action and return the new (immutable) state.
 * Throws on invalid actions.
 *
 * For "bet" and "raise", `amount` is the TOTAL bet (raise TO this amount).
 */
export function applyAction(
  state: BettingRoundState,
  action: BettingAction,
  amount?: number
): BettingRoundState {
  if (state.roundComplete) throw new Error("Betting round is already complete");

  const playerId = getCurrentPlayerId(state);
  if (!playerId) throw new Error("No active player");

  const players = state.players.map((p) => ({ ...p }));
  const player = players.find((p) => p.id === playerId)!;
  let currentBet = state.currentBet;
  let minRaise = state.minRaise;

  switch (action) {
    case "fold": {
      player.status = "folded";
      player.needsToAct = false;
      break;
    }

    case "check": {
      if (currentBet > player.currentBet) {
        throw new Error(`Cannot check: must match bet of ${currentBet}`);
      }
      player.needsToAct = false;
      break;
    }

    case "call": {
      const toCall = currentBet - player.currentBet;
      if (toCall <= 0) throw new Error("Nothing to call — use check");
      if (toCall > player.chips) throw new Error("Cannot afford call — use all_in");
      player.chips -= toCall;
      player.currentBet += toCall;
      player.totalBet += toCall;
      player.needsToAct = false;
      if (player.chips === 0) player.status = "all_in";
      break;
    }

    case "bet": {
      if (currentBet > 0) throw new Error("Cannot bet — use raise");
      if (amount === undefined) throw new Error("Bet requires an amount");
      if (amount > player.chips) throw new Error("Bet exceeds chips — use all_in");
      if (amount < state.bigBlind && amount < player.chips) {
        throw new Error(`Bet must be at least ${state.bigBlind}`);
      }
      player.chips -= amount;
      player.currentBet += amount;
      player.totalBet += amount;
      player.needsToAct = false;
      currentBet = player.currentBet;
      minRaise = Math.max(amount, state.bigBlind);
      if (player.chips === 0) player.status = "all_in";
      reopenAction(players, playerId);
      break;
    }

    case "raise": {
      if (currentBet === 0) throw new Error("Cannot raise — use bet");
      if (amount === undefined) throw new Error("Raise requires amount (raise TO)");
      const minTotal = currentBet + state.minRaise;
      const additional = amount - player.currentBet;
      if (additional > player.chips) throw new Error("Raise exceeds chips — use all_in");
      if (amount < minTotal && additional < player.chips) {
        throw new Error(`Raise must be to at least ${minTotal}`);
      }
      const raiseIncrement = amount - currentBet;
      player.chips -= additional;
      player.currentBet = amount;
      player.totalBet += additional;
      player.needsToAct = false;
      currentBet = amount;
      minRaise = Math.max(raiseIncrement, state.bigBlind);
      if (player.chips === 0) player.status = "all_in";
      reopenAction(players, playerId);
      break;
    }

    case "all_in": {
      const allInAmount = player.chips;
      if (allInAmount <= 0) throw new Error("No chips to go all-in");
      player.chips = 0;
      player.currentBet += allInAmount;
      player.totalBet += allInAmount;
      player.needsToAct = false;
      player.status = "all_in";

      if (currentBet === 0) {
        // Opening bet via all-in
        currentBet = player.currentBet;
        minRaise = Math.max(player.currentBet, state.bigBlind);
        reopenAction(players, playerId);
      } else if (player.currentBet >= currentBet + state.minRaise) {
        // Full raise
        const raiseIncrement = player.currentBet - currentBet;
        currentBet = player.currentBet;
        minRaise = Math.max(raiseIncrement, state.bigBlind);
        reopenAction(players, playerId);
      } else if (player.currentBet > currentBet) {
        // Partial raise — updates currentBet but doesn't reopen
        currentBet = player.currentBet;
      }
      // Under-call: no changes to currentBet
      break;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }

  const nextIndex = findNextActive(
    players,
    state.actionOrder,
    (state.activePlayerIndex + 1) % state.actionOrder.length
  );
  const roundComplete = checkRoundComplete(players);

  return {
    players,
    actionOrder: state.actionOrder,
    activePlayerIndex: nextIndex,
    currentBet,
    minRaise,
    bigBlind: state.bigBlind,
    isPreFlop: state.isPreFlop,
    roundComplete,
  };
}

// ============================================================
// Utilities
// ============================================================

/** Get players who haven't folded (active + all-in). */
export function getActivePlayers(state: BettingRoundState): BettingPlayer[] {
  return state.players.filter((p) => p.status !== "folded");
}

/** Get total contributions per player (for pot calculation). */
export function getContributions(
  state: BettingRoundState
): { playerId: string; amount: number }[] {
  return state.players.map((p) => ({ playerId: p.id, amount: p.totalBet }));
}

/** Get IDs of folded players (for pot calculation). */
export function getFoldedPlayerIds(state: BettingRoundState): Set<string> {
  return new Set(
    state.players.filter((p) => p.status === "folded").map((p) => p.id)
  );
}

/** Reset currentBet to 0 for a new betting round, preserving totalBet. */
export function prepareNextRound(
  state: BettingRoundState
): {
  id: string;
  chips: number;
  currentBet: number;
  totalBet: number;
  status: "active" | "folded" | "all_in";
}[] {
  return state.players.map((p) => ({
    id: p.id,
    chips: p.chips,
    currentBet: 0,
    totalBet: p.totalBet,
    status: p.status,
  }));
}

// ============================================================
// Internal helpers
// ============================================================

/** Mark all other active players as needing to act (after a bet/raise). */
function reopenAction(players: BettingPlayer[], actorId: string): void {
  for (const p of players) {
    if (p.id !== actorId && p.status === "active") {
      p.needsToAct = true;
    }
  }
}

/** Find the next player in actionOrder who needs to act. */
function findNextActive(
  players: BettingPlayer[],
  actionOrder: string[],
  startIndex: number
): number {
  const n = actionOrder.length;
  for (let i = 0; i < n; i++) {
    const idx = (startIndex + i) % n;
    const player = players.find((p) => p.id === actionOrder[idx]);
    if (player && player.needsToAct && player.status === "active") {
      return idx;
    }
  }
  return startIndex;
}

/** Check if the betting round is complete. */
function checkRoundComplete(players: BettingPlayer[]): boolean {
  const nonFolded = players.filter((p) => p.status !== "folded");
  if (nonFolded.length <= 1) return true;

  const active = players.filter((p) => p.status === "active");
  if (active.length === 0) return true;

  return !active.some((p) => p.needsToAct);
}
