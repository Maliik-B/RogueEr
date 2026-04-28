import type { Client } from "colyseus";
import type { GameRoom } from "../GameRoom.js";

export class LobbyHandler {
  constructor(private room: GameRoom) {}

  onReady(client: Client, message: { ready: boolean }) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player) return;
    if (this.room.state.phase !== "lobby") {
      this.room.sendError(client, "NOT_IN_LOBBY", "Can only toggle ready in lobby");
      return;
    }
    player.isReady = message.ready ?? !player.isReady;
  }

  onUpdateSettings(client: Client, message: { settings: Record<string, unknown> }) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player?.isHost) {
      this.room.sendError(client, "NOT_HOST", "Only the host can update settings");
      return;
    }
    if (this.room.state.phase !== "lobby") {
      this.room.sendError(client, "NOT_IN_LOBBY", "Settings can only be changed in lobby");
      return;
    }

    const s = this.room.state.settings;
    const m = message.settings;
    if (m.votingPhases !== undefined) s.votingPhases = String(m.votingPhases);
    if (m.votingTimer !== undefined) s.votingTimer = clamp(Number(m.votingTimer), 15, 60);
    if (m.turnTimer !== undefined) s.turnTimer = clamp(Number(m.turnTimer), 15, 60);
    if (m.blindsEnabled !== undefined) s.blindsEnabled = Boolean(m.blindsEnabled);
    if (m.smallBlind !== undefined) s.smallBlind = Math.max(1, Number(m.smallBlind));
    if (m.bigBlind !== undefined) s.bigBlind = Math.max(1, Number(m.bigBlind));
    if (m.antesEnabled !== undefined) s.antesEnabled = Boolean(m.antesEnabled);
    if (m.anteAmount !== undefined) s.anteAmount = Math.max(0, Number(m.anteAmount));
    if (m.ruleSlotCount !== undefined) s.ruleSlotCount = clamp(Number(m.ruleSlotCount), 1, 3);
    if (m.startingChips !== undefined) s.startingChips = Math.max(1, Number(m.startingChips));
    if (m.minPlayers !== undefined) s.minPlayers = clamp(Number(m.minPlayers), 2, 8);
    if (m.maxPlayers !== undefined) s.maxPlayers = clamp(Number(m.maxPlayers), 2, 8);
    if (m.eliminationMode !== undefined) s.eliminationMode = Boolean(m.eliminationMode);
    if (m.voteVisibility !== undefined) s.voteVisibility = String(m.voteVisibility);
    if (m.blindEscalation !== undefined) s.blindEscalation = Boolean(m.blindEscalation);
    if (m.emptySlotDistribution !== undefined) s.emptySlotDistribution = String(m.emptySlotDistribution);
    if (m.ruleTier !== undefined) s.ruleTier = String(m.ruleTier);
    if (m.spectatorCardDelay !== undefined) s.spectatorCardDelay = Math.max(0, Number(m.spectatorCardDelay));
  }

  onStartGame(client: Client) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player?.isHost) {
      this.room.sendError(client, "NOT_HOST", "Only the host can start the game");
      return;
    }
    if (this.room.state.phase !== "lobby") {
      this.room.sendError(client, "NOT_IN_LOBBY", "Game already in progress");
      return;
    }

    const playerCount = this.room.state.players.size;
    if (playerCount < this.room.state.settings.minPlayers) {
      this.room.sendError(client, "NOT_ENOUGH_PLAYERS", `Need at least ${this.room.state.settings.minPlayers} players`);
      return;
    }

    // Check all players are ready (host is exempt)
    let allReady = true;
    this.room.state.players.forEach((p) => {
      if (!p.isHost && !p.isReady) allReady = false;
    });
    if (!allReady) {
      this.room.sendError(client, "NOT_ALL_READY", "All players must be ready");
      return;
    }

    this.room.phaseEngine.transitionTo("round_start");
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
