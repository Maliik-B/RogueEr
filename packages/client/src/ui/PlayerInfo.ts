import { GameObjects, Scene } from "phaser";
import { createCard, createFaceDown, CARD_W } from "./CardRenderer.js";
import {
  TEXT_LIGHT, TEXT_DIM, TEXT_WHITE, ACCENT_RED,
  GREEN, GOLD, BG_PANEL, RED_DIM,
} from "../utils/colors.js";

const STATUS_COLORS: Record<string, string> = {
  waiting: TEXT_DIM,
  acting: GREEN,
  folded: RED_DIM,
  all_in: GOLD,
  eliminated: TEXT_DIM,
  disconnected: RED_DIM,
};

const STATUS_LABELS: Record<string, string> = {
  folded: "FOLDED",
  all_in: "ALL IN",
  eliminated: "OUT",
  disconnected: "DC",
};

export class PlayerInfo {
  private scene: Scene;
  private container: GameObjects.Container;
  private nameText: GameObjects.Text;
  private chipsText: GameObjects.Text;
  private statusText: GameObjects.Text;
  private betText: GameObjects.Text;
  private dealerBadge: GameObjects.Text;
  private activeBorder: GameObjects.Graphics;
  private holeCardContainers: GameObjects.Container[] = [];

  sessionId = "";
  seatIndex = 0;
  private _isLocal = false;

  constructor(scene: Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(x, y);

    // Active turn border (glow effect)
    this.activeBorder = scene.add.graphics();
    this.activeBorder.lineStyle(2, parseInt(ACCENT_RED.slice(1), 16), 1);
    this.activeBorder.strokeRoundedRect(-65, -22, 130, 65, 6);
    this.activeBorder.setVisible(false);
    this.container.add(this.activeBorder);

    // Background panel
    const bg = scene.add.graphics();
    bg.fillStyle(parseInt(BG_PANEL.slice(1), 16), 0.7);
    bg.fillRoundedRect(-60, -18, 120, 58, 4);
    this.container.add(bg);

    // Name
    this.nameText = scene.add
      .text(0, -10, "", { fontSize: "13px", color: TEXT_LIGHT, fontFamily: "monospace" })
      .setOrigin(0.5);
    this.container.add(this.nameText);

    // Chips
    this.chipsText = scene.add
      .text(0, 8, "", { fontSize: "12px", color: GOLD, fontFamily: "monospace" })
      .setOrigin(0.5);
    this.container.add(this.chipsText);

    // Status badge
    this.statusText = scene.add
      .text(0, 24, "", { fontSize: "10px", color: TEXT_DIM, fontFamily: "monospace" })
      .setOrigin(0.5);
    this.container.add(this.statusText);

    // Bet amount (shown below seat when player has a current bet)
    this.betText = scene.add
      .text(0, 52, "", { fontSize: "11px", color: TEXT_WHITE, fontFamily: "monospace" })
      .setOrigin(0.5);
    this.container.add(this.betText);

    // Dealer button
    this.dealerBadge = scene.add
      .text(-55, -22, "D", {
        fontSize: "12px",
        color: "#000",
        fontFamily: "monospace",
        backgroundColor: "#ffffff",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5);
    this.dealerBadge.setVisible(false);
    this.container.add(this.dealerBadge);

    this.container.setVisible(false);
  }

  setup(sessionId: string, seatIndex: number, isLocal: boolean): void {
    this.sessionId = sessionId;
    this.seatIndex = seatIndex;
    this._isLocal = isLocal;
    this.container.setVisible(true);
  }

  get isLocal(): boolean {
    return this._isLocal;
  }

  setName(name: string): void {
    const display = this._isLocal ? name + " (you)" : name;
    this.nameText.setText(display.length > 14 ? display.slice(0, 12) + ".." : display);
  }

  setChips(chips: number): void {
    this.chipsText.setText(`$${chips}`);
  }

  setStatus(status: string): void {
    const label = STATUS_LABELS[status] || "";
    this.statusText.setText(label);
    this.statusText.setColor(STATUS_COLORS[status] || TEXT_DIM);
  }

  setBet(bet: number): void {
    if (bet > 0) {
      this.betText.setText(`Bet: $${bet}`);
      this.betText.setVisible(true);
    } else {
      this.betText.setVisible(false);
    }
  }

  setActive(active: boolean): void {
    this.activeBorder.setVisible(active);
  }

  setDealer(isDealer: boolean): void {
    this.dealerBadge.setVisible(isDealer);
  }

  showHoleCards(cards: { value: number; suit: string }[]): void {
    this.clearHoleCards();
    const offsetY = -60;
    for (let i = 0; i < cards.length; i++) {
      const offsetX = (i - 0.5) * (CARD_W + 4);
      const card = createCard(this.scene, offsetX, offsetY, cards[i].value, cards[i].suit);
      this.container.add(card);
      this.holeCardContainers.push(card);
    }
  }

  showFaceDownCards(count: number = 2): void {
    this.clearHoleCards();
    const offsetY = -60;
    for (let i = 0; i < count; i++) {
      const offsetX = (i - 0.5) * (CARD_W + 4);
      const card = createFaceDown(this.scene, offsetX, offsetY);
      this.container.add(card);
      this.holeCardContainers.push(card);
    }
  }

  clearHoleCards(): void {
    for (const c of this.holeCardContainers) {
      c.destroy();
    }
    this.holeCardContainers = [];
  }

  reset(): void {
    this.container.setVisible(false);
    this.clearHoleCards();
    this.setActive(false);
    this.setDealer(false);
    this.setBet(0);
    this.setStatus("");
    this.sessionId = "";
  }

  hide(): void {
    this.container.setVisible(false);
  }

  destroy(): void {
    this.container.destroy();
  }
}
