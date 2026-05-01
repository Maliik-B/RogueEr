const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
  spades: "\u2660",
};

const VALUE_LABELS: Record<number, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8",
  9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
};

export function getValueLabel(value: number): string {
  return VALUE_LABELS[value] ?? String(value);
}

export function getSuitSymbol(suit: string): string {
  return SUIT_SYMBOLS[suit] ?? "?";
}

export function getSuitColor(suit: string): string {
  return suit === "hearts" || suit === "diamonds" ? "#e94560" : "#ffffff";
}
