// State change events (from Colyseus schema sync)
export const PHASE_CHANGE = "phase_change";
export const POT_CHANGE = "pot_change";
export const CURRENT_BET_CHANGE = "current_bet_change";
export const TIME_REMAINING = "time_remaining";
export const ACTIVE_SEAT_CHANGE = "active_seat_change";
export const DEALER_CHANGE = "dealer_change";
export const ROUND_NUMBER = "round_number";

// Player events
export const PLAYER_ADD = "player_add";
export const PLAYER_REMOVE = "player_remove";
export const PLAYER_CHIPS = "player_chips";
export const PLAYER_STATUS = "player_status";
export const PLAYER_BET = "player_bet";
export const PLAYER_READY = "player_ready";
export const PLAYER_HOST = "player_host";
export const PLAYER_DISPLAY_NAME = "player_display_name";
export const HOLE_CARD_ADD = "hole_card_add";
export const HOLE_CARDS_CLEAR = "hole_cards_clear";
export const PLAYER_HOLE_CARD_COUNT = "player_hole_card_count";
export const PLAYER_VOTE_CHANGE = "player_vote_change";

// Community card events
export const COMMUNITY_CARD_ADD = "community_card_add";
export const COMMUNITY_CARD_REVEAL = "community_card_reveal";
export const COMMUNITY_CARDS_CLEAR = "community_cards_clear";

// Rule slot events
export const RULE_SLOT_ADD = "rule_slot_add";
export const RULE_SLOT_REMOVE = "rule_slot_remove";
export const RULE_SLOT_CHANGE = "rule_slot_change";

// Voting state events
export const VOTING_ACTIVE = "voting_active";
export const VOTING_TIME = "voting_time";
export const VOTING_LOCKED_COUNT = "voting_locked_count";

// Settings events
export const SETTINGS_CHANGE = "settings_change";

// Server broadcast events
export const SERVER_ERROR = "server_error";
export const PHASE_TRANSITION = "phase_transition";
export const VOTE_RESOLVED = "vote_resolved";
export const SHOWDOWN = "showdown";
export const ROUND_END = "round_end";
export const PLAYER_ELIMINATED = "player_eliminated";

// Connection events
export const CONNECTED = "connected";
export const DISCONNECTED = "disconnected";
