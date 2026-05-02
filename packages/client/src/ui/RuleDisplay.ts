import { GameObjects, Scene } from "phaser";
import { TEXT_LIGHT, TEXT_DIM, BG_PANEL, GREEN, GOLD, ACCENT_RED } from "../utils/colors.js";

const CATEGORY_LABELS: Record<string, string> = {
  hierarchy: "H",
  card_property: "C",
  composition: "F",
};

const STATE_INDICATORS: Record<string, { symbol: string; color: string }> = {
  active: { symbol: "\u25CF", color: GREEN },      // ●
  solidified: { symbol: "\u25C6", color: GOLD },   // ◆
  empty: { symbol: "\u25CB", color: TEXT_DIM },     // ○
};

export class RuleDisplay {
  private container: GameObjects.Container;
  private slotRows: {
    stateIcon: GameObjects.Text;
    categoryBadge: GameObjects.Text;
    nameText: GameObjects.Text;
    descText: GameObjects.Text;
    descVisible: boolean;
  }[] = [];
  private scene: Scene;

  constructor(scene: Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(x, y);

    // Background
    const bg = scene.add.graphics();
    bg.fillStyle(parseInt(BG_PANEL.slice(1), 16), 0.7);
    bg.fillRoundedRect(0, 0, 230, 110, 4);
    this.container.add(bg);

    // Title
    const title = scene.add
      .text(115, 8, "Active Rules", {
        fontSize: "11px",
        color: TEXT_DIM,
        fontFamily: "monospace",
      })
      .setOrigin(0.5, 0);
    this.container.add(title);

    // 3 slot rows
    for (let i = 0; i < 3; i++) {
      const rowY = 28 + i * 26;

      const stateIcon = scene.add
        .text(10, rowY, "\u25CB", {
          fontSize: "10px",
          color: TEXT_DIM,
          fontFamily: "monospace",
        });
      this.container.add(stateIcon);

      const categoryBadge = scene.add
        .text(24, rowY, "?", {
          fontSize: "10px",
          color: ACCENT_RED,
          fontFamily: "monospace",
        });
      this.container.add(categoryBadge);

      const nameText = scene.add
        .text(38, rowY, "---", {
          fontSize: "11px",
          color: TEXT_LIGHT,
          fontFamily: "monospace",
        })
        .setInteractive({ useHandCursor: true });
      this.container.add(nameText);

      // Tooltip description (hidden by default, positioned left of panel)
      const descText = scene.add
        .text(x - 5, y + rowY, "", {
          fontSize: "10px",
          color: TEXT_LIGHT,
          fontFamily: "monospace",
          backgroundColor: "#0a0a1a",
          padding: { x: 6, y: 4 },
          wordWrap: { width: 220 },
        })
        .setOrigin(1, 0)
        .setVisible(false)
        .setDepth(100);

      nameText.on("pointerover", () => {
        if (descText.text) descText.setVisible(true);
      });
      nameText.on("pointerout", () => {
        descText.setVisible(false);
      });

      this.slotRows.push({
        stateIcon,
        categoryBadge,
        nameText,
        descText,
        descVisible: false,
      });
    }
  }

  updateSlot(index: number, slot: any): void {
    if (index >= 3) return;
    const row = this.slotRows[index];

    const stateInfo = STATE_INDICATORS[slot.slotState] || STATE_INDICATORS.empty;
    row.stateIcon.setText(stateInfo.symbol);
    row.stateIcon.setColor(stateInfo.color);

    row.categoryBadge.setText(CATEGORY_LABELS[slot.category] || "?");

    if (slot.rule) {
      const name = slot.rule.name || slot.rule.id;
      row.nameText.setText(name.length > 22 ? name.slice(0, 20) + ".." : name);
      row.descText.setText(slot.rule.description || "");
    } else {
      row.nameText.setText(slot.slotState === "empty" ? "(empty)" : "---");
      row.descText.setText("");
    }
  }

  destroy(): void {
    for (const row of this.slotRows) {
      row.descText.destroy();
    }
    this.container.destroy();
  }
}
