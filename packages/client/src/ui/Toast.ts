import { Scene } from "phaser";
import { ACCENT_RED, BG_PANEL, GOLD, TEXT_WHITE } from "../utils/colors.js";

export type ToastType = "error" | "info" | "success";

const TOAST_COLORS: Record<ToastType, string> = {
  error: ACCENT_RED,
  info: TEXT_WHITE,
  success: GOLD,
};

export function showToast(
  scene: Scene,
  message: string,
  type: ToastType = "info",
  duration = 3000,
  y = 60,
): void {
  const toast = scene.add
    .text(640, y, message, {
      fontSize: "14px",
      color: TOAST_COLORS[type],
      fontFamily: "monospace",
      backgroundColor: BG_PANEL,
      padding: { x: 12, y: 6 },
    })
    .setOrigin(0.5)
    .setDepth(100);

  scene.tweens.add({
    targets: toast,
    alpha: 0,
    y: y - 30,
    duration: duration * 0.4,
    delay: duration * 0.6,
    onComplete: () => toast.destroy(),
  });
}
