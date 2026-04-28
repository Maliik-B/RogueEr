import type { Client } from "colyseus";
import type { GameRoom } from "../GameRoom.js";
import type { BettingAction } from "@rogueer/shared";
import {
  applyAction,
  getCurrentPlayerId,
  getValidActions,
} from "@rogueer/shared";

const BETTING_PHASES = new Set([
  "pre_flop_bet",
  "flop_bet",
  "turn_bet",
  "river_bet",
]);

export class BettingHandler {
  constructor(private room: GameRoom) {}

  onAction(client: Client, message: { action: BettingAction; amount?: number }) {
    if (!BETTING_PHASES.has(this.room.state.phase)) {
      this.room.sendError(client, "WRONG_PHASE", "Not a betting phase");
      return;
    }

    const player = this.room.state.players.get(client.sessionId);
    if (!player) {
      this.room.sendError(client, "NOT_PLAYER", "You are not a player");
      return;
    }

    const bettingState = this.room.bettingState;
    if (!bettingState) {
      this.room.sendError(client, "NO_BETTING", "No active betting round");
      return;
    }

    const currentId = getCurrentPlayerId(bettingState);
    if (currentId !== client.sessionId) {
      this.room.sendError(client, "NOT_YOUR_TURN", "It is not your turn");
      return;
    }

    // Validate action is actually available
    const valid = getValidActions(bettingState);
    if (!isActionValid(message.action, valid)) {
      this.room.sendError(client, "INVALID_ACTION", `Cannot ${message.action} right now`);
      return;
    }

    try {
      const newState = applyAction(bettingState, message.action, message.amount);
      this.room.bettingState = newState;
      this.room.syncBettingStateToSchema();

      if (newState.roundComplete) {
        this.room.onBettingRoundComplete();
      } else {
        this.room.startTurnTimer();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid action";
      this.room.sendError(client, "ACTION_FAILED", msg);
    }
  }
}

function isActionValid(action: BettingAction, valid: ReturnType<typeof getValidActions>): boolean {
  switch (action) {
    case "fold": return valid.canFold;
    case "check": return valid.canCheck;
    case "call": return valid.canCall;
    case "bet": return valid.canBet;
    case "raise": return valid.canRaise;
    case "all_in": return valid.canAllIn;
    default: return false;
  }
}
