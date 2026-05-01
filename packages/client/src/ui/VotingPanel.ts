import { GameObjects, Scene } from "phaser";
import { NetworkManager } from "../network/NetworkManager.js";
import { Button } from "./Button.js";
import {
  TEXT_LIGHT, TEXT_DIM, TEXT_WHITE, BG_PANEL, ACCENT_RED,
  GREEN, GOLD, TABLE_FELT,
} from "../utils/colors.js";
import type { VoteAction } from "@rogueer/shared";

const CATEGORY_NAMES: Record<string, string> = {
  hierarchy: "Hierarchy",
  card_property: "Card Property",
  composition: "Composition",
};

const VOTE_ACTIONS: { action: VoteAction; label: string }[] = [
  { action: "solidify", label: "Solidify" },
  { action: "delete", label: "Delete" },
  { action: "replace", label: "Replace" },
  { action: "abstain", label: "Abstain" },
];

interface SlotColumn {
  headerText: GameObjects.Text;
  categoryText: GameObjects.Text;
  ruleNameText: GameObjects.Text;
  ruleDescText: GameObjects.Text;
  actionButtons: Map<VoteAction, Button>;
  replacementButtons: Button[];
  replacementDescs: GameObjects.Text[];
  slotIndex: number;
}

export class VotingPanel {
  private container: GameObjects.Container;
  private bg: GameObjects.Graphics;
  private columns: SlotColumn[] = [];
  private lockButton!: Button;
  private timerText!: GameObjects.Text;
  private tallyText!: GameObjects.Text;
  private statusText!: GameObjects.Text;
  private scene: Scene;
  private net: NetworkManager;

  private selectedSlot = -1;
  private selectedAction: VoteAction = "abstain";
  private selectedReplacement = "";
  private isLocked = false;

  constructor(scene: Scene, x: number, y: number) {
    this.scene = scene;
    this.net = NetworkManager.getInstance();
    this.container = scene.add.container(x, y);
    this.container.setDepth(50);

    // Semi-transparent overlay behind
    const overlay = scene.add.graphics();
    overlay.fillStyle(0x000000, 0.5);
    overlay.fillRect(-640, -360, 1280, 720);
    this.container.add(overlay);

    // Main panel background
    this.bg = scene.add.graphics();
    this.bg.fillStyle(parseInt(BG_PANEL.slice(1), 16), 0.95);
    this.bg.fillRoundedRect(-390, -200, 780, 400, 8);
    this.bg.lineStyle(1, parseInt(ACCENT_RED.slice(1), 16), 0.5);
    this.bg.strokeRoundedRect(-390, -200, 780, 400, 8);
    this.container.add(this.bg);

    // Title
    const title = scene.add
      .text(0, -180, "Vote on Rules", {
        fontSize: "22px",
        color: ACCENT_RED,
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
    this.container.add(title);

    // Create 3 slot columns
    for (let i = 0; i < 3; i++) {
      this.createSlotColumn(i);
    }

    // Lock button
    this.lockButton = new Button(
      scene, 0, 0, "[ Lock Vote ]",
      () => this.onLock(),
      { fontSize: "18px", color: GREEN, hoverColor: TEXT_WHITE },
    );
    this.lockButton.text.setPosition(0, 160);
    this.container.add(this.lockButton.text);

    // Timer
    this.timerText = scene.add
      .text(-350, -180, "30s", {
        fontSize: "14px",
        color: TEXT_DIM,
        fontFamily: "monospace",
      });
    this.container.add(this.timerText);

    // Tally
    this.tallyText = scene.add
      .text(350, -180, "0/0 locked", {
        fontSize: "12px",
        color: TEXT_DIM,
        fontFamily: "monospace",
      })
      .setOrigin(1, 0);
    this.container.add(this.tallyText);

    // Status
    this.statusText = scene.add
      .text(0, 130, "", {
        fontSize: "12px",
        color: TEXT_DIM,
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
    this.container.add(this.statusText);

    this.container.setVisible(false);
  }

  private createSlotColumn(slotIndex: number) {
    const colX = -250 + slotIndex * 250;
    const colY = -140;
    const colWidth = 230;

    // Column background
    const colBg = this.scene.add.graphics();
    colBg.fillStyle(0x0a0a2a, 0.5);
    colBg.fillRoundedRect(colX - colWidth / 2, colY, colWidth, 260, 4);
    this.container.add(colBg);

    // Slot header
    const headerText = this.scene.add
      .text(colX, colY + 10, `Slot ${slotIndex + 1}`, {
        fontSize: "14px",
        color: TEXT_WHITE,
        fontFamily: "monospace",
      })
      .setOrigin(0.5, 0);
    this.container.add(headerText);

    // Category
    const categoryText = this.scene.add
      .text(colX, colY + 28, "", {
        fontSize: "10px",
        color: ACCENT_RED,
        fontFamily: "monospace",
      })
      .setOrigin(0.5, 0);
    this.container.add(categoryText);

    // Rule name
    const ruleNameText = this.scene.add
      .text(colX, colY + 45, "---", {
        fontSize: "12px",
        color: TEXT_LIGHT,
        fontFamily: "monospace",
      })
      .setOrigin(0.5, 0);
    this.container.add(ruleNameText);

    // Rule description
    const ruleDescText = this.scene.add
      .text(colX, colY + 62, "", {
        fontSize: "9px",
        color: TEXT_DIM,
        fontFamily: "monospace",
        wordWrap: { width: colWidth - 20 },
      })
      .setOrigin(0.5, 0);
    this.container.add(ruleDescText);

    // Action buttons
    const actionButtons = new Map<VoteAction, Button>();
    let btnY = colY + 105;
    for (const va of VOTE_ACTIONS) {
      const btn = new Button(
        this.scene, 0, 0, va.label,
        () => this.onSelectAction(slotIndex, va.action),
        { fontSize: "11px", padding: { x: 6, y: 3 } },
      );
      btn.text.setPosition(colX, btnY);
      this.container.add(btn.text);
      actionButtons.set(va.action, btn);
      btnY += 22;
    }

    // Replacement options (shown only when "replace" is selected)
    const replacementButtons: Button[] = [];
    const replacementDescs: GameObjects.Text[] = [];
    for (let r = 0; r < 3; r++) {
      const ry = colY + 195 + r * 22;
      const rBtn = new Button(
        this.scene, 0, 0, "",
        () => {},
        { fontSize: "10px", padding: { x: 4, y: 2 } },
      );
      rBtn.text.setPosition(colX, ry);
      rBtn.setVisible(false);
      this.container.add(rBtn.text);
      replacementButtons.push(rBtn);

      const rDesc = this.scene.add
        .text(colX, ry + 12, "", {
          fontSize: "8px",
          color: TEXT_DIM,
          fontFamily: "monospace",
          wordWrap: { width: colWidth - 10 },
        })
        .setOrigin(0.5, 0)
        .setVisible(false);
      this.container.add(rDesc);
      replacementDescs.push(rDesc);
    }

    this.columns.push({
      headerText,
      categoryText,
      ruleNameText,
      ruleDescText,
      actionButtons,
      replacementButtons,
      replacementDescs,
      slotIndex,
    });
  }

  show(ruleSlots: any[]): void {
    this.selectedSlot = -1;
    this.selectedAction = "abstain";
    this.selectedReplacement = "";
    this.isLocked = false;
    this.lockButton.setEnabled(true);
    this.lockButton.setLabel("[ Lock Vote ]");
    this.statusText.setText("Select a slot and action");

    for (let i = 0; i < 3 && i < ruleSlots.length; i++) {
      this.updateColumn(i, ruleSlots[i]);
    }

    this.container.setVisible(true);
  }

  hide(): void {
    this.container.setVisible(false);
  }

  updateTimer(time: number): void {
    this.timerText.setText(`${time}s`);
  }

  updateTally(locked: number, total: number): void {
    this.tallyText.setText(`${locked}/${total} locked`);
  }

  private updateColumn(colIdx: number, slot: any) {
    const col = this.columns[colIdx];

    col.categoryText.setText(CATEGORY_NAMES[slot.category] || slot.category);

    if (slot.rule) {
      col.ruleNameText.setText(slot.rule.name || slot.rule.id);
      col.ruleDescText.setText(slot.rule.description || "");
    } else {
      col.ruleNameText.setText(slot.slotState === "solidified" ? "SOLIDIFIED" : "(empty)");
      col.ruleDescText.setText("");
    }

    // Enable/disable action buttons based on slot state
    const isSolidified = slot.slotState === "solidified";
    const isEmpty = slot.slotState === "empty";

    col.actionButtons.get("solidify")!.setEnabled(!isSolidified && !isEmpty);
    col.actionButtons.get("delete")!.setEnabled(!isSolidified && !isEmpty);
    col.actionButtons.get("replace")!.setEnabled(!isSolidified);
    col.actionButtons.get("abstain")!.setEnabled(true);

    // Populate replacement options
    const replacements = slot.replacementOptions || [];
    for (let r = 0; r < 3; r++) {
      const btn = col.replacementButtons[r];
      if (r < replacements.length) {
        const rule = replacements[r];
        btn.setLabel(rule.name || rule.id);
        btn.text.off("pointerdown");
        btn.text.on("pointerdown", () => this.onSelectReplacement(colIdx, rule.id));
      }
      btn.setVisible(false);
      col.replacementDescs[r].setVisible(false);
    }
  }

  private onSelectAction(slotIndex: number, action: VoteAction) {
    if (this.isLocked) return;
    this.selectedSlot = slotIndex;
    this.selectedAction = action;
    this.selectedReplacement = "";

    // Update visual selection across all columns
    for (let c = 0; c < 3; c++) {
      const col = this.columns[c];
      col.actionButtons.forEach((btn, a) => {
        if (c === slotIndex && a === action) {
          btn.text.setColor(GREEN);
        } else if (btn.enabled) {
          btn.text.setColor(TEXT_WHITE);
        }
      });

      // Show/hide replacement options
      const showReplacements = c === slotIndex && action === "replace";
      const state = this.net.getState();
      const ruleSlots = state?.ruleSlots;
      const slot = ruleSlots?.[c];
      const replacements = slot?.replacementOptions || [];

      for (let r = 0; r < 3; r++) {
        const visible = showReplacements && r < replacements.length;
        col.replacementButtons[r].setVisible(visible);
        if (visible) {
          col.replacementButtons[r].setLabel(replacements[r].name || replacements[r].id);
        }
      }
    }

    if (action === "replace") {
      this.statusText.setText("Select a replacement rule");
    } else {
      this.statusText.setText(`${action} Slot ${slotIndex + 1} — click Lock to confirm`);
    }
  }

  private onSelectReplacement(slotIndex: number, ruleId: string) {
    if (this.isLocked) return;
    this.selectedReplacement = ruleId;

    // Highlight selected replacement
    const col = this.columns[slotIndex];
    const state = this.net.getState();
    const replacements = state?.ruleSlots?.[slotIndex]?.replacementOptions || [];
    for (let r = 0; r < col.replacementButtons.length; r++) {
      const btn = col.replacementButtons[r];
      if (r < replacements.length && replacements[r].id === ruleId) {
        btn.text.setColor(GREEN);
      } else {
        btn.text.setColor(TEXT_WHITE);
      }
    }

    this.statusText.setText(`Replace Slot ${slotIndex + 1} — click Lock to confirm`);
  }

  private onLock() {
    if (this.isLocked) return;

    // Validate selection
    if (this.selectedAction === "replace" && !this.selectedReplacement) {
      this.statusText.setText("Select a replacement rule first!");
      return;
    }

    this.isLocked = true;
    this.lockButton.setEnabled(false);
    this.lockButton.setLabel("[ Vote Locked ]");
    this.statusText.setText("Vote submitted — waiting for others...");

    const targetSlot = this.selectedSlot >= 0 ? this.selectedSlot : 0;
    this.net.sendVote(targetSlot, this.selectedAction, this.selectedReplacement || undefined);
  }

  destroy(): void {
    this.container.destroy();
  }
}
