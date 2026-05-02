import type { LobbySettingsData, HandType, DetectionConfig } from "./types.js";

// Standard poker hand rankings (index = rank, 0 = strongest)
export const DEFAULT_HAND_RANKINGS: HandType[] = [
  "royal_flush",
  "straight_flush",
  "four_of_a_kind",
  "full_house",
  "flush",
  "straight",
  "three_of_a_kind",
  "two_pair",
  "one_pair",
  "three_card_flush",
  "high_card",
];

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  flushMinCards: 5,
  straightMinCards: 5,
  straightWrapAround: false,
  straightAceHigh: true,
  pairRequiresBothHole: false,
  pairRequiresCommunity: false,
  tripsRequireMixedSource: false,
  twoPairMinValue: 2,
  fullHouseLite: false,
  threeCardFlush: false,
};

export const DEFAULT_LOBBY_SETTINGS: LobbySettingsData = {
  votingPhases: "both",
  votingTimer: 30,
  turnTimer: 30,
  blindsEnabled: true,
  smallBlind: 10,
  bigBlind: 20,
  antesEnabled: false,
  anteAmount: 0,
  ruleSlotCount: 3,
  startingChips: 1000,
  minPlayers: 2,
  maxPlayers: 6,
  eliminationMode: false,
  voteVisibility: "after_lock",
  blindEscalation: false,
  emptySlotDistribution: "balanced",
  ruleTier: "all",
  spectatorCardDelay: 0,
};

export const RECONNECT_GRACE_PERIOD_MS = 60_000;
export const ROUND_END_DELAY_MS = 5_000;
export const REPLACEMENT_OPTIONS_COUNT = 3;
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
