import { Client, Room, getStateCallbacks } from "colyseus.js";
import { Events } from "phaser";
import type { BettingAction, VoteAction, LobbySettingsData } from "@rogueer/shared";
import * as E from "./events.js";

export class NetworkManager {
  private static instance: NetworkManager;

  private client: Client;
  private room: Room | null = null;
  private detachCallbacks: (() => void)[] = [];

  readonly events = new Events.EventEmitter();
  sessionId = "";

  /** Buffered hole cards from the last "your_cards" message (survives scene transitions). */
  private _lastHoleCards: { value: number; suit: string }[] | null = null;

  private constructor() {
    this.client = new Client("ws://localhost:2567");
  }

  static getInstance(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  getRoom(): Room | null {
    return this.room;
  }

  getState(): any {
    return this.room?.state;
  }

  // ================================================================
  // Connection
  // ================================================================

  async joinGame(displayName: string): Promise<void> {
    if (this.room) {
      await this.room.leave();
      this.cleanup();
    }

    this.room = await this.client.joinOrCreate("game", { displayName });
    this.sessionId = this.room.sessionId;
    this.wireStateListeners();
    this.wireMessageHandlers();
    this.events.emit(E.CONNECTED);
  }

  async leaveGame(): Promise<void> {
    if (this.room) {
      await this.room.leave();
      this.cleanup();
    }
  }

  // ================================================================
  // Sending messages
  // ================================================================

  sendReady(ready: boolean): void {
    this.room?.send("player_ready", { ready });
  }

  sendSettings(settings: Partial<LobbySettingsData>): void {
    this.room?.send("update_settings", { settings });
  }

  sendStartGame(): void {
    this.room?.send("start_game", {});
  }

  sendAction(action: BettingAction, amount?: number): void {
    this.room?.send("player_action", { action, amount });
  }

  sendVote(targetSlot: number, action: VoteAction, replacementId?: string): void {
    this.room?.send("player_vote", { targetSlot, action, replacementId });
  }

  sendLeave(): void {
    this.room?.send("leave_game", {});
  }

  // ================================================================
  // State listeners
  // ================================================================

  private wireStateListeners(): void {
    if (!this.room) return;

    const $ = getStateCallbacks(this.room);
    if (!$) return;

    const state$ = $(this.room.state);

    // Top-level primitive properties
    this.detachCallbacks.push(
      state$.listen("phase", (val: string, prev: string) => {
        this.events.emit(E.PHASE_CHANGE, val, prev);
      }),
      state$.listen("pot", (val: number) => {
        this.events.emit(E.POT_CHANGE, val);
      }),
      state$.listen("currentBet", (val: number) => {
        this.events.emit(E.CURRENT_BET_CHANGE, val);
      }),
      state$.listen("timeRemaining", (val: number) => {
        this.events.emit(E.TIME_REMAINING, val);
      }),
      state$.listen("activeSeatIndex", (val: number) => {
        this.events.emit(E.ACTIVE_SEAT_CHANGE, val);
      }),
      state$.listen("dealerSeatIndex", (val: number) => {
        this.events.emit(E.DEALER_CHANGE, val);
      }),
      state$.listen("roundNumber", (val: number) => {
        this.events.emit(E.ROUND_NUMBER, val);
      }),
    );

    // Players (MapSchema)
    this.detachCallbacks.push(
      state$.players.onAdd((player: any, sessionId: string) => {
        this.events.emit(E.PLAYER_ADD, player, sessionId);

        const p$ = $(player);
        this.detachCallbacks.push(
          p$.listen("chips", (val: number) => {
            this.events.emit(E.PLAYER_CHIPS, sessionId, val);
          }),
          p$.listen("status", (val: string) => {
            this.events.emit(E.PLAYER_STATUS, sessionId, val);
          }),
          p$.listen("currentBet", (val: number) => {
            this.events.emit(E.PLAYER_BET, sessionId, val);
          }),
          p$.listen("isReady", (val: boolean) => {
            this.events.emit(E.PLAYER_READY, sessionId, val);
          }),
          p$.listen("isHost", (val: boolean) => {
            this.events.emit(E.PLAYER_HOST, sessionId, val);
          }),
          p$.listen("displayName", (val: string) => {
            this.events.emit(E.PLAYER_DISPLAY_NAME, sessionId, val);
          }),
        );

        // Hole card count (for rendering face-down cards for opponents)
        this.detachCallbacks.push(
          p$.listen("holeCardCount", (val: number) => {
            this.events.emit(E.PLAYER_HOLE_CARD_COUNT, sessionId, val);
          }),
        );

        // Vote changes
        p$.listen("vote", (val: any) => {
          this.events.emit(E.PLAYER_VOTE_CHANGE, sessionId, val);
        });
      }),
      state$.players.onRemove((_player: any, sessionId: string) => {
        this.events.emit(E.PLAYER_REMOVE, sessionId);
      }),
    );

    // Community cards (ArraySchema)
    this.detachCallbacks.push(
      state$.communityCards.onAdd((card: any, idx: number) => {
        this.events.emit(E.COMMUNITY_CARD_ADD, card, idx);
        this.detachCallbacks.push(
          $(card).listen("revealed", (val: boolean) => {
            this.events.emit(E.COMMUNITY_CARD_REVEAL, idx, val, card);
          }),
        );
      }),
    );

    // Rule slots (ArraySchema)
    this.detachCallbacks.push(
      state$.ruleSlots.onAdd((slot: any, idx: number) => {
        this.events.emit(E.RULE_SLOT_ADD, slot, idx);
        const slot$ = $(slot);
        this.detachCallbacks.push(
          slot$.listen("slotState", () => {
            this.events.emit(E.RULE_SLOT_CHANGE, slot, idx);
          }),
          slot$.listen("category", () => {
            this.events.emit(E.RULE_SLOT_CHANGE, slot, idx);
          }),
        );
      }),
      state$.ruleSlots.onRemove((_slot: any, idx: number) => {
        this.events.emit(E.RULE_SLOT_REMOVE, idx);
      }),
    );

    // Voting state (nested schema)
    const vs$ = state$.votingState;
    this.detachCallbacks.push(
      vs$.listen("active", (val: boolean) => {
        this.events.emit(E.VOTING_ACTIVE, val);
      }),
      vs$.listen("timeRemaining", (val: number) => {
        this.events.emit(E.VOTING_TIME, val);
      }),
      vs$.listen("lockedCount", (val: number) => {
        this.events.emit(E.VOTING_LOCKED_COUNT, val);
      }),
    );

    // Settings (nested schema) — use listen on key properties to avoid onChange refId issue
    const settings$ = state$.settings;
    const emitSettings = () => {
      this.events.emit(E.SETTINGS_CHANGE, this.room!.state.settings);
    };
    this.detachCallbacks.push(
      settings$.listen("smallBlind", emitSettings),
      settings$.listen("bigBlind", emitSettings),
      settings$.listen("turnTimer", emitSettings),
      settings$.listen("votingTimer", emitSettings),
      settings$.listen("startingChips", emitSettings),
      settings$.listen("minPlayers", emitSettings),
      settings$.listen("maxPlayers", emitSettings),
      settings$.listen("votingPhases", emitSettings),
      settings$.listen("eliminationMode", emitSettings),
      settings$.listen("ruleSlotCount", emitSettings),
    );
  }

  // ================================================================
  // Message handlers
  // ================================================================

  private wireMessageHandlers(): void {
    if (!this.room) return;

    this.room.onMessage("error", (msg: any) => {
      this.events.emit(E.SERVER_ERROR, msg);
    });

    this.room.onMessage("your_cards", (msg: any) => {
      this._lastHoleCards = msg.cards;
      this.events.emit(E.HOLE_CARD_ADD, this.sessionId, msg.cards);
    });

    this.room.onMessage("phase_transition", (msg: any) => {
      this.events.emit(E.PHASE_TRANSITION, msg);
    });

    this.room.onMessage("vote_resolved", (msg: any) => {
      this.events.emit(E.VOTE_RESOLVED, msg);
    });

    this.room.onMessage("showdown", (msg: any) => {
      this.events.emit(E.SHOWDOWN, msg);
    });

    this.room.onMessage("round_end", (msg: any) => {
      this.events.emit(E.ROUND_END, msg);
    });

    this.room.onMessage("player_eliminated", (msg: any) => {
      this.events.emit(E.PLAYER_ELIMINATED, msg);
    });

    this.room.onLeave((code: number) => {
      this.events.emit(E.DISCONNECTED, code);
    });
  }

  /** Return buffered hole cards (and clear the buffer). */
  consumeHoleCards(): { value: number; suit: string }[] | null {
    const cards = this._lastHoleCards;
    this._lastHoleCards = null;
    return cards;
  }

  private cleanup(): void {
    for (const detach of this.detachCallbacks) {
      detach();
    }
    this.detachCallbacks = [];
    this.room = null;
    this.sessionId = "";
  }
}
