// Composer（Cmd+K）の開閉フック
// - Cmd+K / Ctrl+K でトグル
// - Esc で閉じる
// - テキスト入力中（input / textarea / contenteditable）でも Cmd+K は効くが、
//   単独の "K" では発火しない（通常入力を妨げない）
// AI 実行配線は後続 PR（現状はスケルトン）

import { useCallback, useEffect, useState } from "react";
import type { ComposerMode } from "./types";

type UseComposerOptions = {
  /** 初期モード（既定値: ask） */
  defaultMode?: ComposerMode;
  /** キーボードショートカットを無効化したい場合（テスト・Storybook 用） */
  disableShortcut?: boolean;
};

export function useComposer(options: UseComposerOptions = {}) {
  const { defaultMode = "ask", disableShortcut = false } = options;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ComposerMode>(defaultMode);

  const openComposer = useCallback((initialMode?: ComposerMode) => {
    if (initialMode) setMode(initialMode);
    setOpen(true);
  }, []);

  const closeComposer = useCallback(() => {
    setOpen(false);
  }, []);

  const toggleComposer = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (disableShortcut) return;
    const handler = (e: KeyboardEvent) => {
      // Cmd+K (Mac) / Ctrl+K (Win/Linux)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [disableShortcut]);

  return {
    open,
    mode,
    setMode,
    openComposer,
    closeComposer,
    toggleComposer,
  };
}
