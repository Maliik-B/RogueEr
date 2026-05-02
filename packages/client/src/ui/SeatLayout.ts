export interface SeatPosition {
  x: number;
  y: number;
}

// 6 visual seat positions around a 1280x720 canvas.
// Seat 0 = bottom-center (local player always here).
export const SEAT_POSITIONS: SeatPosition[] = [
  { x: 640, y: 570 },   // 0: bottom-center (local)
  { x: 200, y: 480 },   // 1: bottom-left
  { x: 160, y: 200 },   // 2: top-left
  { x: 640, y: 120 },   // 3: top-center
  { x: 1120, y: 200 },  // 4: top-right
  { x: 1080, y: 480 },  // 5: bottom-right
];

// Community cards: 5 slots centered at (640, 340)
export const COMMUNITY_CARD_POSITIONS: SeatPosition[] = [
  { x: 500, y: 340 },
  { x: 570, y: 340 },
  { x: 640, y: 340 },
  { x: 710, y: 340 },
  { x: 780, y: 340 },
];

export const POT_POSITION: SeatPosition = { x: 640, y: 280 };

export const TABLE_CENTER: SeatPosition = { x: 640, y: 340 };

/**
 * Rotate a server seatIndex so that the local player appears at visual seat 0.
 */
export function getVisualSeatIndex(
  playerSeatIndex: number,
  localSeatIndex: number,
  totalSeats: number = 6,
): number {
  return (playerSeatIndex - localSeatIndex + totalSeats) % totalSeats;
}
