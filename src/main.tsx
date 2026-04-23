import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { migrateFromProvnote } from "./lib/migration";
import { NoteApp } from "./note-app";
import { LocaleProvider } from "./i18n";
import { restartSidecar, startSidecar, stopSidecar } from "./lib/sidecar";
import { initMenuListener, onMenuAction } from "./lib/menu-events";
import { initUpdater } from "./lib/updater";
import { isTauri } from "./lib/platform";
import "./app.css";

// ── Tauri 環境: sidecar サーバー起動 + メニュー + 自動更新 ──
if (isTauri()) {
  // sidecar 起動を await し、失敗時もアプリは続行（AI 機能のみ無効化）
  startSidecar().then((ok) => {
    if (!ok) console.warn("[main] sidecar 起動失敗 — AI 機能は利用不可");
  });
  initMenuListener();
  // メニュー > Backend > Restart Backend のハンドラ
  onMenuAction("restart-backend", () => {
    restartSidecar().then((ok) => {
      console.log(`[main] sidecar restart ${ok ? "succeeded" : "failed"}`);
    });
  });
  initUpdater();
  // beforeunload ではなく Tauri ウィンドウ閉じイベントで停止
  // （HMR リロードで sidecar が誤って kill されるのを防ぐ）
  import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
    getCurrentWindow().onCloseRequested(async () => {
      await stopSidecar();
    });
  });
}

// ── マイグレーション（provnote → graphium） ──
migrateFromProvnote();

// ── エントリーポイント ──
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <NoteApp />
    </LocaleProvider>
  </StrictMode>
);
