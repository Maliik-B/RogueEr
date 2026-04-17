// ============================================================
// Game Phase & State Types
// ============================================================

export type GamePhase =
  | "lobby"
  | "round_start"
  | "deal"
  | "pre_flop_bet"
  | "voting_1"
  | "flop"
  | "flop_bet"
  | "voting_2"
  | "turn"
  | "turn_bet"
  | "river"
  | "river_bet"
  | "showdown"
  | "round_end";

export type PlayerStatus =
  | "waiting"
  | "acting"
  | "folded"
  | "all_in"
  | "eliminated"
  | "disconnected";

export type RuleSlotState = "active" | "solidified" | "empty";

export type RuleCategory = "hierarchy" | "card_property" | "composition";

export type RuleTier = "standard" | "advanced";

export type VoteAction = "solidify" | "delete" | "replace" | "abstain";

export type VoteVisibility = "hidden" | "after_lock" | "live";

export type EmptySlotDistribution = "balanced" | "fully_random";

export type VotingPhaseSetting = "both" | "flop_only" | "turn_only" | "none";

export type RuleTierSetting = "standard_only" | "all";

// ============================================================
// Card Types
// ============================================================

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";

export interface Card {
  value: number; // 2-14 (14 = Ace)
  suit: Suit;
}

// ============================================================
// Player Action Types
// ============================================================

export type BettingAction = "fold" | "check" | "call" | "bet" | "raise" | "all_in";

export interface PlayerActionMessage {
  type: "player_action";
  action: BettingAction;
  amount?: number;
}

export interface PlayerVoteMessage {
  type: "player_vote";
  targetSlot: number;
  action: VoteAction;
  replacementId?: string;
}

// ============================================================
// Rule Types
// ============================================================

export interface RuleInfo {
  id: string;
  category: RuleCategory;
  name: string;
  description: string;
  tier: RuleTier;
}

export interface RuleSlotData {
  index: number;
  category: RuleCategory;
  slotState: RuleSlotState;
  rule: RuleInfo | null;
  replacementOptions: RuleInfo[];
}

// ============================================================
// Vote Types
// ============================================================

export interface VoteData {
  targetSlot: number;
  action: VoteAction;
  replacementId: string;
  locked: boolean;
}

export interface VoteResultData {
  targetSlot: number;
  action: VoteAction;
  replacementId: string;
  noAction: boolean;
  summary: string;
}

// ============================================================
// Lobby Settings
// ============================================================

export interface LobbySettingsData {
  votingPhases: VotingPhaseSetting;
  votingTimer: number;
  turnTimer: number;
  blindsEnabled: boolean;
  smallBlind: number;
  bigBlind: number;
  antesEnabled: boolean;
  anteAmount: number;
  ruleSlotCount: number;
  startingChips: number;
  minPlayers: number;
  maxPlayers: number;
  eliminationMode: boolean;
  voteVisibility: VoteVisibility;
  blindEscalation: boolean;
  emptySlotDistribution: EmptySlotDistribution;
  ruleTier: RuleTierSetting;
  spectatorCardDelay: number;
}

// ============================================================
// Message Types (Client → Server)
// ============================================================

export type ClientMessage =
  | PlayerActionMessage
  | PlayerVoteMessage
  | { type: "player_ready"; ready: boolean }
  | { type: "update_settings"; settings: Partial<LobbySettingsData> }
  | { type: "start_game" }
  | { type: "leave_game" };

// ============================================================
// Message Types (Server → Client)
// ============================================================

export interface PhaseTransitionMessage {
  type: "phase_transition";
  from: GamePhase;
  to: GamePhase;
}

export interface VoteResolvedMessage {
  type: "vote_resolved";
  result: VoteResultData;
  allVotes: { playerId: string; vote: VoteData }[];
}

export interface ShowdownHandData {
  playerId: string;
  cards: Card[];
  bestHand: Card[];
  handType: string;
  handRank: number;
}

export interface ShowdownMessage {
  type: "showdown";
  hands: ShowdownHandData[];
}

export interface RoundEndMessage {
  type: "round_end";
  winners: { playerId: string; handDescription: string; amount: number }[];
  revealedHands: { playerId: string; cards: Card[] }[];
}

export interface ErrorMessage {
  type: "error";
  message: string;
  code: string;
}

export type ServerMessage =
  | PhaseTransitionMessage
  | VoteResolvedMessage
  | ShowdownMessage
  | RoundEndMessage
  | ErrorMessage
  | { type: "player_eliminated"; playerId: string };

// ============================================================
// Hand Evaluation Types
// ============================================================

export type HandType =
  | "royal_flush"
  | "straight_flush"
  | "four_of_a_kind"
  | "full_house"
  | "flush"
  | "straight"
  | "three_of_a_kind"
  | "two_pair"
  | "one_pair"
  | "three_card_flush"
  | "high_card";

export interface EvaluatedHand {
  handType: HandType;
  rank: number;
  cards: Card[];
  kickers: number[];
}

// ============================================================
// Rule Engine Types
// ============================================================

/** Card with provenance tracking (hole vs. community). */
export interface AnnotatedCard extends Card {
  source: "hole" | "community";
  originalValue: number;
  originalSuit: Suit;
  isWild: boolean;
}

/** Configuration knobs that composition rules toggle. */
export interface DetectionConfig {
  flushMinCards: number;
  straightMinCards: number;
  straightWrapAround: boolean;
  straightAceHigh: boolean;
  pairRequiresBothHole: boolean;
  pairRequiresCommunity: boolean;
  tripsRequireMixedSource: boolean;
  twoPairMinValue: number;
  fullHouseLite: boolean;
  threeCardFlush: boolean;
}

/** Context threaded through the evaluation pipeline. */
export interface EvaluationContext {
  cards: AnnotatedCard[];
  handRankings: HandType[];
  detectionConfig: DetectionConfig;
  activeRules: Rule[];
}

/** Runtime rule with apply function. */
export interface Rule extends RuleInfo {
  apply: (context: EvaluationContext) => EvaluationContext;
  conflictsWith: string[];
}
