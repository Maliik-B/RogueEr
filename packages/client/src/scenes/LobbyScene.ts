import { Scene } from "phaser";
import { NetworkManager } from "../network/NetworkManager.js";
import { Button } from "../ui/Button.js";
import * as E from "../network/events.js";
import {
  ACCENT_RED, TEXT_LIGHT, TEXT_DIM, TEXT_WHITE,
  BG_PANEL, GREEN, GOLD, TABLE_FELT,
} from "../utils/colors.js";

interface PlayerRow {
  nameText: Phaser.GameObjects.Text;
  readyText: Phaser.GameObjects.Text;
  hostText: Phaser.GameObjects.Text;
  sessionId: string;
}

interface SettingRow {
  label: Phaser.GameObjects.Text;
  valueText: Phaser.GameObjects.Text;
  minus: Button;
  plus: Button;
}

const SETTING_DEFS: { key: string; label: string; min: number; max: number; step: number }[] = [
  { key: "startingChips", label: "Starting Chips", min: 100, max: 10000, step: 100 },
  { key: "smallBlind", label: "Small Blind", min: 5, max: 500, step: 5 },
  { key: "bigBlind", label: "Big Blind", min: 10, max: 1000, step: 10 },
  { key: "turnTimer", label: "Turn Timer (s)", min: 10, max: 120, step: 5 },
  { key: "votingTimer", label: "Vote Timer (s)", min: 10, max: 120, step: 5 },
  { key: "maxPlayers", label: "Max Players", min: 2, max: 6, step: 1 },
];

const TOGGLE_DEFS: { key: string; label: string }[] = [
  { key: "eliminationMode", label: "Elimination" },
  { key: "antesEnabled", label: "Antes" },
];

const CYCLE_DEFS: { key: string; label: string; values: string[]; display: string[] }[] = [
  { key: "votingPhases", label: "Voting", values: ["both", "flop_only", "turn_only", "none"], display: ["Both", "Flop Only", "Turn Only", "None"] },
  { key: "voteVisibility", label: "Vote View", values: ["hidden", "after_lock", "live"], display: ["Hidden", "After Lock", "Live"] },
];

export class LobbyScene extends Scene {
  private net!: NetworkManager;
  private playerRows: Map<string, PlayerRow> = new Map();
  private readyButton!: Button;
  private startButton!: Button;
  private isReady = false;
  private settingRows: Map<string, SettingRow> = new Map();
  private toggleTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private cycleTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private settingsContainer: Phaser.GameObjects.Container | null = null;
  private errorText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "LobbyScene" });
  }

  create() {
    this.net = NetworkManager.getInstance();
    this.playerRows.clear();
    this.settingRows.clear();
    this.toggleTexts.clear();
    this.cycleTexts.clear();
    this.isReady = false;

    const { width, height } = this.scale;

    // Title
    this.add
      .text(width / 2, 30, "Game Lobby", {
        fontSize: "32px",
        color: ACCENT_RED,
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // Player list header
    this.add
      .text(80, 80, "Players", {
        fontSize: "20px",
        color: TEXT_LIGHT,
        fontFamily: "monospace",
      });

    // Divider
    const g = this.add.graphics();
    g.lineStyle(1, 0x6a6a8a);
    g.lineBetween(80, 108, 420, 108);

    // Ready button
    this.readyButton = new Button(
      this, width / 2 - 100, height - 60, "[ Ready ]",
      () => {
        this.isReady = !this.isReady;
        this.net.sendReady(this.isReady);
        this.readyButton.setLabel(this.isReady ? "[ Not Ready ]" : "[ Ready ]");
      },
      { fontSize: "20px" },
    );

    // Start button (host only, initially hidden)
    this.startButton = new Button(
      this, width / 2 + 120, height - 60, "[ Start Game ]",
      () => this.net.sendStartGame(),
      { fontSize: "20px", color: GREEN, hoverColor: TEXT_WHITE },
    );
    this.startButton.setVisible(false);
    this.startButton.setEnabled(false);

    // Error text
    this.errorText = this.add
      .text(width / 2, height - 110, "", {
        fontSize: "14px",
        color: ACCENT_RED,
        fontFamily: "monospace",
      })
      .setOrigin(0.5);

    // Settings panel (right side)
    this.createSettingsPanel();

    // Wire up events
    this.wireEvents();

    // Populate with current state
    this.syncInitialState();
  }

  private createSettingsPanel() {
    const startX = 520;
    let y = 80;

    this.add
      .text(startX, y, "Settings", {
        fontSize: "20px",
        color: TEXT_LIGHT,
        fontFamily: "monospace",
      });

    const g = this.add.graphics();
    g.lineStyle(1, 0x6a6a8a);
    g.lineBetween(startX, y + 28, 1200, y + 28);

    y += 45;

    // Container for settings (only interactive for host)
    this.settingsContainer = this.add.container(0, 0);

    // Numeric settings
    for (const def of SETTING_DEFS) {
      const label = this.add
        .text(startX, y, def.label, { fontSize: "14px", color: TEXT_DIM, fontFamily: "monospace" });

      const valueText = this.add
        .text(startX + 260, y, "", { fontSize: "14px", color: TEXT_LIGHT, fontFamily: "monospace" })
        .setOrigin(0.5, 0);

      const minus = new Button(this, startX + 210, y + 8, "-", () => {
        this.adjustSetting(def.key, -def.step, def.min, def.max);
      }, { fontSize: "14px", padding: { x: 6, y: 2 } });

      const plus = new Button(this, startX + 310, y + 8, "+", () => {
        this.adjustSetting(def.key, def.step, def.min, def.max);
      }, { fontSize: "14px", padding: { x: 6, y: 2 } });

      this.settingRows.set(def.key, { label, valueText, minus, plus });
      y += 30;
    }

    // Toggle settings
    for (const def of TOGGLE_DEFS) {
      const label = this.add
        .text(startX, y, def.label, { fontSize: "14px", color: TEXT_DIM, fontFamily: "monospace" });

      const toggleText = this.add
        .text(startX + 260, y, "OFF", { fontSize: "14px", color: TEXT_LIGHT, fontFamily: "monospace" })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true });

      toggleText.on("pointerdown", () => {
        const state = this.net.getState();
        if (!state) return;
        const current = (state.settings as any)[def.key];
        this.net.sendSettings({ [def.key]: !current } as any);
      });

      this.toggleTexts.set(def.key, toggleText);
      y += 30;
    }

    // Cycle settings
    for (const def of CYCLE_DEFS) {
      const label = this.add
        .text(startX, y, def.label, { fontSize: "14px", color: TEXT_DIM, fontFamily: "monospace" });

      const cycleText = this.add
        .text(startX + 260, y, "", { fontSize: "14px", color: TEXT_LIGHT, fontFamily: "monospace" })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true });

      cycleText.on("pointerdown", () => {
        const state = this.net.getState();
        if (!state) return;
        const current = (state.settings as any)[def.key] as string;
        const idx = def.values.indexOf(current);
        const next = def.values[(idx + 1) % def.values.length];
        this.net.sendSettings({ [def.key]: next } as any);
      });

      this.cycleTexts.set(def.key, cycleText);
      y += 30;
    }
  }

  private adjustSetting(key: string, delta: number, min: number, max: number) {
    const state = this.net.getState();
    if (!state) return;
    const current = (state.settings as any)[key] as number;
    const newVal = Math.max(min, Math.min(max, current + delta));
    this.net.sendSettings({ [key]: newVal } as any);
  }

  private wireEvents() {
    const events = this.net.events;

    events.on(E.PLAYER_ADD, this.onPlayerAdd, this);
    events.on(E.PLAYER_REMOVE, this.onPlayerRemove, this);
    events.on(E.PLAYER_READY, this.onPlayerReady, this);
    events.on(E.PLAYER_HOST, this.onPlayerHost, this);
    events.on(E.SETTINGS_CHANGE, this.onSettingsChange, this);
    events.on(E.PHASE_TRANSITION, this.onPhaseTransition, this);
    events.on(E.SERVER_ERROR, this.onError, this);

    this.events.on("shutdown", () => {
      events.off(E.PLAYER_ADD, this.onPlayerAdd, this);
      events.off(E.PLAYER_REMOVE, this.onPlayerRemove, this);
      events.off(E.PLAYER_READY, this.onPlayerReady, this);
      events.off(E.PLAYER_HOST, this.onPlayerHost, this);
      events.off(E.SETTINGS_CHANGE, this.onSettingsChange, this);
      events.off(E.PHASE_TRANSITION, this.onPhaseTransition, this);
      events.off(E.SERVER_ERROR, this.onError, this);
    });
  }

  private syncInitialState() {
    const state = this.net.getState();
    if (!state) return;

    state.players?.forEach((player: any, sessionId: string) => {
      this.onPlayerAdd(player, sessionId);
    });

    if (state.settings) this.updateSettings(state.settings);
    this.updateHostVisibility();
  }

  // ================================================================
  // Event handlers
  // ================================================================

  private onPlayerAdd(player: any, sessionId: string) {
    if (this.playerRows.has(sessionId)) return;
    const y = 125 + this.playerRows.size * 35;
    const isSelf = sessionId === this.net.sessionId;

    const nameText = this.add
      .text(100, y, player.displayName + (isSelf ? " (you)" : ""), {
        fontSize: "16px",
        color: isSelf ? ACCENT_RED : TEXT_LIGHT,
        fontFamily: "monospace",
      });

    const readyText = this.add
      .text(320, y, player.isReady ? "READY" : "---", {
        fontSize: "14px",
        color: player.isReady ? GREEN : TEXT_DIM,
        fontFamily: "monospace",
      });

    const hostText = this.add
      .text(400, y, player.isHost ? "HOST" : "", {
        fontSize: "14px",
        color: GOLD,
        fontFamily: "monospace",
      });

    this.playerRows.set(sessionId, { nameText, readyText, hostText, sessionId });
    this.updateStartButton();
  }

  private onPlayerRemove(sessionId: string) {
    const row = this.playerRows.get(sessionId);
    if (row) {
      row.nameText.destroy();
      row.readyText.destroy();
      row.hostText.destroy();
      this.playerRows.delete(sessionId);
      this.rebuildPlayerList();
      this.updateStartButton();
    }
  }

  private onPlayerReady(sessionId: string, ready: boolean) {
    const row = this.playerRows.get(sessionId);
    if (row) {
      row.readyText.setText(ready ? "READY" : "---");
      row.readyText.setColor(ready ? GREEN : TEXT_DIM);
    }
    this.updateStartButton();
  }

  private onPlayerHost(sessionId: string, isHost: boolean) {
    // Clear all host badges, then set the new one
    this.playerRows.forEach((row) => row.hostText.setText(""));
    if (isHost) {
      const row = this.playerRows.get(sessionId);
      if (row) row.hostText.setText("HOST");
    }
    this.updateHostVisibility();
  }

  private onSettingsChange(settings: any) {
    this.updateSettings(settings);
  }

  private onPhaseTransition(msg: any) {
    if (msg.to !== "lobby") {
      this.scene.start("TableScene");
    }
  }

  private onError(msg: any) {
    this.errorText.setText(msg.message || "Unknown error");
    this.time.delayedCall(3000, () => {
      this.errorText.setText("");
    });
  }

  // ================================================================
  // UI updates
  // ================================================================

  private rebuildPlayerList() {
    let y = 125;
    this.playerRows.forEach((row) => {
      row.nameText.setY(y);
      row.readyText.setY(y);
      row.hostText.setY(y);
      y += 35;
    });
  }

  private updateSettings(settings: any) {
    for (const def of SETTING_DEFS) {
      const row = this.settingRows.get(def.key);
      if (row) {
        row.valueText.setText(String(settings[def.key]));
      }
    }

    for (const def of TOGGLE_DEFS) {
      const text = this.toggleTexts.get(def.key);
      if (text) {
        const val = settings[def.key];
        text.setText(val ? "ON" : "OFF");
        text.setColor(val ? GREEN : TEXT_DIM);
      }
    }

    for (const def of CYCLE_DEFS) {
      const text = this.cycleTexts.get(def.key);
      if (text) {
        const val = settings[def.key] as string;
        const idx = def.values.indexOf(val);
        text.setText(idx >= 0 ? def.display[idx] : val);
      }
    }
  }

  private updateHostVisibility() {
    const state = this.net.getState();
    if (!state) return;
    const localPlayer = state.players?.get(this.net.sessionId);
    const isHost = localPlayer?.isHost ?? false;

    this.startButton.setVisible(isHost);

    // Show/hide setting controls based on host status
    this.settingRows.forEach((row) => {
      row.minus.setVisible(isHost);
      row.plus.setVisible(isHost);
    });

    this.toggleTexts.forEach((text) => {
      if (isHost) {
        text.setInteractive({ useHandCursor: true });
      } else {
        text.disableInteractive();
      }
    });

    this.cycleTexts.forEach((text) => {
      if (isHost) {
        text.setInteractive({ useHandCursor: true });
      } else {
        text.disableInteractive();
      }
    });

    this.updateStartButton();
  }

  private updateStartButton() {
    const state = this.net.getState();
    if (!state) return;
    const localPlayer = state.players?.get(this.net.sessionId);
    if (!localPlayer?.isHost) return;

    let allReady = true;
    let playerCount = 0;
    state.players.forEach((p: any) => {
      playerCount++;
      if (!p.isReady) allReady = false;
    });

    const canStart = allReady && playerCount >= state.settings.minPlayers;
    this.startButton.setEnabled(canStart);
  }
}
