import { GameObjects, Scene } from "phaser";
import { NetworkManager } from "../network/NetworkManager.js";
import { Button } from "./Button.js";
import {
  TEXT_WHITE, TEXT_DIM, ACCENT_RED, BG_PANEL, GREEN, GOLD,
} from "../utils/colors.js";
import type { BettingAction } from "@rogueer/shared";

interface ActionDef {
  action: BettingAction;
  label: string;
  color: string;
}

const ACTIONS: ActionDef[] = [
  { action: "fold", label: "Fold", color: ACCENT_RED },
  { action: "check", label: "Check", color: GREEN },
  { action: "call", label: "Call", color: GREEN },
  { action: "bet", label: "Bet", color: GOLD },
  { action: "raise", label: "Raise", color: GOLD },
  { action: "all_in", label: "All In", color: ACCENT_RED },
];

export class BettingPanel {
  private container: GameObjects.Container;
  private buttons: Map<BettingAction, Button> = new Map();
  private amountText: GameObjects.Text;
  private minusBtn: Button;
  private plusBtn: Button;
  private presetBtns: Button[] = [];
  private amount = 0;
  private minAmount = 0;
  private maxAmount = 0;
  private bigBlind = 20;
  private callAmount = 0;
  private net: NetworkManager;

  constructor(scene: Scene, x: number, y: number) {
    this.net = NetworkManager.getInstance();
    this.container = scene.add.container(x, y);

    // Background panel
    const bg = scene.add.graphics();
    bg.fillStyle(parseInt(BG_PANEL.slice(1), 16), 0.85);
    bg.fillRoundedRect(-340, -35, 680, 70, 6);
    this.container.add(bg);

    // Action buttons
    let bx = -280;
    for (const def of ACTIONS) {
      const btn = new Button(
        scene, 0, 0, def.label,
        () => this.onAction(def.action),
        { fontSize: "15px", color: def.color, hoverColor: TEXT_WHITE, padding: { x: 10, y: 6 } },
      );
      btn.text.setPosition(bx, 0);
      this.container.add(btn.text);
      this.buttons.set(def.action, btn);
      bx += 80;
    }

    // Amount controls (right side)
    this.minusBtn = new Button(scene, 0, 0, "<", () => this.adjustAmount(-this.bigBlind), {
      fontSize: "16px", padding: { x: 6, y: 4 },
    });
    this.minusBtn.text.setPosition(170, 0);
    this.container.add(this.minusBtn.text);

    this.amountText = scene.add
      .text(220, 0, "$0", {
        fontSize: "15px",
        color: TEXT_WHITE,
        fontFamily: "monospace",
      })
      .setOrigin(0.5);
    this.container.add(this.amountText);

    this.plusBtn = new Button(scene, 0, 0, ">", () => this.adjustAmount(this.bigBlind), {
      fontSize: "16px", padding: { x: 6, y: 4 },
    });
    this.plusBtn.text.setPosition(270, 0);
    this.container.add(this.plusBtn.text);

    // Preset buttons: 1/2 Pot, Pot, All In
    const presetDefs = [
      { label: "1/2", factor: 0.5 },
      { label: "Pot", factor: 1.0 },
    ];
    let px = 310;
    for (const pd of presetDefs) {
      const btn = new Button(scene, 0, 0, pd.label, () => {
        const state = this.net.getState();
        const pot = state?.pot ?? 0;
        const target = Math.floor(pot * pd.factor);
        this.amount = Math.max(this.minAmount, Math.min(this.maxAmount, target));
        this.updateAmountDisplay();
      }, { fontSize: "11px", padding: { x: 4, y: 2 } });
      btn.text.setPosition(px, 0);
      this.container.add(btn.text);
      this.presetBtns.push(btn);
      px += 40;
    }

    this.container.setVisible(false);
  }

  show(validActions: {
    canFold: boolean;
    canCheck: boolean;
    canCall: boolean;
    canBet: boolean;
    canRaise: boolean;
    canAllIn: boolean;
    callAmount: number;
    minBet: number;
    maxBet: number;
  }): void {
    this.buttons.get("fold")!.setVisible(validActions.canFold);
    this.buttons.get("check")!.setVisible(validActions.canCheck);

    const callBtn = this.buttons.get("call")!;
    callBtn.setVisible(validActions.canCall);
    if (validActions.canCall) {
      callBtn.setLabel(`Call $${validActions.callAmount}`);
    }

    this.buttons.get("bet")!.setVisible(validActions.canBet);
    this.buttons.get("raise")!.setVisible(validActions.canRaise);
    this.buttons.get("all_in")!.setVisible(validActions.canAllIn);

    // Amount controls visible only if bet/raise is available
    const showAmount = validActions.canBet || validActions.canRaise;
    this.minusBtn.setVisible(showAmount);
    this.plusBtn.setVisible(showAmount);
    this.amountText.setVisible(showAmount);
    for (const btn of this.presetBtns) btn.setVisible(showAmount);

    if (showAmount) {
      this.callAmount = validActions.callAmount;
      this.minAmount = validActions.minBet;
      this.maxAmount = validActions.maxBet;
      this.amount = validActions.minBet;

      const state = this.net.getState();
      this.bigBlind = state?.settings?.bigBlind ?? 20;
      this.updateAmountDisplay();
    }

    this.container.setVisible(true);
  }

  hide(): void {
    this.container.setVisible(false);
  }

  private onAction(action: BettingAction) {
    if (action === "bet" || action === "raise") {
      this.net.sendAction(action, this.amount);
    } else {
      this.net.sendAction(action);
    }
    this.hide();
  }

  private adjustAmount(delta: number) {
    this.amount = Math.max(this.minAmount, Math.min(this.maxAmount, this.amount + delta));
    this.updateAmountDisplay();
  }

  private updateAmountDisplay() {
    this.amountText.setText(`$${this.amount}`);
  }

  destroy(): void {
    this.container.destroy();
  }
}
