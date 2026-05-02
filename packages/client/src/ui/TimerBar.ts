import { GameObjects, Scene } from "phaser";
import { ACCENT_RED, TEXT_DIM } from "../utils/colors.js";

export class TimerBar {
  private container: GameObjects.Container;
  private bgBar: GameObjects.Graphics;
  private fillBar: GameObjects.Graphics;
  private maxTime = 30;
  private barWidth: number;
  private barHeight: number;

  constructor(scene: Scene, x: number, y: number, width = 400, height = 6) {
    this.barWidth = width;
    this.barHeight = height;
    this.container = scene.add.container(x, y);

    // Background
    this.bgBar = scene.add.graphics();
    this.bgBar.fillStyle(0x2a2a4a, 1);
    this.bgBar.fillRoundedRect(-width / 2, -height / 2, width, height, 3);
    this.container.add(this.bgBar);

    // Fill
    this.fillBar = scene.add.graphics();
    this.container.add(this.fillBar);

    this.container.setVisible(false);
  }

  setMaxTime(seconds: number): void {
    this.maxTime = Math.max(1, seconds);
  }

  setTime(remaining: number): void {
    this.fillBar.clear();
    const ratio = Math.max(0, Math.min(1, remaining / this.maxTime));
    const fillWidth = this.barWidth * ratio;

    // Color transitions from green → yellow → red
    let color: number;
    if (ratio > 0.5) {
      color = 0x4ade80; // green
    } else if (ratio > 0.2) {
      color = 0xfbbf24; // yellow
    } else {
      color = parseInt(ACCENT_RED.slice(1), 16); // red
    }

    this.fillBar.fillStyle(color, 1);
    this.fillBar.fillRoundedRect(
      -this.barWidth / 2, -this.barHeight / 2,
      fillWidth, this.barHeight, 3,
    );
  }

  show(): void {
    this.container.setVisible(true);
  }

  hide(): void {
    this.container.setVisible(false);
  }

  destroy(): void {
    this.container.destroy();
  }
}
