// ============================================================
// Pot Calculation — Main pot, side pots, and distribution
// ============================================================

/**
 * A pot with the amount and the players eligible to win it.
 * Side pots are created when players go all-in for different amounts.
 */
export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

/**
 * Calculate main pot and side pots from total player contributions.
 *
 * At each unique contribution level, a pot is created from the incremental
 * contributions of all players at or above that level. Only non-folded
 * players are eligible to win. If a pot has no eligible winners, its
 * amount rolls into the next pot.
 */
export function calculatePots(
  contributions: { playerId: string; amount: number }[],
  foldedPlayerIds: Set<string>
): Pot[] {
  if (contributions.length === 0) return [];

  const levels = [...new Set(contributions.map((c) => c.amount))]
    .filter((a) => a > 0)
    .sort((a, b) => a - b);

  if (levels.length === 0) return [];

  const pots: Pot[] = [];
  let prevLevel = 0;
  let rollover = 0;

  for (const level of levels) {
    const atOrAbove = contributions.filter((c) => c.amount >= level);
    const potAmount = (level - prevLevel) * atOrAbove.length;

    if (potAmount > 0) {
      const eligible = atOrAbove
        .filter((c) => !foldedPlayerIds.has(c.playerId))
        .map((c) => c.playerId);

      if (eligible.length > 0) {
        pots.push({ amount: potAmount + rollover, eligiblePlayerIds: eligible });
        rollover = 0;
      } else {
        rollover += potAmount;
      }
    }

    prevLevel = level;
  }

  if (rollover > 0 && pots.length > 0) {
    pots[pots.length - 1].amount += rollover;
  }

  return pots;
}

/**
 * Distribute pots to winners.
 *
 * For each pot, calls `getWinners` with the eligible player IDs to determine
 * winner(s). Split pots divide evenly; odd chips go to the earliest winners
 * in the returned array (typically closest to dealer button).
 */
export function distributePots(
  pots: Pot[],
  getWinners: (eligiblePlayerIds: string[]) => string[]
): Map<string, number> {
  const payouts = new Map<string, number>();

  for (const pot of pots) {
    if (pot.eligiblePlayerIds.length === 0) continue;

    const winners = getWinners(pot.eligiblePlayerIds);
    if (winners.length === 0) continue;

    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount % winners.length;

    for (let i = 0; i < winners.length; i++) {
      const winnerId = winners[i];
      const extra = i < remainder ? 1 : 0;
      payouts.set(winnerId, (payouts.get(winnerId) ?? 0) + share + extra);
    }
  }

  return payouts;
}
