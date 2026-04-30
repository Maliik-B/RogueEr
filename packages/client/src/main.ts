import { AUTO, Game, Scale } from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { LobbyScene } from "./scenes/LobbyScene.js";
import { TableScene } from "./scenes/TableScene.js";

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: "game-container",
  width: 1280,
  height: 720,
  backgroundColor: "#1a1a2e",
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
  },
  antialias: true,
  roundPixels: true,
  scene: [BootScene, LobbyScene, TableScene],
};

new Game(config);
