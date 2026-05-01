import { GameObjects, Scene } from "phaser";
import { TEXT_WHITE, ACCENT_RED, TEXT_DIM, BG_PANEL } from "../utils/colors.js";

export interface ButtonStyle {
  fontSize?: string;
  color?: string;
  hoverColor?: string;
  disabledColor?: string;
  backgroundColor?: string;
  padding?: { x: number; y: number };
}

const DEFAULTS: Required<ButtonStyle> = {
  fontSize: "18px",
  color: TEXT_WHITE,
  hoverColor: ACCENT_RED,
  disabledColor: TEXT_DIM,
  backgroundColor: BG_PANEL,
  padding: { x: 16, y: 8 },
};

export class Button {
  readonly text: GameObjects.Text;
  private onClick: () => void;
  private style: Required<ButtonStyle>;
  private _enabled = true;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    style: ButtonStyle = {},
  ) {
    this.onClick = onClick;
    this.style = { ...DEFAULTS, ...style };

    this.text = scene.add
      .text(x, y, label, {
        fontSize: this.style.fontSize,
        color: this.style.color,
        fontFamily: "monospace",
        backgroundColor: this.style.backgroundColor,
        padding: this.style.padding,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.text.on("pointerover", () => {
      if (this._enabled) this.text.setColor(this.style.hoverColor);
    });
    this.text.on("pointerout", () => {
      if (this._enabled) this.text.setColor(this.style.color);
    });
    this.text.on("pointerdown", () => {
      if (this._enabled) this.onClick();
    });
  }

  setLabel(label: string): this {
    this.text.setText(label);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this._enabled = enabled;
    this.text.setColor(enabled ? this.style.color : this.style.disabledColor);
    return this;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setVisible(visible: boolean): this {
    this.text.setVisible(visible);
    return this;
  }

  setPosition(x: number, y: number): this {
    this.text.setPosition(x, y);
    return this;
  }

  destroy(): void {
    this.text.destroy();
  }
}
