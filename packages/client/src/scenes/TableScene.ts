import { GameObjects, Scene } from "phaser";
import { NetworkManager } from "../network/NetworkManager.js";
import * as E from "../network/events.js";
import { PlayerInfo } from "../ui/PlayerInfo.js";
import { BettingPanel } from "../ui/BettingPanel.js";
import { TimerBar } from "../ui/TimerBar.js";
import { RuleDisplay } from "../ui/RuleDisplay.js";
import { VotingPanel } from "../ui/VotingPanel.js";
import {
  SEAT_POSITIONS, COMMUNITY_CARD_POSITIONS, POT_POSITION,
  TABLE_CENTER, getVisualSeatIndex,
} from "../ui/SeatLayout.js";
import { createCard, createFaceDown, createEmptySlot } from "../ui/CardRenderer.js";
import { showToast } from "../ui/Toast.js";
import {
  ACCENT_RED, TEXT_LIGHT, TEXT_DIM, TEXT_WHITE,
  GOLD, TABLE_FELT, BG_PANEL, GREEN,
} from "../utils/colors.js";

const PHASE_LABELS: Record<string, string> = {
  lobby: "Lobby",
  round_start: "Round Start",
  deal: "Dealing",
  pre_flop_bet: "Pre-Flop",
  voting_1: "Voting Round 1",
  flop: "Flop",
  flop_bet: "Flop Betting",
  voting_2: "Voting Round 2",
  turn: "Turn",
  turn_bet: "Turn Betting",
  river: "River",
  river_bet: "River Betting",
  showdown: "Showdown",
  round_end: "Round End",
};

const BETTING_PHASES = new Set([
  "pre_flop_bet", "flop_bet", "turn_bet", "river_bet",
]);

export class TableScene extends Scene {
  private net!: NetworkManager;
  private localSeatIndex = 0;

  // Player seats
  private seats: PlayerInfo[] = [];
  private seatBySession: Map<string, number> = new Map(); // sessionId → visual seat idx

  // Community cards
  private communitySlots: GameObjects.Container[] = [];

  // Info displays
  private potText!: GameObjects.Text;
  private phaseText!: GameObjects.Text;
  private roundText!: GameObjects.Text;

  // Betting controls
  private bettingPanel!: BettingPanel;
  private timerBar!: TimerBar;

  // Voting & rules
  private ruleDisplay!: RuleDisplay;
  private votingPanel!: VotingPanel;

  // Track dealt hole cards per player (for showing face-down)
  private dealtPlayers: Set<string> = new Set();

  constructor() {
    super({ key: "TableScene" });
  }

  create() {
    this.net = NetworkManager.getInstance();
    this.seatBySession.clear();
    this.dealtPlayers.clear();

    this.drawTable();
    this.createSeats();
    this.createCommunitySlots();
    this.createInfoDisplays();
    this.createBettingControls();
    this.createVotingUI();
    this.wireEvents();
    this.syncInitialState();
  }

  // ================================================================
  // Drawing
  // ================================================================

  private drawTable() {
    const g = this.add.graphics();
    // Table oval
    g.fillStyle(parseInt(TABLE_FELT.slice(1), 16), 0.4);
    g.fillEllipse(TABLE_CENTER.x, TABLE_CENTER.y, 700, 320);
    g.lineStyle(2, parseInt(ACCENT_RED.slice(1), 16), 0.3);
    g.strokeEllipse(TABLE_CENTER.x, TABLE_CENTER.y, 700, 320);
  }

  private createSeats() {
    this.seats = [];
    for (let i = 0; i < 6; i++) {
      const pos = SEAT_POSITIONS[i];
      this.seats.push(new PlayerInfo(this, pos.x, pos.y));
    }
  }

  private createCommunitySlots() {
    this.communitySlots = [];
    for (const pos of COMMUNITY_CARD_POSITIONS) {
      const slot = createEmptySlot(this, pos.x, pos.y);
      this.communitySlots.push(slot);
    }
  }

  private createInfoDisplays() {
    // Pot
    this.potText = this.add
      .text(POT_POSITION.x, POT_POSITION.y, "Pot: $0", {
        fontSize: "18px",
        color: GOLD,
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // Phase indicator
    this.phaseText = this.add
      .text(20, 15, "", {
        fontSize: "14px",
        color: TEXT_DIM,
        fontFamily: "monospace",
      });

    // Round number
    this.roundText = this.add
      .text(20, 35, "", {
        fontSize: "12px",
        color: TEXT_DIM,
        fontFamily: "monospace",
      });
  }

  private createBettingControls() {
    this.bettingPanel = new BettingPanel(this, 640, 680);
    this.timerBar = new TimerBar(this, 640, 640, 400, 6);
  }

  private createVotingUI() {
    this.ruleDisplay = new RuleDisplay(this, 1035, 15);
    this.votingPanel = new VotingPanel(this, 640, 360);
  }

  // ================================================================
  // Events
  // ================================================================

  private wireEvents() {
    const ev = this.net.events;

    ev.on(E.PLAYER_ADD, this.onPlayerAdd, this);
    ev.on(E.PLAYER_REMOVE, this.onPlayerRemove, this);
    ev.on(E.PLAYER_CHIPS, this.onPlayerChips, this);
    ev.on(E.PLAYER_STATUS, this.onPlayerStatus, this);
    ev.on(E.PLAYER_BET, this.onPlayerBet, this);
    ev.on(E.POT_CHANGE, this.onPotChange, this);
    ev.on(E.ACTIVE_SEAT_CHANGE, this.onActiveSeatChange, this);
    ev.on(E.DEALER_CHANGE, this.onDealerChange, this);
    ev.on(E.PHASE_CHANGE, this.onPhaseChange, this);
    ev.on(E.ROUND_NUMBER, this.onRoundNumber, this);
    ev.on(E.HOLE_CARD_ADD, this.onHoleCardAdd, this);
    ev.on(E.PLAYER_HOLE_CARD_COUNT, this.onHoleCardCount, this);
    ev.on(E.COMMUNITY_CARD_ADD, this.onCommunityCardAdd, this);
    ev.on(E.COMMUNITY_CARD_REVEAL, this.onCommunityCardReveal, this);
    ev.on(E.TIME_REMAINING, this.onTimeRemaining, this);
    ev.on(E.RULE_SLOT_ADD, this.onRuleSlotAdd, this);
    ev.on(E.RULE_SLOT_CHANGE, this.onRuleSlotChange, this);
    ev.on(E.VOTING_ACTIVE, this.onVotingActive, this);
    ev.on(E.VOTING_TIME, this.onVotingTime, this);
    ev.on(E.VOTING_LOCKED_COUNT, this.onVotingLockedCount, this);
    ev.on(E.VOTE_RESOLVED, this.onVoteResolved, this);
    ev.on(E.PHASE_TRANSITION, this.onPhaseTransition, this);
    ev.on(E.SHOWDOWN, this.onShowdown, this);
    ev.on(E.ROUND_END, this.onRoundEnd, this);
    ev.on(E.SERVER_ERROR, this.onError, this);

    this.events.on("shutdown", () => {
      ev.off(E.PLAYER_ADD, this.onPlayerAdd, this);
      ev.off(E.PLAYER_REMOVE, this.onPlayerRemove, this);
      ev.off(E.PLAYER_CHIPS, this.onPlayerChips, this);
      ev.off(E.PLAYER_STATUS, this.onPlayerStatus, this);
      ev.off(E.PLAYER_BET, this.onPlayerBet, this);
      ev.off(E.POT_CHANGE, this.onPotChange, this);
      ev.off(E.ACTIVE_SEAT_CHANGE, this.onActiveSeatChange, this);
      ev.off(E.DEALER_CHANGE, this.onDealerChange, this);
      ev.off(E.PHASE_CHANGE, this.onPhaseChange, this);
      ev.off(E.ROUND_NUMBER, this.onRoundNumber, this);
      ev.off(E.HOLE_CARD_ADD, this.onHoleCardAdd, this);
      ev.off(E.PLAYER_HOLE_CARD_COUNT, this.onHoleCardCount, this);
      ev.off(E.COMMUNITY_CARD_ADD, this.onCommunityCardAdd, this);
      ev.off(E.COMMUNITY_CARD_REVEAL, this.onCommunityCardReveal, this);
      ev.off(E.TIME_REMAINING, this.onTimeRemaining, this);
      ev.off(E.RULE_SLOT_ADD, this.onRuleSlotAdd, this);
      ev.off(E.RULE_SLOT_CHANGE, this.onRuleSlotChange, this);
      ev.off(E.VOTING_ACTIVE, this.onVotingActive, this);
      ev.off(E.VOTING_TIME, this.onVotingTime, this);
      ev.off(E.VOTING_LOCKED_COUNT, this.onVotingLockedCount, this);
      ev.off(E.VOTE_RESOLVED, this.onVoteResolved, this);
      ev.off(E.PHASE_TRANSITION, this.onPhaseTransition, this);
      ev.off(E.SHOWDOWN, this.onShowdown, this);
      ev.off(E.ROUND_END, this.onRoundEnd, this);
      ev.off(E.SERVER_ERROR, this.onError, this);
    });
  }

  private syncInitialState() {
    const state = this.net.getState();
    if (!state) return;

    // Find local player's seat index for rotation
    const localPlayer = state.players.get(this.net.sessionId);
    this.localSeatIndex = localPlayer?.seatIndex ?? 0;

    // Add all current players
    state.players.forEach((player: any, sessionId: string) => {
      this.addPlayerToSeat(player, sessionId);
    });

    // Sync community cards
    if (state.communityCards) {
      state.communityCards.forEach((card: any, idx: number) => {
        this.setCommunityCard(idx, card);
      });
    }

    // Sync pot, phase, round
    this.potText.setText(`Pot: $${state.pot}`);
    this.phaseText.setText(PHASE_LABELS[state.phase] || state.phase);
    this.roundText.setText(state.roundNumber > 0 ? `Round ${state.roundNumber}` : "");

    // Sync active seat and dealer
    this.updateActiveSeat(state.activeSeatIndex);
    this.updateDealer(state.dealerSeatIndex);

    // Sync rule slots
    if (state.ruleSlots) {
      for (let i = 0; i < state.ruleSlots.length; i++) {
        this.ruleDisplay.updateSlot(i, state.ruleSlots[i]);
      }
    }

    // Recover buffered hole cards (handles round-1 race where
    // "your_cards" arrives before TableScene is created)
    const bufferedCards = this.net.consumeHoleCards();
    if (bufferedCards) {
      const localSeat = this.getSeat(this.net.sessionId);
      if (localSeat) {
        localSeat.showHoleCards(bufferedCards);
        this.dealtPlayers.add(this.net.sessionId);
      }
    }

    // If we joined mid-deal/betting, show face-down cards for opponents
    if (state.phase !== "lobby" && state.phase !== "round_start") {
      state.players.forEach((p: any, sid: string) => {
        if (sid !== this.net.sessionId && p.holeCardCount > 0 && !this.dealtPlayers.has(sid)) {
          this.getSeat(sid)?.showFaceDownCards(p.holeCardCount);
          this.dealtPlayers.add(sid);
        }
      });
    }

    // Sync betting panel if in a betting phase
    if (BETTING_PHASES.has(state.phase)) {
      this.updateBettingPanel();
    }
  }

  // ================================================================
  // Player management
  // ================================================================

  private addPlayerToSeat(player: any, sessionId: string) {
    const isLocal = sessionId === this.net.sessionId;
    if (isLocal) this.localSeatIndex = player.seatIndex;

    const visualIdx = getVisualSeatIndex(player.seatIndex, this.localSeatIndex);
    if (visualIdx >= 6) return;

    const seat = this.seats[visualIdx];
    seat.setup(sessionId, player.seatIndex, isLocal);
    seat.setName(player.displayName);
    seat.setChips(player.chips);
    seat.setStatus(player.status);
    seat.setBet(player.currentBet);

    this.seatBySession.set(sessionId, visualIdx);

    // If player has been dealt cards, show face-down for opponents
    if (player.holeCardCount > 0 && !isLocal) {
      seat.showFaceDownCards(player.holeCardCount);
      this.dealtPlayers.add(sessionId);
    } else if (this.dealtPlayers.has(sessionId) && !isLocal) {
      seat.showFaceDownCards(2);
    }
  }

  private getSeat(sessionId: string): PlayerInfo | null {
    const idx = this.seatBySession.get(sessionId);
    return idx !== undefined ? this.seats[idx] : null;
  }

  private seatIndexToVisual(serverSeatIndex: number): number {
    return getVisualSeatIndex(serverSeatIndex, this.localSeatIndex);
  }

  // ================================================================
  // Event handlers
  // ================================================================

  private onPlayerAdd(player: any, sessionId: string) {
    this.addPlayerToSeat(player, sessionId);
  }

  private onPlayerRemove(sessionId: string) {
    const seat = this.getSeat(sessionId);
    if (seat) seat.reset();
    this.seatBySession.delete(sessionId);
  }

  private onPlayerChips(sessionId: string, chips: number) {
    this.getSeat(sessionId)?.setChips(chips);
  }

  private onPlayerStatus(sessionId: string, status: string) {
    this.getSeat(sessionId)?.setStatus(status);
  }

  private onPlayerBet(sessionId: string, bet: number) {
    this.getSeat(sessionId)?.setBet(bet);
  }

  private onPotChange(pot: number) {
    this.potText.setText(`Pot: $${pot}`);
  }

  private onActiveSeatChange(seatIndex: number) {
    this.updateActiveSeat(seatIndex);
    this.updateBettingPanel();
  }

  private onDealerChange(seatIndex: number) {
    this.updateDealer(seatIndex);
  }

  private onPhaseChange(phase: string, _prev: string) {
    this.phaseText.setText(PHASE_LABELS[phase] || phase);

    // Hide betting panel when leaving a betting phase
    if (!BETTING_PHASES.has(phase)) {
      this.bettingPanel.hide();
      this.timerBar.hide();
    } else {
      // Entering a betting phase, check if it's our turn
      this.updateBettingPanel();
    }

    // On new round, clear community cards and hole cards
    if (phase === "round_start" || phase === "deal") {
      this.clearCommunityCards();
      this.dealtPlayers.clear();
      for (const seat of this.seats) {
        seat.clearHoleCards();
        seat.setBet(0);
      }
    }

    // On deal phase, show face-down cards for all non-local players
    if (phase === "deal") {
      const state = this.net.getState();
      if (state) {
        state.players.forEach((p: any, sid: string) => {
          if (p.status !== "eliminated" && p.status !== "disconnected") {
            this.dealtPlayers.add(sid);
            if (sid !== this.net.sessionId) {
              this.getSeat(sid)?.showFaceDownCards(2);
            }
          }
        });
      }
    }
  }

  private onRoundNumber(round: number) {
    this.roundText.setText(round > 0 ? `Round ${round}` : "");
  }

  private onHoleCardAdd(sessionId: string, cards: any[]) {
    if (sessionId !== this.net.sessionId) return;
    const seat = this.getSeat(sessionId);
    if (!seat) return;

    seat.showHoleCards(cards);
    this.dealtPlayers.add(sessionId);
  }

  private onHoleCardCount(sessionId: string, count: number) {
    if (sessionId === this.net.sessionId) return; // local cards come via your_cards message
    const seat = this.getSeat(sessionId);
    if (!seat) return;
    if (count > 0) {
      seat.showFaceDownCards(count);
      this.dealtPlayers.add(sessionId);
    } else {
      seat.clearHoleCards();
      this.dealtPlayers.delete(sessionId);
    }
  }

  private onTimeRemaining(remaining: number) {
    const state = this.net.getState();
    if (!state) return;

    // Only show timer when it's our turn in a betting phase
    if (BETTING_PHASES.has(state.phase) && this.isLocalPlayerActive()) {
      this.timerBar.setMaxTime(state.settings?.turnTimer ?? 30);
      this.timerBar.setTime(remaining);
      this.timerBar.show();
    }
  }

  private onRuleSlotAdd(slot: any, idx: number) {
    this.ruleDisplay.updateSlot(idx, slot);
  }

  private onRuleSlotChange(slot: any, idx: number) {
    this.ruleDisplay.updateSlot(idx, slot);
  }

  private onVotingActive(active: boolean) {
    if (active) {
      const state = this.net.getState();
      if (state?.ruleSlots) {
        const slots = [];
        for (let i = 0; i < state.ruleSlots.length; i++) {
          slots.push(state.ruleSlots[i]);
        }
        this.votingPanel.show(slots);
        this.votingPanel.updateTally(
          state.votingState?.lockedCount ?? 0,
          state.votingState?.totalEligible ?? 0,
        );
      }
    } else {
      this.votingPanel.hide();
    }
  }

  private onVotingTime(time: number) {
    this.votingPanel.updateTimer(time);
  }

  private onVotingLockedCount(count: number) {
    const state = this.net.getState();
    this.votingPanel.updateTally(count, state?.votingState?.totalEligible ?? 0);
  }

  private onVoteResolved(msg: any) {
    this.votingPanel.hide();
    // Show result toast
    const summary = msg.result?.summary || "Vote resolved";
    const toast = this.add
      .text(640, 100, summary, {
        fontSize: "16px",
        color: GOLD,
        fontFamily: "monospace",
        backgroundColor: BG_PANEL,
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(60);

    this.tweens.add({
      targets: toast,
      alpha: 0,
      y: 70,
      duration: 3000,
      delay: 1500,
      onComplete: () => toast.destroy(),
    });
  }

  private onCommunityCardAdd(card: any, idx: number) {
    this.setCommunityCard(idx, card);
  }

  private onCommunityCardReveal(idx: number, revealed: boolean, card: any) {
    if (revealed) {
      this.setCommunityCard(idx, card);
    }
  }

  private onPhaseTransition(msg: any) {
    if (msg.to === "lobby") {
      this.scene.start("LobbyScene");
    }
  }

  private onShowdown(msg: any) {
    if (!msg.hands) return;

    // Reveal all hands and show hand type labels
    for (const hand of msg.hands) {
      const seat = this.getSeat(hand.playerId);
      if (seat && !seat.isLocal) {
        seat.showHoleCards(hand.cards);
      }

      // Show hand type label above seat
      const visualIdx = this.seatBySession.get(hand.playerId);
      if (visualIdx !== undefined) {
        const pos = SEAT_POSITIONS[visualIdx];
        const handLabel = (hand.handType || "").replace(/_/g, " ").toUpperCase();
        const labelText = this.add
          .text(pos.x, pos.y - 130, handLabel, {
            fontSize: "12px",
            color: TEXT_WHITE,
            fontFamily: "monospace",
            backgroundColor: BG_PANEL,
            padding: { x: 6, y: 3 },
          })
          .setOrigin(0.5)
          .setDepth(55);

        // Fade out after 4 seconds
        this.time.delayedCall(4500, () => {
          this.tweens.add({
            targets: labelText,
            alpha: 0,
            duration: 500,
            onComplete: () => labelText.destroy(),
          });
        });
      }
    }
  }

  private onRoundEnd(msg: any) {
    // Show winner highlight
    if (msg.winners) {
      for (const winner of msg.winners) {
        const seat = this.getSeat(winner.playerId);
        if (seat) {
          // Brief winner highlight text
          const idx = this.seatBySession.get(winner.playerId);
          if (idx !== undefined) {
            const pos = SEAT_POSITIONS[idx];
            const winText = this.add
              .text(pos.x, pos.y - 100, `+$${winner.amount}`, {
                fontSize: "16px",
                color: GOLD,
                fontFamily: "monospace",
              })
              .setOrigin(0.5);

            this.tweens.add({
              targets: winText,
              y: pos.y - 130,
              alpha: 0,
              duration: 2500,
              onComplete: () => winText.destroy(),
            });
          }
        }
      }
    }

    // Reveal hands of non-shown players
    if (msg.revealedHands) {
      for (const rh of msg.revealedHands) {
        const seat = this.getSeat(rh.playerId);
        if (seat && !seat.isLocal) {
          seat.showHoleCards(rh.cards);
        }
      }
    }
  }

  private onError(msg: any) {
    showToast(this, msg.message || "Error", "error");
  }

  // ================================================================
  // Betting logic
  // ================================================================

  private isLocalPlayerActive(): boolean {
    const state = this.net.getState();
    if (!state) return false;
    const localPlayer = state.players.get(this.net.sessionId);
    if (!localPlayer) return false;
    return state.activeSeatIndex === localPlayer.seatIndex;
  }

  private updateBettingPanel() {
    const state = this.net.getState();
    if (!state) return;

    if (!BETTING_PHASES.has(state.phase) || !this.isLocalPlayerActive()) {
      this.bettingPanel.hide();
      this.timerBar.hide();
      return;
    }

    const localPlayer = state.players.get(this.net.sessionId);
    if (!localPlayer || localPlayer.status === "folded" || localPlayer.status === "all_in") {
      this.bettingPanel.hide();
      return;
    }

    const currentBet = state.currentBet ?? 0;
    const myBet = localPlayer.currentBet ?? 0;
    const myChips = localPlayer.chips ?? 0;
    const bigBlind = state.settings?.bigBlind ?? 20;

    const callAmount = currentBet - myBet;
    const canCheck = callAmount === 0;
    const canCall = callAmount > 0 && myChips > 0;
    const canBet = currentBet === 0 && myChips > 0;
    const canRaise = currentBet > 0 && myChips > callAmount;
    const canAllIn = myChips > 0;

    // Min bet/raise: at least the big blind for first bet, or the current bet + min raise increment
    const minBet = canBet
      ? Math.min(bigBlind, myChips)
      : Math.min(currentBet + bigBlind, myChips + myBet);
    const maxBet = myChips + myBet;

    this.bettingPanel.show({
      canFold: true,
      canCheck,
      canCall,
      canBet,
      canRaise,
      canAllIn,
      callAmount: Math.min(callAmount, myChips),
      minBet,
      maxBet,
    });

    // Show timer
    this.timerBar.setMaxTime(state.settings?.turnTimer ?? 30);
    this.timerBar.setTime(state.timeRemaining ?? 0);
    this.timerBar.show();
  }

  // ================================================================
  // Helpers
  // ================================================================

  private updateActiveSeat(serverSeatIndex: number) {
    for (const seat of this.seats) {
      seat.setActive(false);
    }
    const visualIdx = this.seatIndexToVisual(serverSeatIndex);
    if (visualIdx < 6) {
      this.seats[visualIdx].setActive(true);
    }
  }

  private updateDealer(serverSeatIndex: number) {
    for (const seat of this.seats) {
      seat.setDealer(false);
    }
    const visualIdx = this.seatIndexToVisual(serverSeatIndex);
    if (visualIdx < 6) {
      this.seats[visualIdx].setDealer(true);
    }
  }

  private setCommunityCard(idx: number, card: any) {
    if (idx >= 5) return;
    const pos = COMMUNITY_CARD_POSITIONS[idx];

    // Remove old slot
    if (this.communitySlots[idx]) {
      this.communitySlots[idx].destroy();
    }

    if (card.revealed) {
      this.communitySlots[idx] = createCard(this, pos.x, pos.y, card.value, card.suit);
    } else {
      this.communitySlots[idx] = createFaceDown(this, pos.x, pos.y);
    }
  }

  private clearCommunityCards() {
    for (let i = 0; i < 5; i++) {
      if (this.communitySlots[i]) {
        this.communitySlots[i].destroy();
      }
      const pos = COMMUNITY_CARD_POSITIONS[i];
      this.communitySlots[i] = createEmptySlot(this, pos.x, pos.y);
    }
  }
}
