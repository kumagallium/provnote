// プラットフォーム判定とデスクトップ固有機能

/** Tauri デスクトップ環境かどうか */
export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
