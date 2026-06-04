import type { Card, HandType, EvaluatedHand, AnnotatedCard, DetectionConfig } from "./types.js";
import { DEFAULT_HAND_RANKINGS, DEFAULT_DETECTION_CONFIG } from "./constants.js";

// Ace-low ("wheel") straight: A counts as 1, expressed as {5,4,3,2,A=14}.
const WHEEL_VALUES = [5, 4, 3, 2, 14] as const;

// ============================================================
// Types
// ============================================================

interface HandDetection {
  handType: HandType;
  cards: Card[];
  kickers: number[];
}

// ============================================================
// Helpers
// ============================================================

function groupByValue(cards: Card[]): Map<number, Card[]> {
  const groups = new Map<number, Card[]>();
  for (const card of cards) {
    const group = groups.get(card.value);
    if (group) group.push(card);
    else groups.set(card.value, [card]);
  }
  return groups;
}

function groupBySuit(cards: Card[]): Map<string, Card[]> {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const group = groups.get(card.suit);
    if (group) group.push(card);
    else groups.set(card.suit, [card]);
  }
  return groups;
}

function sortDesc(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => b.value - a.value);
}

function pickKickers(sorted: Card[], usedCards: Card[], count: number): number[] {
  const usedSet = new Set(usedCards);
  const kickers: number[] = [];
  for (const card of sorted) {
    if (!usedSet.has(card) && kickers.length < count) {
      kickers.push(card.value);
    }
  }
  return kickers;
}

/** Check if a card group passes source requirements (F04, F05). */
function passesSourceCheck(
  group: Card[],
  config: DetectionConfig,
  minCount: number
): boolean {
  if (!config.pairRequiresCommunity && !config.pairRequiresBothHole) return true;
  const annotated = group.filter((c): c is AnnotatedCard => "source" in c);
  if (annotated.length === 0) return true; // non-annotated cards pass

  if (config.pairRequiresCommunity) {
    if (!annotated.some((c) => c.source === "community")) return false;
  }
  if (config.pairRequiresBothHole && minCount === 2) {
    const holeCount = annotated.filter((c) => c.source === "hole").length;
    if (holeCount < 2) return false;
  }
  return true;
}

/** Check if trips pass mixed-source requirement (F09). */
function passesTripsSourceCheck(group: Card[], config: DetectionConfig): boolean {
  if (!config.tripsRequireMixedSource) return true;
  const annotated = group.filter((c): c is AnnotatedCard => "source" in c);
  if (annotated.length === 0) return true;
  const hasHole = annotated.some((c) => c.source === "hole");
  const hasCommunity = annotated.some((c) => c.source === "community");
  return hasHole && hasCommunity;
}

// ============================================================
// Straight helpers
// ============================================================

function findStraightHigh(
  values: number[],
  config: DetectionConfig
): number {
  const uniqueVals = new Set(values);
  const minCards = config.straightMinCards;

  // Check regular straights (high to low)
  for (let i = 0; i < values.length; i++) {
    const high = values[i];
    let count = 1;
    for (let j = 1; j < minCards; j++) {
      if (uniqueVals.has(high - j)) count++;
      else break;
    }
    if (count >= minCards) return high;
  }

  // Wrap-around straights (F03)
  if (config.straightWrapAround && minCards === 5) {
    // Try all possible wraps: e.g., Q-K-A-2-3, K-A-2-3-4, etc.
    const allVals = [...uniqueVals].sort((a, b) => a - b);
    // Map values to 1-14 range with ace counting as both 1 and 14
    const extendedVals = new Set(allVals);
    if (extendedVals.has(14)) extendedVals.add(1);

    for (let start = 14; start >= 1; start--) {
      let found = true;
      for (let j = 0; j < minCards; j++) {
        const v = ((start - 1 + j) % 13) + 1;
        const checkVal = v === 1 ? (extendedVals.has(1) || extendedVals.has(14) ? v : -1) : v;
        if (checkVal === -1 || (!extendedVals.has(v) && !(v === 1 && extendedVals.has(14)))) {
          found = false;
          break;
        }
      }
      if (found) {
        // Return the "high" of the wrap (the last card in sequence)
        const highVal = ((start - 1 + minCards - 1) % 13) + 1;
        return highVal === 1 ? 14 : highVal;
      }
    }
  }

  // Ace-low straight (wheel): A counts as 1. Always valid; F07 only disables ace-high.
  if (minCards === 5 && uniqueVals.has(14) && uniqueVals.has(2) && uniqueVals.has(3) && uniqueVals.has(4) && uniqueVals.has(5)) {
    return 5;
  }
  if (minCards === 6 && uniqueVals.has(14) && uniqueVals.has(2) && uniqueVals.has(3) && uniqueVals.has(4) && uniqueVals.has(5) && uniqueVals.has(6)) {
    return 6;
  }

  return -1;
}

function findStraightHighStrict(values: number[], config: DetectionConfig): number {
  // When straightAceHigh is false, ace can only be low (value 1 in straights)
  // So we remap ace=14 to ace=1 and search for straights
  if (!config.straightAceHigh) {
    const remapped = values.map((v) => (v === 14 ? 1 : v));
    const unique = [...new Set(remapped)].sort((a, b) => b - a);
    const minCards = config.straightMinCards;

    const uniqueSet = new Set(unique);
    for (let i = 0; i < unique.length; i++) {
      const high = unique[i];
      let count = 1;
      for (let j = 1; j < minCards; j++) {
        if (uniqueSet.has(high - j)) count++;
        else break;
      }
      if (count >= minCards) return high;
    }
    return -1;
  }

  return findStraightHigh(values, config);
}

// ============================================================
// Configurable Detectors
// ============================================================

function detectRoyalFlushC(cards: Card[], config: DetectionConfig): HandDetection | null {
  const suitGroups = groupBySuit(cards);
  for (const [, suited] of suitGroups) {
    if (suited.length < 5) continue;
    const values = new Set(suited.map((c) => c.value));
    if (values.has(14) && values.has(13) && values.has(12) && values.has(11) && values.has(10)) {
      const handCards = suited.filter((c) => c.value >= 10).sort((a, b) => b.value - a.value).slice(0, 5);
      return { handType: "royal_flush", cards: handCards, kickers: [] };
    }
  }
  return null;
}

function detectStraightFlushC(cards: Card[], config: DetectionConfig): HandDetection | null {
  const suitGroups = groupBySuit(cards);
  let bestHigh = -1;
  let bestCards: Card[] = [];

  for (const [, suited] of suitGroups) {
    if (suited.length < config.straightMinCards) continue;
    const sorted = sortDesc(suited);
    const uniqueValues = [...new Set(sorted.map((c) => c.value))].sort((a, b) => b - a);
    const high = findStraightHighStrict(uniqueValues, config);
    if (high === -1) continue;

    // Skip royal flush (handled separately)
    if (
      high === 14 && config.straightMinCards === 5 &&
      uniqueValues.includes(13) && uniqueValues.includes(12) &&
      uniqueValues.includes(11) && uniqueValues.includes(10)
    ) {
      continue;
    }

    if (high > bestHigh) {
      bestHigh = high;
      if (!config.straightAceHigh && high <= 5 && sorted.some((c) => c.value === 14)) {
        // Ace-low straight flush: cards have value 14 for ace; remap 1 back to 14 on lookup.
        bestCards = [];
        const used = new Set<number>();
        for (let v = high; v > high - config.straightMinCards; v--) {
          const cardVal = v === 1 ? 14 : v;
          const card = sorted.find((c) => c.value === cardVal && !used.has(cardVal));
          if (card) { bestCards.push(card); used.add(cardVal); }
        }
      } else if (high === 5 && sorted.some((c) => c.value === 14)) {
        bestCards = WHEEL_VALUES.map((v) => sorted.find((c) => c.value === v)!).filter(Boolean);
      } else {
        bestCards = [];
        for (let v = high; v > high - config.straightMinCards; v--) {
          bestCards.push(sorted.find((c) => c.value === v)!);
        }
      }
    }
  }

  if (bestHigh === -1) return null;
  return { handType: "straight_flush", cards: bestCards, kickers: [bestHigh] };
}

function detectFourOfAKindC(cards: Card[], config: DetectionConfig): HandDetection | null {
  const groups = groupByValue(cards);
  const sorted = sortDesc(cards);

  for (const [value, group] of groups) {
    if (group.length === 4 && passesSourceCheck(group, config, 4)) {
      const kickers = pickKickers(sorted, group, 1);
      return {
        handType: "four_of_a_kind",
        cards: [...group, sorted.find((c) => c.value === kickers[0] && !group.includes(c))!],
        kickers: [value, ...kickers],
      };
    }
  }
  return null;
}

function detectFullHouseC(cards: Card[], config: DetectionConfig): HandDetection | null {
  const groups = groupByValue(cards);
  const trips: [number, Card[]][] = [];
  const pairs: [number, Card[]][] = [];

  for (const [value, group] of groups) {
    if (group.length >= 3 && passesSourceCheck(group.slice(0, 3), config, 3) && passesTripsSourceCheck(group.slice(0, 3), config)) {
      trips.push([value, group]);
    }
    if (group.length >= 2 && passesSourceCheck(group.slice(0, 2), config, 2)) {
      pairs.push([value, group]);
    }
  }

  // Standard 3+2
  if (trips.length > 0) {
    trips.sort((a, b) => b[0] - a[0]);
    const bestTrip = trips[0];
    const pairCandidates = pairs.filter(([v]) => v !== bestTrip[0]).sort((a, b) => b[0] - a[0]);
    if (pairCandidates.length > 0) {
      const bestPair = pairCandidates[0];
      return {
        handType: "full_house",
        cards: [...bestTrip[1].slice(0, 3), ...bestPair[1].slice(0, 2)],
        kickers: [bestTrip[0], bestPair[0]],
      };
    }
  }

  // Full House Lite (F10): 2+2+1 counts as full house
  if (config.fullHouseLite) {
    const validPairs = pairs.filter(([, group]) => group.length >= 2 && passesSourceCheck(group.slice(0, 2), config, 2));
    if (validPairs.length >= 2) {
      validPairs.sort((a, b) => b[0] - a[0]);
      const p1 = validPairs[0];
      const p2 = validPairs[1];
      const pairCards = [...p1[1].slice(0, 2), ...p2[1].slice(0, 2)];
      const sorted = sortDesc(cards);
      const kickerCards = pickKickers(sorted, pairCards, 1);
      return {
        handType: "full_house",
        cards: [...pairCards, sorted.find((c) => c.value === kickerCards[0] && !pairCards.includes(c))!],
        kickers: [p1[0], p2[0], ...kickerCards],
      };
    }
  }

  return null;
}

function detectFlushC(cards: Card[], config: DetectionConfig): HandDetection | null {
  const suitGroups = groupBySuit(cards);

  for (const [, suited] of suitGroups) {
    if (suited.length >= config.flushMinCards && suited.length >= 5) {
      // Standard 5+ card flush
      const sorted = sortDesc(suited).slice(0, 5);
      return {
        handType: "flush",
        cards: sorted,
        kickers: sorted.map((c) => c.value),
      };
    }
    if (config.flushMinCards <= 4 && suited.length >= 4 && suited.length < 5) {
      // Short flush (F01): exactly 4 suited cards qualifies
      const sorted = sortDesc(suited).slice(0, 4);
      // Add a kicker from remaining cards
      const allSorted = sortDesc(cards);
      const kicker = allSorted.find((c) => !sorted.includes(c));
      const handCards = kicker ? [...sorted, kicker] : sorted;
      return {
        handType: "flush",
        cards: handCards.slice(0, 5),
        kickers: handCards.slice(0, 5).map((c) => c.value),
      };
    }
  }

  return null;
}

function detectThreeCardFlushC(cards: Card[], config: DetectionConfig): HandDetection | null {
  if (!config.threeCardFlush) return null;

  const suitGroups = groupBySuit(cards);

  for (const [, suited] of suitGroups) {
    // Only trigger if we don't already have a regular flush (4+ or 5+)
    if (suited.length >= config.flushMinCards) continue;
    if (suited.length >= 3) {
      const sorted = sortDesc(suited).slice(0, 3);
      const allSorted = sortDesc(cards);
      const kickers = allSorted.filter((c) => !sorted.includes(c)).slice(0, 2);
      const handCards = [...sorted, ...kickers];
      return {
        handType: "three_card_flush",
        cards: handCards.slice(0, 5),
        kickers: handCards.slice(0, 5).map((c) => c.value),
      };
    }
  }
  return null;
}

function detectStraightC(cards: Card[], config: DetectionConfig): HandDetection | null {
  const sorted = sortDesc(cards);
  const uniqueValues = [...new Set(sorted.map((c) => c.value))].sort((a, b) => b - a);
  const high = findStraightHighStrict(uniqueValues, config);

  if (high === -1) return null;

  let handCards: Card[];
  const minCards = config.straightMinCards;

  if (high === 5 && sorted.some((c) => c.value === 14)) {
    // Ace-low straight
    const targetVals = minCards === 6 ? [6, ...WHEEL_VALUES] : [...WHEEL_VALUES];
    handCards = targetVals.map((v) => sorted.find((c) => c.value === v)!);
  } else if (!config.straightAceHigh && high <= 5) {
    // Ace remapped to 1
    handCards = [];
    for (let v = high; v > high - minCards; v--) {
      const cardVal = v === 1 ? 14 : v;
      handCards.push(sorted.find((c) => c.value === cardVal)!);
    }
  } else {
    handCards = [];
    const used = new Set<number>();
    for (let v = high; v > high - minCards; v--) {
      const card = sorted.find((c) => c.value === v && !used.has(v));
      if (card) { handCards.push(card); used.add(v); }
    }
  }

  return { handType: "straight", cards: handCards, kickers: [high] };
}

function detectThreeOfAKindC(cards: Card[], config: DetectionConfig): HandDetection | null {
  const groups = groupByValue(cards);
  const sorted = sortDesc(cards);
  const trips: [number, Card[]][] = [];

  for (const [value, group] of groups) {
    if (group.length >= 3 && passesSourceCheck(group.slice(0, 3), config, 3) && passesTripsSourceCheck(group.slice(0, 3), config)) {
      trips.push([value, group]);
    }
  }

  if (trips.length === 0) return null;
  trips.sort((a, b) => b[0] - a[0]);
  const best = trips[0];
  const tripCards = best[1].slice(0, 3);
  const kickers = pickKickers(sorted, tripCards, 2);
  const kickerCards = kickers.map((v) => sorted.find((c) => c.value === v && !tripCards.includes(c))!);

  return {
    handType: "three_of_a_kind",
    cards: [...tripCards, ...kickerCards],
    kickers: [best[0], ...kickers],
  };
}

function detectTwoPairC(cards: Card[], config: DetectionConfig): HandDetection | null {
  const groups = groupByValue(cards);
  const sorted = sortDesc(cards);
  const pairs: [number, Card[]][] = [];

  for (const [value, group] of groups) {
    if (group.length >= 2 && group.length < 3 && passesSourceCheck(group.slice(0, 2), config, 2)) {
      pairs.push([value, group]);
    } else if (group.length >= 3) {
      // Three of a kind doesn't count as a pair for two-pair detection
      // (it would be detected as three_of_a_kind instead)
    }
  }

  if (pairs.length < 2) return null;
  pairs.sort((a, b) => b[0] - a[0]);

  const highPair = pairs[0];
  const lowPair = pairs[1];

  // F08: Double Pair Plus — both pairs must be >= threshold
  if (highPair[0] < config.twoPairMinValue || lowPair[0] < config.twoPairMinValue) {
    return null;
  }

  const pairCards = [...highPair[1].slice(0, 2), ...lowPair[1].slice(0, 2)];
  const kickers = pickKickers(sorted, pairCards, 1);
  const kickerCard = sorted.find((c) => c.value === kickers[0] && !pairCards.includes(c))!;

  return {
    handType: "two_pair",
    cards: [...pairCards, kickerCard],
    kickers: [highPair[0], lowPair[0], ...kickers],
  };
}

function detectOnePairC(cards: Card[], config: DetectionConfig): HandDetection | null {
  const groups = groupByValue(cards);
  const sorted = sortDesc(cards);
  const pairs: [number, Card[]][] = [];

  for (const [value, group] of groups) {
    if (group.length === 2 && passesSourceCheck(group, config, 2)) {
      pairs.push([value, group]);
    }
  }

  // Must have exactly one qualifying pair, and no group with 3+ (that would be trips or better)
  const hasTripsOrBetter = [...groups.values()].some((g) => g.length >= 3);
  if (pairs.length !== 1 || hasTripsOrBetter) return null;

  const bestPair = pairs[0];
  const pairCards = bestPair[1].slice(0, 2);
  const kickers = pickKickers(sorted, pairCards, 3);
  const kickerCards = kickers.map((v) => sorted.find((c) => c.value === v && !pairCards.includes(c))!);

  return {
    handType: "one_pair",
    cards: [...pairCards, ...kickerCards],
    kickers: [bestPair[0], ...kickers],
  };
}

function detectHighCardC(cards: Card[]): HandDetection {
  const sorted = sortDesc(cards).slice(0, 5);
  return {
    handType: "high_card",
    cards: sorted,
    kickers: sorted.map((c) => c.value),
  };
}

// ============================================================
// Main Evaluator (configurable)
// ============================================================

/**
 * Evaluate the best 5-card hand with full detection config support.
 * Used by the rule engine pipeline.
 */
export function evaluateHandWithConfig(
  cards: Card[],
  handRankings: HandType[],
  config: DetectionConfig
): EvaluatedHand {
  if (cards.length < 5) {
    throw new Error(`Need at least 5 cards to evaluate, got ${cards.length}`);
  }

  // Build ordered detectors based on handRankings
  const detectorMap: Record<string, (cards: Card[], config: DetectionConfig) => HandDetection | null> = {
    royal_flush: detectRoyalFlushC,
    straight_flush: detectStraightFlushC,
    four_of_a_kind: detectFourOfAKindC,
    full_house: detectFullHouseC,
    flush: detectFlushC,
    straight: detectStraightC,
    three_of_a_kind: detectThreeOfAKindC,
    two_pair: detectTwoPairC,
    one_pair: detectOnePairC,
    three_card_flush: detectThreeCardFlushC,
  };

  // Try detectors in ranking order
  for (let rank = 0; rank < handRankings.length; rank++) {
    const handType = handRankings[rank];
    if (handType === "high_card") continue;
    const detector = detectorMap[handType];
    if (!detector) continue;
    const result = detector(cards, config);
    if (result) {
      return {
        handType: result.handType,
        rank,
        cards: result.cards,
        kickers: result.kickers,
      };
    }
  }

  const highCard = detectHighCardC(cards);
  return {
    handType: "high_card",
    rank: handRankings.indexOf("high_card"),
    cards: highCard.cards,
    kickers: highCard.kickers,
  };
}

// ============================================================
// Wild Card Evaluator
// ============================================================

/**
 * Evaluate a hand that contains wild cards.
 * Uses a target-hand-type approach: for each hand type (best to worst),
 * check if the non-wild cards + wilds can form it.
 */
export function evaluateHandWithWilds(
  cards: AnnotatedCard[],
  handRankings: HandType[],
  config: DetectionConfig
): EvaluatedHand {
  const wilds = cards.filter((c) => c.isWild);
  const nonWilds = cards.filter((c) => !c.isWild);
  const numWilds = wilds.length;

  if (numWilds === 0) {
    return evaluateHandWithConfig(cards, handRankings, config);
  }

  // For each hand type, check if achievable
  for (let rank = 0; rank < handRankings.length; rank++) {
    const handType = handRankings[rank];
    const result = canFormWithWilds(handType, nonWilds, numWilds, config);
    if (result) {
      return { handType, rank, cards: result.cards, kickers: result.kickers };
    }
  }

  // Fallback: high card with wilds as aces
  const allValues = [...nonWilds.map((c) => c.value), ...Array(numWilds).fill(14)];
  allValues.sort((a, b) => b - a);
  const top5 = allValues.slice(0, 5);
  return {
    handType: "high_card",
    rank: handRankings.indexOf("high_card"),
    cards: cards.slice(0, 5),
    kickers: top5,
  };
}

function canFormWithWilds(
  handType: HandType,
  nonWilds: Card[],
  numWilds: number,
  config: DetectionConfig
): { cards: Card[]; kickers: number[] } | null {
  switch (handType) {
    case "royal_flush":
      return canFormRoyalFlushWild(nonWilds, numWilds);
    case "straight_flush":
      return canFormStraightFlushWild(nonWilds, numWilds, config);
    case "four_of_a_kind":
      return canFormNOfAKindWild(nonWilds, numWilds, 4);
    case "full_house":
      return canFormFullHouseWild(nonWilds, numWilds, config);
    case "flush":
      return canFormFlushWild(nonWilds, numWilds, config);
    case "straight":
      return canFormStraightWild(nonWilds, numWilds, config);
    case "three_of_a_kind":
      return canFormNOfAKindWild(nonWilds, numWilds, 3);
    case "two_pair":
      return canFormTwoPairWild(nonWilds, numWilds);
    case "one_pair":
      return canFormNOfAKindWild(nonWilds, numWilds, 2);
    case "three_card_flush":
      return config.threeCardFlush ? canFormThreeCardFlushWild(nonWilds, numWilds) : null;
    case "high_card":
      return null; // handled by fallback
    default:
      return null;
  }
}

function canFormRoyalFlushWild(nonWilds: Card[], numWilds: number): { cards: Card[]; kickers: number[] } | null {
  const royalValues = [14, 13, 12, 11, 10];
  const suitGroups = groupBySuit(nonWilds);

  for (const [, suited] of suitGroups) {
    const suitedVals = new Set(suited.map((c) => c.value));
    const have = royalValues.filter((v) => suitedVals.has(v)).length;
    if (have + numWilds >= 5) {
      return { cards: suited.slice(0, 5), kickers: [] };
    }
  }
  return null;
}

function canFormStraightFlushWild(nonWilds: Card[], numWilds: number, config: DetectionConfig): { cards: Card[]; kickers: number[] } | null {
  const suitGroups = groupBySuit(nonWilds);
  let bestHigh = -1;

  for (const [, suited] of suitGroups) {
    const suitedVals = new Set(suited.map((c) => c.value));
    const minCards = config.straightMinCards;

    // Try each possible high card
    for (let high = 14; high >= minCards; high--) {
      // Skip royal flush range
      if (high === 14 && minCards === 5) continue;
      let have = 0;
      for (let v = high; v > high - minCards; v--) {
        if (suitedVals.has(v)) have++;
      }
      if (have + numWilds >= minCards && high > bestHigh) {
        bestHigh = high;
      }
    }

    // Ace-low
    if (minCards === 5 && suitedVals.has(14)) {
      let have = 1; // ace
      for (let v = 2; v <= 5; v++) {
        if (suitedVals.has(v)) have++;
      }
      if (have + numWilds >= 5 && 5 > bestHigh) bestHigh = 5;
    }
  }

  if (bestHigh === -1) return null;
  return { cards: nonWilds.slice(0, 5), kickers: [bestHigh] };
}

function canFormNOfAKindWild(nonWilds: Card[], numWilds: number, n: number): { cards: Card[]; kickers: number[] } | null {
  const groups = groupByValue(nonWilds);
  let bestValue = -1;

  for (const [value, group] of groups) {
    if (group.length + numWilds >= n && value > bestValue) {
      bestValue = value;
    }
  }

  // Wilds alone can form n-of-a-kind (as aces)
  if (numWilds >= n && 14 > bestValue) bestValue = 14;

  if (bestValue === -1) return null;

  const sorted = sortDesc(nonWilds);
  const groupCards = sorted.filter((c) => c.value === bestValue);
  const kickers = sorted.filter((c) => c.value !== bestValue).map((c) => c.value);

  if (n === 4) {
    return { cards: nonWilds.slice(0, 5), kickers: [bestValue, kickers[0] ?? 14] };
  } else if (n === 3) {
    return { cards: nonWilds.slice(0, 5), kickers: [bestValue, ...(kickers.slice(0, 2).length ? kickers.slice(0, 2) : [14, 13])] };
  } else {
    // pair
    return { cards: nonWilds.slice(0, 5), kickers: [bestValue, ...(kickers.slice(0, 3).length ? kickers.slice(0, 3) : [14, 13, 12])] };
  }
}

function canFormFullHouseWild(nonWilds: Card[], numWilds: number, config: DetectionConfig): { cards: Card[]; kickers: number[] } | null {
  const groups = groupByValue(nonWilds);
  const entries = [...groups.entries()].sort((a, b) => b[0] - a[0]);

  // Try all (tripValue, pairValue) combinations
  for (const [tripVal, tripGroup] of entries) {
    const tripsNeeded = Math.max(0, 3 - tripGroup.length);
    if (tripsNeeded > numWilds) continue;
    const remainingWilds = numWilds - tripsNeeded;

    for (const [pairVal, pairGroup] of entries) {
      if (pairVal === tripVal) continue;
      const pairsNeeded = Math.max(0, 2 - pairGroup.length);
      if (pairsNeeded <= remainingWilds) {
        return { cards: nonWilds.slice(0, 5), kickers: [tripVal, pairVal] };
      }
    }

    // Wilds can form the pair as aces (or another high value)
    if (remainingWilds >= 2) {
      const pairVal = tripVal === 14 ? 13 : 14;
      return { cards: nonWilds.slice(0, 5), kickers: [tripVal, pairVal] };
    }
  }

  return null;
}

function canFormFlushWild(nonWilds: Card[], numWilds: number, config: DetectionConfig): { cards: Card[]; kickers: number[] } | null {
  const suitGroups = groupBySuit(nonWilds);
  const minCards = config.flushMinCards;

  for (const [, suited] of suitGroups) {
    if (suited.length + numWilds >= Math.max(minCards, 5)) {
      const sorted = sortDesc(suited).slice(0, 5);
      const values = [...sorted.map((c) => c.value)];
      while (values.length < 5) values.push(14);
      values.sort((a, b) => b - a);
      return { cards: suited.slice(0, 5), kickers: values.slice(0, 5) };
    }
    // Short flush (F01)
    if (minCards <= 4 && suited.length + numWilds >= 4) {
      const sorted = sortDesc(suited).slice(0, 4);
      const allSorted = sortDesc(nonWilds);
      const kicker = allSorted.find((c) => !sorted.includes(c));
      const values = [...sorted.map((c) => c.value), kicker?.value ?? 14].sort((a, b) => b - a);
      return { cards: suited.slice(0, 5), kickers: values.slice(0, 5) };
    }
  }
  return null;
}

function canFormStraightWild(nonWilds: Card[], numWilds: number, config: DetectionConfig): { cards: Card[]; kickers: number[] } | null {
  const uniqueVals = [...new Set(nonWilds.map((c) => c.value))].sort((a, b) => b - a);
  const minCards = config.straightMinCards;

  // Try each possible high card
  for (let high = 14; high >= minCards; high--) {
    if (!config.straightAceHigh && high === 14) continue;
    let have = 0;
    for (let v = high; v > high - minCards; v--) {
      if (uniqueVals.includes(v)) have++;
    }
    if (have + numWilds >= minCards) {
      return { cards: nonWilds.slice(0, 5), kickers: [high] };
    }
  }

  // Ace-low
  const hasAce = uniqueVals.includes(14);
  if (hasAce || numWilds > 0) {
    let have = hasAce ? 1 : 0;
    const lowVals = minCards === 5 ? [2, 3, 4, 5] : [2, 3, 4, 5, 6];
    for (const v of lowVals) {
      if (uniqueVals.includes(v)) have++;
    }
    const needed = minCards - have;
    if (needed <= numWilds) {
      return { cards: nonWilds.slice(0, 5), kickers: [minCards === 5 ? 5 : 6] };
    }
  }

  return null;
}

function canFormTwoPairWild(nonWilds: Card[], numWilds: number): { cards: Card[]; kickers: number[] } | null {
  const groups = groupByValue(nonWilds);
  const pairValues: number[] = [];

  for (const [value, group] of groups) {
    if (group.length >= 2) pairValues.push(value);
  }

  if (pairValues.length >= 2) {
    pairValues.sort((a, b) => b - a);
    const kicker = sortDesc(nonWilds).find((c) => c.value !== pairValues[0] && c.value !== pairValues[1])?.value ?? 14;
    return { cards: nonWilds.slice(0, 5), kickers: [pairValues[0], pairValues[1], kicker] };
  }

  if (pairValues.length === 1 && numWilds >= 1) {
    // Wild fills a second pair
    const otherValues = [...groups.entries()]
      .filter(([v]) => v !== pairValues[0])
      .sort((a, b) => b[0] - a[0]);
    const secondPairVal = otherValues[0]?.[0] ?? (pairValues[0] === 14 ? 13 : 14);
    return { cards: nonWilds.slice(0, 5), kickers: [pairValues[0], secondPairVal, 14] };
  }

  if (numWilds >= 2) {
    const vals = [...groups.entries()].sort((a, b) => b[0] - a[0]);
    if (vals.length >= 2) {
      return { cards: nonWilds.slice(0, 5), kickers: [vals[0][0], vals[1][0], 14] };
    }
  }

  return null;
}

function canFormThreeCardFlushWild(nonWilds: Card[], numWilds: number): { cards: Card[]; kickers: number[] } | null {
  const suitGroups = groupBySuit(nonWilds);
  for (const [, suited] of suitGroups) {
    if (suited.length + numWilds >= 3 && suited.length < 5) {
      const sorted = sortDesc(suited).slice(0, 3);
      const values = [...sorted.map((c) => c.value)];
      while (values.length < 5) values.push(14);
      return { cards: nonWilds.slice(0, 5), kickers: values.slice(0, 5) };
    }
  }
  return null;
}

// ============================================================
// Public API (backward compatible)
// ============================================================

/**
 * Evaluate the best 5-card hand from up to 7 cards.
 * Uses the standard poker hierarchy by default.
 */
export function evaluateHand(
  cards: Card[],
  handRankings: HandType[] = DEFAULT_HAND_RANKINGS
): EvaluatedHand {
  return evaluateHandWithConfig(cards, handRankings, DEFAULT_DETECTION_CONFIG);
}

/**
 * Compare two evaluated hands. Returns:
 *  -1 if handA wins, 1 if handB wins, 0 if tie.
 * Lower rank = stronger hand.
 */
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): -1 | 0 | 1 {
  if (a.rank !== b.rank) {
    return a.rank < b.rank ? -1 : 1;
  }
  const maxKickers = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < maxKickers; i++) {
    const ak = a.kickers[i] ?? 0;
    const bk = b.kickers[i] ?? 0;
    if (ak !== bk) return ak > bk ? -1 : 1;
  }
  return 0;
}

/**
 * Determine winner(s) from multiple players' hands.
 * Returns indices of winning players (multiple = split pot).
 */
export function determineWinners(
  playerCards: Card[][],
  handRankings: HandType[] = DEFAULT_HAND_RANKINGS
): number[] {
  const evaluated = playerCards.map((cards) => evaluateHand(cards, handRankings));
  let bestIndices: number[] = [0];
  for (let i = 1; i < evaluated.length; i++) {
    const cmp = compareHands(evaluated[i], evaluated[bestIndices[0]]);
    if (cmp === -1) bestIndices = [i];
    else if (cmp === 0) bestIndices.push(i);
  }
  return bestIndices;
}
