import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { migrateFromProvnote } from "./lib/migration";
import { NoteApp } from "./note-app";
import { LocaleProvider } from "./i18n";
import { startSidecar, stopSidecar } from "./lib/sidecar";
import { initMenuListener } from "./lib/menu-events";
import { initUpdater } from "./lib/updater";
import { isTauri } from "./lib/platform";
import "./app.css";

// ── Tauri 環境: sidecar サーバー起動 + メニュー + 自動更新 ──
if (isTauri()) {
  startSidecar();
  initMenuListener();
  initUpdater();
  window.addEventListener("beforeunload", () => {
    stopSidecar();
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
