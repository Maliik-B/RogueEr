import type { Client } from "colyseus";
import type { GameRoom } from "../GameRoom.js";
import type { VoteAction } from "@rogueer/shared";
import { VoteSchema, RuleInfoSchema } from "../../schema/GameState.js";

const VOTING_PHASES = new Set(["voting_1", "voting_2"]);

export class VotingHandler {
  constructor(private room: GameRoom) {}

  onVote(client: Client, message: { targetSlot: number; action: VoteAction; replacementId?: string }) {
    if (!VOTING_PHASES.has(this.room.state.phase)) {
      this.room.sendError(client, "WRONG_PHASE", "Not a voting phase");
      return;
    }

    const player = this.room.state.players.get(client.sessionId);
    if (!player) {
      this.room.sendError(client, "NOT_PLAYER", "You are not a player");
      return;
    }
    if (player.status === "folded" || player.status === "eliminated") {
      this.room.sendError(client, "INELIGIBLE", "Folded/eliminated players cannot vote");
      return;
    }
    if (player.vote?.locked) {
      this.room.sendError(client, "VOTE_LOCKED", "Vote already locked");
      return;
    }

    const { action, targetSlot, replacementId } = message;

    // Validate targetSlot range
    if (targetSlot < 0 || targetSlot >= this.room.state.ruleSlots.length) {
      this.room.sendError(client, "INVALID_SLOT", "Invalid rule slot index");
      return;
    }

    // Validate slot targeting rules
    const slot = this.room.state.ruleSlots[targetSlot];
    if (action !== "abstain") {
      if (slot.slotState === "solidified") {
        this.room.sendError(client, "SLOT_SOLIDIFIED", "Cannot target a solidified slot");
        return;
      }
      if (slot.slotState === "empty" && (action === "solidify" || action === "delete")) {
        this.room.sendError(client, "SLOT_EMPTY", "Can only replace an empty slot");
        return;
      }
    }

    // Validate replacement selection
    if (action === "replace" && replacementId) {
      const validReplacement = slot.replacementOptions.some(
        (r: RuleInfoSchema) => r.id === replacementId
      );
      if (!validReplacement) {
        this.room.sendError(client, "INVALID_REPLACEMENT", "Invalid replacement rule");
        return;
      }
    }

    // Apply vote
    const vote = new VoteSchema();
    vote.targetSlot = targetSlot;
    vote.action = action;
    vote.replacementId = replacementId ?? "";
    vote.locked = true;
    player.vote = vote;

    this.room.state.votingState.lockedCount++;

    // Check if all eligible have voted
    if (this.room.state.votingState.lockedCount >= this.room.state.votingState.totalEligible) {
      this.room.resolveVotes();
    }
  }
}
