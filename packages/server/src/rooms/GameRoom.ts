import { Room, Client } from "colyseus";
import type {
  Card, GamePhase, Rule, EvaluatedHand, BettingRoundState, BlindPostResult,
} from "@rogueer/shared";
import {
  getCurrentPlayerId,
  getValidActions,
  applyAction,
  RULE_POOL,
} from "@rogueer/shared";
import { GameState, PlayerState, SpectatorSchema, RuleInfoSchema, VoteSchema } from "../schema/GameState.js";
import { PhaseEngine } from "./PhaseEngine.js";
import { LobbyHandler } from "./handlers/lobby-handler.js";
import { BettingHandler } from "./handlers/betting-handler.js";
import { VotingHandler } from "./handlers/voting-handler.js";

export class GameRoom extends Room<GameState> {
  maxClients = 8;

  // Phase engine & handlers
  phaseEngine!: PhaseEngine;
  private lobbyHandler!: LobbyHandler;
  private bettingHandler!: BettingHandler;
  private votingHandler!: VotingHandler;

  // Server-only game state (never synced to clients)
  deck: Card[] = [];
  allHoleCards: Map<string, Card[]> = new Map();
  communityCardsPlain: Card[] = [];
  activeRules: Rule[] = [];
  bettingState: BettingRoundState | null = null;
  blindResult: BlindPostResult | null = null;
  dealerIndex: number = 0;
  private rngSeed: number = 0;

  // Showdown results (set by PhaseEngine, consumed by round_end)
  showdownPlayerIds: string[] | null = null;
  showdownWinnerIndices: number[] | null = null;
  showdownEvaluatedHands: EvaluatedHand[] | null = null;

  // Timer references
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private votingTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private delayTimer: ReturnType<typeof setTimeout> | null = null;

  onCreate(_options: Record<string, unknown>) {
    this.setState(new GameState());
    this.rngSeed = Date.now();

    this.phaseEngine = new PhaseEngine(this);
    this.lobbyHandler = new LobbyHandler(this);
    this.bettingHandler = new BettingHandler(this);
    this.votingHandler = new VotingHandler(this);

    // Message routing
    this.onMessage("player_ready", (client, message) => {
      this.lobbyHandler.onReady(client, message);
    });
    this.onMessage("update_settings", (client, message) => {
      this.lobbyHandler.onUpdateSettings(client, message);
    });
    this.onMessage("start_game", (client) => {
      this.lobbyHandler.onStartGame(client);
    });
    this.onMessage("player_action", (client, message) => {
      this.bettingHandler.onAction(client, message);
    });
    this.onMessage("player_vote", (client, message) => {
      this.votingHandler.onVote(client, message);
    });

    console.log(`[GameRoom] Room ${this.roomId} created`);
  }

  onJoin(client: Client, options: Record<string, unknown>) {
    const isGameInProgress = this.state.phase !== "lobby";
    const seatsFull = this.state.players.size >= this.state.settings.maxPlayers;

    if (isGameInProgress || seatsFull) {
      const spectator = new SpectatorSchema();
      spectator.sessionId = client.sessionId;
      spectator.displayName = (options.displayName as string) || `Spectator ${this.state.spectators.size + 1}`;
      this.state.spectators.set(client.sessionId, spectator);
      console.log(`[GameRoom] ${client.sessionId} joined as spectator`);
      return;
    }

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.displayName = (options.displayName as string) || `Player ${this.state.players.size + 1}`;
    player.seatIndex = this.getNextSeatIndex();
    player.chips = this.state.settings.startingChips;

    if (this.state.players.size === 0) {
      player.isHost = true;
    }

    this.state.players.set(client.sessionId, player);

    console.log(`[GameRoom] ${client.sessionId} joined as player (seat ${player.seatIndex})`);
  }

  onLeave(client: Client, consented?: boolean) {
    if (this.state.spectators.has(client.sessionId)) {
      this.state.spectators.delete(client.sessionId);
      console.log(`[GameRoom] Spectator ${client.sessionId} left`);
      return;
    }

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (this.state.phase === "lobby") {
      this.state.players.delete(client.sessionId);
      if (player.isHost && this.state.players.size > 0) {
        const nextPlayer = this.state.players.values().next().value;
        if (nextPlayer) nextPlayer.isHost = true;
      }
      console.log(`[GameRoom] ${client.sessionId} left lobby`);
    } else {
      player.status = "disconnected";
      // If it was their turn, auto-fold
      if (this.bettingState) {
        const currentId = getCurrentPlayerId(this.bettingState);
        if (currentId === client.sessionId) {
          this.autoFold(client.sessionId);
        }
      }
      console.log(`[GameRoom] ${client.sessionId} disconnected (consented: ${consented})`);
    }
  }

  onDispose() {
    this.clearTimers();
    console.log(`[GameRoom] Room ${this.roomId} disposed`);
  }

  // ================================================================
  // PUBLIC METHODS (called by handlers and PhaseEngine)
  // ================================================================

  sendError(client: Client, code: string, message: string) {
    client.send("error", { type: "error", code, message });
  }

  /** Send hole cards as private messages to each player. */
  sendHoleCardsToPlayers() {
    for (const client of this.clients) {
      const cards = this.allHoleCards.get(client.sessionId);
      if (cards) {
        client.send("your_cards", { cards });
      }
    }
  }

  nextSeed(): number {
    return this.rngSeed++;
  }

  /** Sync the immutable BettingRoundState back into Colyseus schemas. */
  syncBettingStateToSchema() {
    if (!this.bettingState) return;
    const state = this.state;

    // Update pot (sum of all totalBets)
    let totalPot = 0;
    for (const bp of this.bettingState.players) {
      totalPot += bp.totalBet;
    }
    state.pot = totalPot;
    state.currentBet = this.bettingState.currentBet;

    // Update each player's schema
    for (const bp of this.bettingState.players) {
      const ps = state.players.get(bp.id);
      if (!ps) continue;
      ps.chips = bp.chips;
      ps.currentBet = bp.currentBet;
      if (bp.status === "folded") ps.status = "folded";
      else if (bp.status === "all_in") ps.status = "all_in";
    }

    // Update active seat
    const currentId = getCurrentPlayerId(this.bettingState);
    if (currentId) {
      const activePlayer = state.players.get(currentId);
      if (activePlayer) {
        state.activeSeatIndex = activePlayer.seatIndex;
      }
    }
  }

  /** Called when a betting round completes (by handler or auto). */
  onBettingRoundComplete() {
    const phase = this.state.phase as GamePhase;
    this.phaseEngine.advanceAfterBetting(phase);
  }

  /** Start the turn timer for the current active player. */
  startTurnTimer() {
    this.clearTurnTimer();
    const timerMs = this.state.settings.turnTimer * 1000;
    this.state.timeRemaining = this.state.settings.turnTimer;

    this.countdownInterval = setInterval(() => {
      if (this.state.timeRemaining > 0) {
        this.state.timeRemaining--;
      }
    }, 1000);

    this.turnTimer = setTimeout(() => {
      this.clearTurnTimer();
      this.autoFoldOrCheck();
    }, timerMs);
  }

  /** Start the voting phase timer. */
  startVotingTimer() {
    this.clearVotingTimer();
    const timerMs = this.state.settings.votingTimer * 1000;
    this.state.votingState.timeRemaining = this.state.settings.votingTimer;

    this.countdownInterval = setInterval(() => {
      if (this.state.votingState.timeRemaining > 0) {
        this.state.votingState.timeRemaining--;
      }
    }, 1000);

    this.votingTimer = setTimeout(() => {
      this.clearVotingTimer();
      this.autoAbstainAll();
      this.resolveVotes();
    }, timerMs);
  }

  /** Resolve votes and transition to next phase. */
  resolveVotes() {
    this.clearVotingTimer();
    const state = this.state;

    // Collect all locked votes
    const votes: { playerId: string; targetSlot: number; action: string; replacementId: string }[] = [];
    state.players.forEach((p) => {
      if (p.vote?.locked && p.vote.action !== "abstain") {
        votes.push({
          playerId: p.sessionId,
          targetSlot: p.vote.targetSlot,
          action: p.vote.action,
          replacementId: p.vote.replacementId,
        });
      }
    });

    // All abstained — no changes
    if (votes.length === 0) {
      this.finalizeVoting();
      return;
    }

    // Step 1: Group by target slot, find slot with most votes
    const slotCounts = new Map<number, number>();
    for (const v of votes) {
      slotCounts.set(v.targetSlot, (slotCounts.get(v.targetSlot) ?? 0) + 1);
    }
    const maxSlotVotes = Math.max(...slotCounts.values());
    const topSlots = [...slotCounts.entries()].filter(([, c]) => c === maxSlotVotes);
    if (topSlots.length !== 1) {
      // Tie on slot — no action
      this.broadcastVoteResult(0, "", "", true, "Tied on slot target — no action taken");
      this.finalizeVoting();
      return;
    }
    const winningSlot = topSlots[0][0];

    // Step 2: Within winning slot, group by action
    const slotVotes = votes.filter((v) => v.targetSlot === winningSlot);
    const actionCounts = new Map<string, number>();
    for (const v of slotVotes) {
      actionCounts.set(v.action, (actionCounts.get(v.action) ?? 0) + 1);
    }
    const maxActionVotes = Math.max(...actionCounts.values());
    const topActions = [...actionCounts.entries()].filter(([, c]) => c === maxActionVotes);
    if (topActions.length !== 1) {
      this.broadcastVoteResult(winningSlot, "", "", true, "Tied on action — no action taken");
      this.finalizeVoting();
      return;
    }
    const winningAction = topActions[0][0];

    // Step 3: If replace, resolve replacement
    let replacementId = "";
    if (winningAction === "replace") {
      const replaceVotes = slotVotes.filter((v) => v.action === "replace" && v.replacementId);
      const replaceCounts = new Map<string, number>();
      for (const v of replaceVotes) {
        replaceCounts.set(v.replacementId, (replaceCounts.get(v.replacementId) ?? 0) + 1);
      }
      if (replaceCounts.size > 0) {
        const maxReplace = Math.max(...replaceCounts.values());
        const topReplacements = [...replaceCounts.entries()].filter(([, c]) => c === maxReplace);
        if (topReplacements.length !== 1) {
          // Tie on replacement — delete instead
          this.applyVoteAction(winningSlot, "delete", "");
          this.broadcastVoteResult(winningSlot, "delete", "", false, "Tied on replacement — rule deleted instead");
          this.finalizeVoting();
          return;
        }
        replacementId = topReplacements[0][0];
      }
    }

    // Apply the winning action
    this.applyVoteAction(winningSlot, winningAction, replacementId);
    this.broadcastVoteResult(winningSlot, winningAction, replacementId, false,
      `Slot ${winningSlot + 1}: ${winningAction}${replacementId ? ` with ${replacementId}` : ""}`);
    this.finalizeVoting();
  }

  /** Schedule a phase transition after a delay. */
  delayedTransition(phase: GamePhase, delayMs: number) {
    this.delayTimer = setTimeout(() => {
      this.delayTimer = null;
      this.phaseEngine.transitionTo(phase);
    }, delayMs);
  }

  /** Clear all active timers. */
  clearTimers() {
    this.clearTurnTimer();
    this.clearVotingTimer();
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
  }

  // ================================================================
  // PRIVATE METHODS
  // ================================================================

  private getNextSeatIndex(): number {
    const taken = new Set<number>();
    this.state.players.forEach((p) => taken.add(p.seatIndex));
    for (let i = 0; i < this.maxClients; i++) {
      if (!taken.has(i)) return i;
    }
    return this.state.players.size;
  }

  private clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private clearVotingTimer() {
    if (this.votingTimer) {
      clearTimeout(this.votingTimer);
      this.votingTimer = null;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  /** Auto-fold or auto-check when turn timer expires. */
  private autoFoldOrCheck() {
    if (!this.bettingState) return;
    const currentId = getCurrentPlayerId(this.bettingState);
    if (!currentId) return;

    const valid = getValidActions(this.bettingState);
    const action = valid.canCheck ? "check" : "fold";

    try {
      const newState = applyAction(this.bettingState, action as any);
      this.bettingState = newState;
      this.syncBettingStateToSchema();

      if (newState.roundComplete) {
        this.onBettingRoundComplete();
      } else {
        this.startTurnTimer();
      }
    } catch {
      // Fallback: force fold
      this.autoFold(currentId);
    }
  }

  private autoFold(playerId: string) {
    if (!this.bettingState) return;
    const currentId = getCurrentPlayerId(this.bettingState);
    if (currentId !== playerId) return;

    try {
      const newState = applyAction(this.bettingState, "fold");
      this.bettingState = newState;
      this.syncBettingStateToSchema();

      if (newState.roundComplete) {
        this.onBettingRoundComplete();
      } else {
        this.startTurnTimer();
      }
    } catch {
      // Betting round is broken, force advance
      this.onBettingRoundComplete();
    }
  }

  /** Auto-abstain all unvoted players when voting timer expires. */
  private autoAbstainAll() {
    this.state.players.forEach((p) => {
      if (p.status !== "folded" && p.status !== "eliminated" && !p.vote?.locked) {
        const vote = new VoteSchema();
        vote.targetSlot = 0;
        vote.action = "abstain";
        vote.replacementId = "";
        vote.locked = true;
        p.vote = vote;
        this.state.votingState.lockedCount++;
      }
    });
  }

  private applyVoteAction(slotIndex: number, action: string, replacementId: string) {
    const slot = this.state.ruleSlots[slotIndex];
    if (!slot) return;

    switch (action) {
      case "solidify":
        slot.slotState = "solidified";
        break;
      case "delete": {
        const oldRuleId = slot.rule?.id;
        slot.slotState = "empty";
        slot.rule = null;
        if (oldRuleId) {
          this.activeRules = this.activeRules.filter((r) => r.id !== oldRuleId);
        }
        break;
      }
      case "replace": {
        const newRule = RULE_POOL.get(replacementId);
        if (newRule) {
          // Remove old rule from active
          if (slot.rule) {
            this.activeRules = this.activeRules.filter((r) => r.id !== slot.rule!.id);
          }
          // Add new rule
          const info = new RuleInfoSchema();
          info.id = newRule.id;
          info.category = newRule.category;
          info.name = newRule.name;
          info.description = newRule.description;
          info.tier = newRule.tier;
          slot.rule = info;
          slot.slotState = "active";
          this.activeRules.push(newRule);
        }
        break;
      }
    }
  }

  private broadcastVoteResult(
    targetSlot: number, action: string, replacementId: string,
    noAction: boolean, summary: string
  ) {
    const allVotes: { playerId: string; vote: { targetSlot: number; action: string; replacementId: string; locked: boolean } }[] = [];
    this.state.players.forEach((p) => {
      if (p.vote) {
        allVotes.push({
          playerId: p.sessionId,
          vote: {
            targetSlot: p.vote.targetSlot,
            action: p.vote.action,
            replacementId: p.vote.replacementId,
            locked: p.vote.locked,
          },
        });
      }
    });

    this.broadcast("vote_resolved", {
      type: "vote_resolved",
      result: { targetSlot, action, replacementId, noAction, summary },
      allVotes,
    });
  }

  private finalizeVoting() {
    this.state.votingState.active = false;
    const phase = this.state.phase as GamePhase;
    if (phase === "voting_1") {
      this.phaseEngine.transitionTo("flop");
    } else if (phase === "voting_2") {
      this.phaseEngine.transitionTo("turn");
    }
  }
}
