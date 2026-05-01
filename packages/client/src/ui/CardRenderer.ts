import { GameObjects, Scene } from "phaser";
import { getValueLabel, getSuitSymbol, getSuitColor } from "../utils/cardText.js";
import { CARD_FACE, CARD_BACK, TEXT_WHITE } from "../utils/colors.js";

export const CARD_W = 50;
export const CARD_H = 70;

export function createCard(
  scene: Scene,
  x: number,
  y: number,
  value: number,
  suit: string,
): GameObjects.Container {
  const container = scene.add.container(x, y);

  // Background rect
  const bg = scene.add.graphics();
  bg.fillStyle(parseInt(CARD_FACE.slice(1), 16), 1);
  bg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 4);
  bg.lineStyle(1, 0xffffff, 0.6);
  bg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 4);
  container.add(bg);

  const color = getSuitColor(suit);

  // Value label (top-left)
  const valueText = scene.add
    .text(-CARD_W / 2 + 5, -CARD_H / 2 + 3, getValueLabel(value), {
      fontSize: "12px",
      color,
      fontFamily: "monospace",
    });
  container.add(valueText);

  // Suit symbol (center)
  const suitText = scene.add
    .text(0, 4, getSuitSymbol(suit), {
      fontSize: "22px",
      color,
      fontFamily: "monospace",
    })
    .setOrigin(0.5);
  container.add(suitText);

  return container;
}

export function createFaceDown(scene: Scene, x: number, y: number): GameObjects.Container {
  const container = scene.add.container(x, y);

  const bg = scene.add.graphics();
  bg.fillStyle(parseInt(CARD_BACK.slice(1), 16), 1);
  bg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 4);
  bg.lineStyle(1, 0x6a6a8a, 0.5);
  bg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 4);
  container.add(bg);

  // Back pattern — simple diamond
  const pattern = scene.add
    .text(0, 0, "\u25C6", {
      fontSize: "18px",
      color: "#1a1a4e",
      fontFamily: "monospace",
    })
    .setOrigin(0.5);
  container.add(pattern);

  return container;
}

export function createEmptySlot(scene: Scene, x: number, y: number): GameObjects.Container {
  const container = scene.add.container(x, y);

  const bg = scene.add.graphics();
  bg.lineStyle(1, 0x6a6a8a, 0.3);
  bg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 4);
  container.add(bg);

  return container;
}
