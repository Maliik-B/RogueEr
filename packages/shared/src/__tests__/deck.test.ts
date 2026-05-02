import { describe, it, expect } from "vitest";
import { createDeck, shuffleDeck, dealCards, createShuffledDeck, createRng } from "../deck.js";

describe("createDeck", () => {
  it("creates 52 cards", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
  });

  it("has 13 cards per suit", () => {
    const deck = createDeck();
    const suits = ["hearts", "diamonds", "clubs", "spades"];
    for (const suit of suits) {
      const suitCards = deck.filter((c) => c.suit === suit);
      expect(suitCards).toHaveLength(13);
    }
  });

  it("has values 2-14 for each suit", () => {
    const deck = createDeck();
    const hearts = deck.filter((c) => c.suit === "hearts").map((c) => c.value);
    expect(hearts.sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("has no duplicates", () => {
    const deck = createDeck();
    const keys = deck.map((c) => `${c.value}-${c.suit}`);
    expect(new Set(keys).size).toBe(52);
  });
});

describe("createRng", () => {
  it("produces deterministic output for the same seed", () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it("produces different output for different seeds", () => {
    const rng1 = createRng(42);
    const rng2 = createRng(99);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  it("produces values in [0, 1)", () => {
    const rng = createRng(12345);
    for (let i = 0; i < 1000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

describe("shuffleDeck", () => {
  it("returns the same 52 cards", () => {
    const deck = createDeck();
    const rng = createRng(42);
    shuffleDeck(deck, rng);
    expect(deck).toHaveLength(52);
    const keys = deck.map((c) => `${c.value}-${c.suit}`);
    expect(new Set(keys).size).toBe(52);
  });

  it("is deterministic with the same seed", () => {
    const deck1 = createDeck();
    const deck2 = createDeck();
    shuffleDeck(deck1, createRng(42));
    shuffleDeck(deck2, createRng(42));
    expect(deck1).toEqual(deck2);
  });

  it("produces different order with different seeds", () => {
    const deck1 = createDeck();
    const deck2 = createDeck();
    shuffleDeck(deck1, createRng(42));
    shuffleDeck(deck2, createRng(99));
    // Extremely unlikely (1/52!) to be the same
    expect(deck1).not.toEqual(deck2);
  });
});

describe("dealCards", () => {
  it("removes cards from the top of the deck", () => {
    const deck = createShuffledDeck(42);
    const first = { ...deck[0] };
    const second = { ...deck[1] };
    const dealt = dealCards(deck, 2);

    expect(dealt).toHaveLength(2);
    expect(dealt[0]).toEqual(first);
    expect(dealt[1]).toEqual(second);
    expect(deck).toHaveLength(50);
  });

  it("throws when dealing more cards than available", () => {
    const deck = createShuffledDeck(42);
    expect(() => dealCards(deck, 53)).toThrow("Cannot deal 53 cards from deck of 52");
  });

  it("can deal the entire deck", () => {
    const deck = createShuffledDeck(42);
    const dealt = dealCards(deck, 52);
    expect(dealt).toHaveLength(52);
    expect(deck).toHaveLength(0);
  });
});

describe("createShuffledDeck", () => {
  it("returns 52 unique shuffled cards", () => {
    const deck = createShuffledDeck(42);
    expect(deck).toHaveLength(52);
    const keys = deck.map((c) => `${c.value}-${c.suit}`);
    expect(new Set(keys).size).toBe(52);
  });

  it("is deterministic", () => {
    expect(createShuffledDeck(42)).toEqual(createShuffledDeck(42));
  });
});
