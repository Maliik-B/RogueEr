import { Scene } from "phaser";
import { NetworkManager } from "../network/NetworkManager.js";
import { ACCENT_RED, TEXT_LIGHT, TEXT_DIM, TEXT_WHITE, BG_PANEL } from "../utils/colors.js";

export class BootScene extends Scene {
  private nameInput: HTMLInputElement | null = null;
  private statusText!: Phaser.GameObjects.Text;
  private joinButton!: Phaser.GameObjects.Text;
  private joining = false;

  constructor() {
    super({ key: "BootScene" });
  }

  create() {
    const { width, height } = this.scale;

    // Title
    this.add
      .text(width / 2, height / 2 - 120, "RogueEr", {
        fontSize: "64px",
        color: ACCENT_RED,
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 - 50, "Multiplayer Roguelike Poker", {
        fontSize: "20px",
        color: TEXT_DIM,
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // HTML input for display name
    this.createNameInput(width, height);

    // Join button
    this.joinButton = this.add
      .text(width / 2, height / 2 + 70, "[ Join Game ]", {
        fontSize: "24px",
        color: TEXT_WHITE,
        fontFamily: "monospace",
        backgroundColor: BG_PANEL,
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.joinButton.on("pointerover", () => {
      if (!this.joining) this.joinButton.setColor(ACCENT_RED);
    });
    this.joinButton.on("pointerout", () => {
      if (!this.joining) this.joinButton.setColor(TEXT_WHITE);
    });
    this.joinButton.on("pointerdown", () => {
      this.handleJoin();
    });

    // Status text (for errors)
    this.statusText = this.add
      .text(width / 2, height / 2 + 130, "", {
        fontSize: "14px",
        color: ACCENT_RED,
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // Clean up HTML input when scene shuts down
    this.events.on("shutdown", () => this.removeNameInput());
    this.events.on("destroy", () => this.removeNameInput());
  }

  private createNameInput(canvasWidth: number, canvasHeight: number) {
    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.placeholder = "Enter your name...";
    this.nameInput.maxLength = 20;
    this.nameInput.value = "";

    Object.assign(this.nameInput.style, {
      position: "absolute",
      width: "240px",
      padding: "8px 12px",
      fontSize: "18px",
      fontFamily: "monospace",
      background: "#16213e",
      color: "#e0e0e0",
      border: "1px solid #6a6a8a",
      borderRadius: "4px",
      outline: "none",
      textAlign: "center",
    });

    // Position over the canvas center
    this.positionInput();
    document.body.appendChild(this.nameInput);

    // Handle enter key
    this.nameInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") this.handleJoin();
    });

    // Reposition on resize
    this.scale.on("resize", () => this.positionInput());
  }

  private positionInput() {
    if (!this.nameInput) return;
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    this.nameInput.style.left = `${rect.left + rect.width / 2 - 120}px`;
    this.nameInput.style.top = `${rect.top + rect.height / 2 - 10}px`;
  }

  private removeNameInput() {
    if (this.nameInput && this.nameInput.parentElement) {
      this.nameInput.remove();
      this.nameInput = null;
    }
  }

  private async handleJoin() {
    if (this.joining) return;
    const name = this.nameInput?.value.trim() || "";
    if (!name) {
      this.statusText.setText("Please enter a name");
      return;
    }

    this.joining = true;
    this.joinButton.setText("[ Connecting... ]");
    this.joinButton.setColor(TEXT_DIM);
    this.statusText.setText("");

    try {
      const net = NetworkManager.getInstance();
      await net.joinGame(name);
      this.removeNameInput();
      this.scene.start("LobbyScene");
    } catch (err) {
      this.joining = false;
      this.joinButton.setText("[ Join Game ]");
      this.joinButton.setColor(TEXT_WHITE);
      const message = err instanceof Error ? err.message : "Connection failed";
      this.statusText.setText(message);
    }
  }
}
