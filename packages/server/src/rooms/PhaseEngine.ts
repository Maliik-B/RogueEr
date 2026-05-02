import type { GamePhase, Card, Rule, RuleCategory, RuleTierSetting } from "@rogueer/shared";
import {
  createShuffledDeck,
  dealCards,
  postBlinds,
  getPreFlopOrder,
  getPostFlopOrder,
  createBettingRound,
  prepareNextRound,
  getContributions,
  getFoldedPlayerIds,
  getActivePlayers,
  calculatePots,
  distributePots,
  determineWinnersWithRules,
  getAvailableRules,
  pickRandomRules,
  createRng,
  ROUND_END_DELAY_MS,
  REPLACEMENT_OPTIONS_COUNT,
} from "@rogueer/shared";
import type { GameRoom } from "./GameRoom.js";
import {
  CommunityCardSchema,
  RuleSlotSchema,
  RuleInfoSchema,
  SidePotSchema,
  PlayerState,
} from "../schema/GameState.js";

// Rule slot categories for balanced distribution
const CATEGORIES: RuleCategory[] = ["hierarchy", "card_property", "composition"];

export class PhaseEngine {
  constructor(private room: GameRoom) {}

  transitionTo(phase: GamePhase) {
    const from = this.room.state.phase as GamePhase;
    this.room.state.phase = phase;
    this.room.clearTimers();
    this.room.broadcast("phase_transition", { type: "phase_transition", from, to: phase });

    const handler = this.phaseHandlers[phase];
    if (handler) handler.call(this);
  }

  private phaseHandlers: Partial<Record<GamePhase, () => void>> = {
    round_start: this.onRoundStart,
    deal: this.onDeal,
    pre_flop_bet: this.onPreFlopBet,
    voting_1: this.onVoting1,
    flop: this.onFlop,
    flop_bet: this.onFlopBet,
    voting_2: this.onVoting2,
    turn: this.onTurn,
    turn_bet: this.onTurnBet,
    river: this.onRiver,
    river_bet: this.onRiverBet,
    showdown: this.onShowdown,
    round_end: this.onRoundEnd,
  };

  // ================================================================
  // ROUND_START
  // ================================================================
  private onRoundStart() {
    const state = this.room.state;
    state.roundNumber++;

    // Reset per-round state
    state.pot = 0;
    state.currentBet = 0;
    state.communityCards.clear();
    state.sidePots.clear();
    state.votingState.active = false;
    state.votingState.lockedCount = 0;
    state.votingState.lastResult = null;

    // Reset players
    state.players.forEach((p) => {
      if (p.status !== "eliminated") {
        p.status = "waiting";
        p.currentBet = 0;
        p.isReady = false;
        p.holeCardCount = 0;
        p.vote = null;
      }
    });

    // Rotate dealer
    const activePlayers = this.getActivePlayersSorted();
    if (activePlayers.length < 2) {
      this.transitionTo("lobby" as GamePhase);
      return;
    }

    if (state.roundNumber === 1) {
      state.dealerSeatIndex = activePlayers[0].seatIndex;
    } else {
      state.dealerSeatIndex = this.nextActiveSeat(state.dealerSeatIndex, activePlayers);
    }

    // Post blinds
    const playerArr = activePlayers.map((p) => ({ id: p.sessionId, chips: p.chips }));
    const dealerIdx = activePlayers.findIndex((p) => p.seatIndex === state.dealerSeatIndex);
    const ante = state.settings.antesEnabled ? state.settings.anteAmount : 0;

    const blindResult = postBlinds(
      playerArr, dealerIdx,
      state.settings.smallBlind, state.settings.bigBlind, ante
    );

    // Write back blind results
    state.pot = blindResult.pot;
    state.currentBet = blindResult.currentBet;
    for (const bp of blindResult.players) {
      const ps = state.players.get(bp.id);
      if (ps) {
        ps.chips = bp.chips;
        ps.currentBet = bp.currentBet;
        if (bp.status === "all_in") ps.status = "all_in";
      }
    }

    // Store blind result for betting round creation
    this.room.blindResult = blindResult;
    this.room.dealerIndex = dealerIdx;

    // Randomize rule slots
    this.populateRuleSlots(activePlayers.length);

    this.transitionTo("deal");
  }

  // ================================================================
  // DEAL
  // ================================================================
  private onDeal() {
    const state = this.room.state;
    const seed = this.room.nextSeed();
    const deck = createShuffledDeck(seed);
    this.room.deck = deck;
    this.room.allHoleCards.clear();

    const activePlayers = this.getActivePlayersSorted();

    // Deal 2 hole cards to each player
    for (const p of activePlayers) {
      const cards = dealCards(deck, 2);
      this.room.allHoleCards.set(p.sessionId, cards);
      p.holeCardCount = 2;
    }

    // Send each player their own hole cards via private message
    this.room.sendHoleCardsToPlayers();

    // Deal 5 community cards (unrevealed)
    const communityCards = dealCards(deck, 5);
    this.room.communityCardsPlain = communityCards;
    for (const c of communityCards) {
      const cs = new CommunityCardSchema();
      cs.value = c.value;
      cs.suit = c.suit;
      cs.revealed = false;
      state.communityCards.push(cs);
    }

    this.transitionTo("pre_flop_bet");
  }

  // ================================================================
  // BETTING PHASES
  // ================================================================
  private onPreFlopBet() {
    this.startBettingRound(true);
  }

  private onFlopBet() {
    if (this.shouldSkipBetting()) {
      this.advanceAfterBetting("flop_bet");
      return;
    }
    this.startBettingRound(false);
  }

  private onTurnBet() {
    if (this.shouldSkipBetting()) {
      this.advanceAfterBetting("turn_bet");
      return;
    }
    this.startBettingRound(false);
  }

  private onRiverBet() {
    if (this.shouldSkipBetting()) {
      this.advanceAfterBetting("river_bet");
      return;
    }
    this.startBettingRound(false);
  }

  private startBettingRound(isPreFlop: boolean) {
    const state = this.room.state;
    const activePlayers = this.getActivePlayersSorted();
    const playerIds = activePlayers.map((p) => p.sessionId);
    const dealerIdx = this.room.dealerIndex;

    const actionOrder = isPreFlop
      ? getPreFlopOrder(playerIds, dealerIdx)
      : getPostFlopOrder(playerIds, dealerIdx);

    // Build player data for createBettingRound
    let bettingPlayers: {
      id: string; chips: number; currentBet: number;
      totalBet: number; status: "active" | "folded" | "all_in";
    }[];

    if (isPreFlop) {
      bettingPlayers = this.room.blindResult!.players.map((bp) => ({
        ...bp,
        status: bp.status as "active" | "all_in",
      }));
    } else {
      bettingPlayers = prepareNextRound(this.room.bettingState!);
    }

    const currentBet = isPreFlop ? state.currentBet : 0;
    if (!isPreFlop) state.currentBet = 0;

    const bettingState = createBettingRound(
      bettingPlayers, actionOrder, currentBet,
      state.settings.bigBlind, isPreFlop
    );

    this.room.bettingState = bettingState;

    // If round is immediately complete (everyone all-in from blinds)
    if (bettingState.roundComplete) {
      this.room.syncBettingStateToSchema();
      this.room.onBettingRoundComplete();
      return;
    }

    this.room.syncBettingStateToSchema();
    this.room.startTurnTimer();
  }

  /**
   * Check if betting should be skipped: all active (non-folded) players
   * are all-in, or at most one is not all-in.
   */
  private shouldSkipBetting(): boolean {
    let activeCount = 0;
    let allInCount = 0;
    this.room.state.players.forEach((p) => {
      if (p.status === "all_in") allInCount++;
      else if (p.status !== "folded" && p.status !== "eliminated") activeCount++;
    });
    // Skip if no active players can bet (0 active, or 1 active + at least 1 all-in)
    return activeCount <= 1 && allInCount >= 1;
  }

  // ================================================================
  // VOTING PHASES
  // ================================================================
  private onVoting1() {
    const vp = this.room.state.settings.votingPhases;
    if (vp === "none" || vp === "turn_only") {
      this.transitionTo("flop");
      return;
    }
    this.startVotingPhase(1);
  }

  private onVoting2() {
    const vp = this.room.state.settings.votingPhases;
    if (vp === "none" || vp === "flop_only") {
      this.transitionTo("turn");
      return;
    }
    this.startVotingPhase(2);
  }

  private startVotingPhase(phase: number) {
    const state = this.room.state;
    const vs = state.votingState;
    vs.active = true;
    vs.phase = phase;
    vs.lockedCount = 0;

    // Count eligible voters (non-folded, non-eliminated)
    let eligible = 0;
    state.players.forEach((p) => {
      if (p.status !== "folded" && p.status !== "eliminated") {
        p.vote = null; // Reset vote for this voting phase
        eligible++;
      }
    });
    vs.totalEligible = eligible;
    vs.timeRemaining = state.settings.votingTimer;

    // Generate replacement options for each non-solidified slot
    this.generateReplacementOptions();

    // Start voting timer
    this.room.startVotingTimer();
  }

  // ================================================================
  // COMMUNITY CARD REVEALS
  // ================================================================
  private onFlop() {
    const state = this.room.state;
    for (let i = 0; i < 3; i++) {
      state.communityCards[i].revealed = true;
    }
    if (this.shouldSkipBetting()) {
      this.transitionTo("turn");
    } else {
      this.transitionTo("flop_bet");
    }
  }

  private onTurn() {
    this.room.state.communityCards[3].revealed = true;
    if (this.shouldSkipBetting()) {
      this.transitionTo("river");
    } else {
      this.transitionTo("turn_bet");
    }
  }

  private onRiver() {
    this.room.state.communityCards[4].revealed = true;
    if (this.shouldSkipBetting()) {
      this.transitionTo("showdown");
    } else {
      this.transitionTo("river_bet");
    }
  }

  // ================================================================
  // SHOWDOWN
  // ================================================================
  private onShowdown() {
    const state = this.room.state;
    const communityCards = this.room.communityCardsPlain;

    // Collect non-folded players
    const showdownPlayers: { id: string; holeCards: Card[]; communityCards: Card[] }[] = [];
    state.players.forEach((p) => {
      if (p.status !== "folded" && p.status !== "eliminated") {
        const hole = this.room.allHoleCards.get(p.sessionId);
        if (hole) {
          showdownPlayers.push({ id: p.sessionId, holeCards: hole, communityCards });
        }
      }
    });

    if (showdownPlayers.length === 0) {
      this.transitionTo("round_end");
      return;
    }

    const entries = showdownPlayers.map((p) => ({
      holeCards: p.holeCards,
      communityCards: p.communityCards,
    }));

    const { winnerIndices, evaluatedHands } = determineWinnersWithRules(
      entries, this.room.activeRules
    );

    // Store results for round_end pot distribution
    this.room.showdownPlayerIds = showdownPlayers.map((p) => p.id);
    this.room.showdownWinnerIndices = winnerIndices;
    this.room.showdownEvaluatedHands = evaluatedHands;

    // Broadcast showdown message
    const hands = showdownPlayers.map((p, i) => ({
      playerId: p.id,
      cards: p.holeCards,
      bestHand: evaluatedHands[i].cards,
      handType: evaluatedHands[i].handType,
      handRank: evaluatedHands[i].rank,
    }));
    this.room.broadcast("showdown", { type: "showdown", hands });

    this.transitionTo("round_end");
  }

  // ================================================================
  // ROUND_END
  // ================================================================
  private onRoundEnd() {
    const state = this.room.state;

    this.distributePots();

    // Eliminate 0-chip players if elimination mode
    if (state.settings.eliminationMode) {
      state.players.forEach((p) => {
        if (p.chips === 0 && p.status !== "eliminated") {
          p.status = "eliminated";
          this.room.broadcast("player_eliminated", {
            type: "player_eliminated",
            playerId: p.sessionId,
          });
        }
      });
    }

    // Check game over
    const remaining = this.getActivePlayersSorted();
    if (remaining.length <= 1) {
      // Delay then return to lobby
      this.room.delayedTransition("lobby" as GamePhase, ROUND_END_DELAY_MS);
    } else {
      this.room.delayedTransition("round_start", ROUND_END_DELAY_MS);
    }
  }

  // ================================================================
  // POT DISTRIBUTION
  // ================================================================
  private distributePots() {
    const state = this.room.state;
    const bettingState = this.room.bettingState;
    if (!bettingState) return;

    const contributions = getContributions(bettingState);
    const foldedIds = getFoldedPlayerIds(bettingState);
    const pots = calculatePots(contributions, foldedIds);

    // Populate side pots on schema for client display
    state.sidePots.clear();
    for (const pot of pots) {
      const sp = new SidePotSchema();
      sp.amount = pot.amount;
      for (const id of pot.eligiblePlayerIds) {
        sp.eligiblePlayerIds.push(id);
      }
      state.sidePots.push(sp);
    }

    const communityCards = this.room.communityCardsPlain;
    const activeRules = this.room.activeRules;
    const allHoleCards = this.room.allHoleCards;

    // Distribute pots using shared logic
    const payouts = distributePots(pots, (eligibleIds) => {
      // Only one player in pot — auto-win (no showdown needed)
      if (eligibleIds.length === 1) return eligibleIds;

      const entries = eligibleIds.map((id) => ({
        holeCards: allHoleCards.get(id) ?? [],
        communityCards,
      }));
      const { winnerIndices } = determineWinnersWithRules(entries, activeRules);
      return winnerIndices.map((i) => eligibleIds[i]);
    });

    // Award chips and broadcast round_end
    const winners: { playerId: string; handDescription: string; amount: number }[] = [];
    const revealedHands: { playerId: string; cards: Card[] }[] = [];

    payouts.forEach((amount, playerId) => {
      const ps = state.players.get(playerId);
      if (ps) ps.chips += amount;

      const handDesc = this.room.showdownEvaluatedHands
        ? this.getHandDescription(playerId)
        : "winner";

      winners.push({ playerId, handDescription: handDesc, amount });
    });

    // Reveal all hole cards for round_end message
    this.room.allHoleCards.forEach((cards, playerId) => {
      const ps = state.players.get(playerId);
      if (ps && ps.status !== "folded") {
        revealedHands.push({ playerId, cards });
      }
    });

    this.room.broadcast("round_end", { type: "round_end", winners, revealedHands });
  }

  // ================================================================
  // HELPERS
  // ================================================================

  /** Get non-eliminated players sorted by seat index. */
  getActivePlayersSorted(): PlayerState[] {
    const arr: PlayerState[] = [];
    this.room.state.players.forEach((p) => {
      if (p.status !== "eliminated") {
        arr.push(p);
      }
    });
    return arr.sort((a, b) => a.seatIndex - b.seatIndex);
  }

  /** Advance to the next phase after a betting round completes. */
  advanceAfterBetting(currentPhase: GamePhase) {
    // Check if all but one folded
    let nonFolded = 0;
    this.room.state.players.forEach((p) => {
      if (p.status !== "folded" && p.status !== "eliminated") nonFolded++;
    });
    if (nonFolded <= 1) {
      this.transitionTo("round_end");
      return;
    }

    const nextPhaseMap: Partial<Record<GamePhase, GamePhase>> = {
      pre_flop_bet: this.getPostPreFlopPhase(),
      flop_bet: this.getPostFlopBetPhase(),
      turn_bet: "river",
      river_bet: "showdown",
    };
    const next = nextPhaseMap[currentPhase];
    if (next) this.transitionTo(next);
  }

  private getPostPreFlopPhase(): GamePhase {
    const vp = this.room.state.settings.votingPhases;
    return (vp === "both" || vp === "flop_only") ? "voting_1" : "flop";
  }

  private getPostFlopBetPhase(): GamePhase {
    const vp = this.room.state.settings.votingPhases;
    return (vp === "both" || vp === "turn_only") ? "voting_2" : "turn";
  }

  private nextActiveSeat(currentSeat: number, players: { seatIndex: number }[]): number {
    const seats = players.map((p) => p.seatIndex).sort((a, b) => a - b);
    for (const s of seats) {
      if (s > currentSeat) return s;
    }
    return seats[0]; // Wrap around
  }

  private populateRuleSlots(playerCount: number) {
    const state = this.room.state;
    const slotCount = state.settings.ruleSlotCount;
    const tier = state.settings.ruleTier as RuleTierSetting;
    const distribution = state.settings.emptySlotDistribution;
    const rng = createRng(this.room.nextSeed());

    state.ruleSlots.clear();
    this.room.activeRules = [];
    const activeIds: string[] = [];

    for (let i = 0; i < slotCount; i++) {
      const category: RuleCategory = distribution === "balanced"
        ? CATEGORIES[i % CATEGORIES.length]
        : CATEGORIES[Math.floor(rng() * CATEGORIES.length)];

      const available = getAvailableRules(category, activeIds, tier);
      const picked = pickRandomRules(available, 1, rng);

      const slot = new RuleSlotSchema();
      slot.index = i;
      slot.category = category;

      if (picked.length > 0) {
        const rule = picked[0];
        slot.slotState = "active";
        slot.rule = this.ruleToSchema(rule);
        this.room.activeRules.push(rule);
        activeIds.push(rule.id);
      } else {
        slot.slotState = "empty";
      }

      state.ruleSlots.push(slot);
    }
  }

  private generateReplacementOptions() {
    const state = this.room.state;
    const tier = state.settings.ruleTier as RuleTierSetting;
    const rng = createRng(this.room.nextSeed());
    const activeIds = this.room.activeRules.map((r) => r.id);

    for (let i = 0; i < state.ruleSlots.length; i++) {
      const slot = state.ruleSlots[i];
      if (slot.slotState === "solidified") continue;

      slot.replacementOptions.clear();
      const category = slot.category as RuleCategory;
      const available = getAvailableRules(category, activeIds, tier);
      const options = pickRandomRules(available, REPLACEMENT_OPTIONS_COUNT, rng);

      for (const opt of options) {
        slot.replacementOptions.push(this.ruleToSchema(opt));
      }
    }
  }

  private ruleToSchema(rule: Rule): RuleInfoSchema {
    const info = new RuleInfoSchema();
    info.id = rule.id;
    info.category = rule.category;
    info.name = rule.name;
    info.description = rule.description;
    info.tier = rule.tier;
    return info;
  }

  private getHandDescription(playerId: string): string {
    if (!this.room.showdownPlayerIds || !this.room.showdownEvaluatedHands) return "winner";
    const idx = this.room.showdownPlayerIds.indexOf(playerId);
    if (idx === -1) return "winner";
    return this.room.showdownEvaluatedHands[idx].handType.replace(/_/g, " ");
  }
}
