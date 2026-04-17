import type { Card, Suit } from "./types.js";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 2-10, J=11, Q=12, K=13, A=14

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Returns a function that produces deterministic floats in [0, 1).
 */
export function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create a standard 52-card deck (unshuffled). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ value, suit });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle (in-place). Uses provided RNG for reproducibility. */
export function shuffleDeck(deck: Card[], rng: () => number): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Deal N cards from the top of the deck (mutates the deck). */
export function dealCards(deck: Card[], count: number): Card[] {
  if (count > deck.length) {
    throw new Error(`Cannot deal ${count} cards from deck of ${deck.length}`);
  }
  return deck.splice(0, count);
}

/** Convenience: create a shuffled deck ready to deal from. */
export function createShuffledDeck(seed: number): Card[] {
  const deck = createDeck();
  const rng = createRng(seed);
  return shuffleDeck(deck, rng);
}
