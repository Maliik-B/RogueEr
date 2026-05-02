import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";

// ============================================================
// Card Schemas
// ============================================================

export class CardSchema extends Schema {
  @type("uint8") value: number = 0;
  @type("string") suit: string = "";
}

export class CommunityCardSchema extends Schema {
  @type("uint8") value: number = 0;
  @type("string") suit: string = "";
  @type("boolean") revealed: boolean = false;
}

// ============================================================
// Rule Schemas
// ============================================================

export class RuleInfoSchema extends Schema {
  @type("string") id: string = "";
  @type("string") category: string = "";
  @type("string") name: string = "";
  @type("string") description: string = "";
  @type("string") tier: string = "";
}

export class RuleSlotSchema extends Schema {
  @type("uint8") index: number = 0;
  @type("string") category: string = "";
  @type("string") slotState: string = "empty";
  @type(RuleInfoSchema) rule: RuleInfoSchema | null = null;
  @type([RuleInfoSchema]) replacementOptions = new ArraySchema<RuleInfoSchema>();
}

// ============================================================
// Vote Schemas
// ============================================================

export class VoteSchema extends Schema {
  @type("uint8") targetSlot: number = 0;
  @type("string") action: string = "abstain";
  @type("string") replacementId: string = "";
  @type("boolean") locked: boolean = false;
}

export class VoteResultSchema extends Schema {
  @type("uint8") targetSlot: number = 0;
  @type("string") action: string = "";
  @type("string") replacementId: string = "";
  @type("boolean") noAction: boolean = false;
  @type("string") summary: string = "";
}

export class VotingStateSchema extends Schema {
  @type("boolean") active: boolean = false;
  @type("uint8") phase: number = 0;
  @type("uint16") timeRemaining: number = 0;
  @type("uint8") totalEligible: number = 0;
  @type("uint8") lockedCount: number = 0;
  @type(VoteResultSchema) lastResult: VoteResultSchema | null = null;
}

// ============================================================
// Side Pot Schema
// ============================================================

export class SidePotSchema extends Schema {
  @type("uint32") amount: number = 0;
  @type(["string"]) eligiblePlayerIds = new ArraySchema<string>();
}

// ============================================================
// Player & Spectator Schemas
// ============================================================

export class PlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") displayName: string = "";
  @type("uint8") seatIndex: number = 0;
  @type("string") status: string = "waiting";
  @type("uint32") chips: number = 0;
  @type("uint32") currentBet: number = 0;
  @type("boolean") isReady: boolean = false;
  @type("boolean") isHost: boolean = false;

  // Number of hole cards dealt (clients render face-down cards for opponents)
  @type("uint8") holeCardCount: number = 0;

  // Vote (visible to all for now — vote visibility filtering deferred to Phase 5)
  @type(VoteSchema) vote: VoteSchema | null = null;
}

export class SpectatorSchema extends Schema {
  @type("string") sessionId: string = "";
  @type("string") displayName: string = "";
}

// ============================================================
// Lobby Settings Schema
// ============================================================

export class LobbySettingsSchema extends Schema {
  @type("string") votingPhases: string = "both";
  @type("uint16") votingTimer: number = 30;
  @type("uint16") turnTimer: number = 30;
  @type("boolean") blindsEnabled: boolean = true;
  @type("uint32") smallBlind: number = 10;
  @type("uint32") bigBlind: number = 20;
  @type("boolean") antesEnabled: boolean = false;
  @type("uint32") anteAmount: number = 0;
  @type("uint8") ruleSlotCount: number = 3;
  @type("uint32") startingChips: number = 1000;
  @type("uint8") minPlayers: number = 2;
  @type("uint8") maxPlayers: number = 6;
  @type("boolean") eliminationMode: boolean = false;
  @type("string") voteVisibility: string = "after_lock";
  @type("boolean") blindEscalation: boolean = false;
  @type("string") emptySlotDistribution: string = "balanced";
  @type("string") ruleTier: string = "all";
  @type("uint16") spectatorCardDelay: number = 0;
}

// ============================================================
// Game State (Top-Level Room State)
// ============================================================

export class GameState extends Schema {
  @type("string") phase: string = "lobby";
  @type("uint16") roundNumber: number = 0;
  @type("uint8") dealerSeatIndex: number = 0;
  @type("uint8") activeSeatIndex: number = 0;
  @type("uint32") pot: number = 0;
  @type("uint32") currentBet: number = 0;
  @type("uint16") timeRemaining: number = 0;

  @type([CommunityCardSchema]) communityCards = new ArraySchema<CommunityCardSchema>();
  @type([SidePotSchema]) sidePots = new ArraySchema<SidePotSchema>();
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: SpectatorSchema }) spectators = new MapSchema<SpectatorSchema>();
  @type([RuleSlotSchema]) ruleSlots = new ArraySchema<RuleSlotSchema>();
  @type(VotingStateSchema) votingState = new VotingStateSchema();
  @type(LobbySettingsSchema) settings = new LobbySettingsSchema();
}
