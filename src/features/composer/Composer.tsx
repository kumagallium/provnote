// Cmd+K Composer — スケルトン実装
// UX Audit #04 に基づき「統一された入口」のシェルだけを提供する。
// AI 呼び出し・スラッシュメニュー統合は後続 PR で段階導入する。
//
// 構成:
//   上段 — プロンプト入力（自動拡張 textarea）
//   中段 — 発見カード 4 枚（呼び出し側が渡す）
//   下段 — モード切替タブ（Ask / Compose / Insert PROV / Insert Media）

import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n";
import { COMPOSER_MODES, type ComposerMode, type ComposerSubmission, type DiscoveryCard } from "./types";

type ComposerProps = {
  open: boolean;
  mode: ComposerMode;
  prompt: string;
  onPromptChange: (value: string) => void;
  onModeChange: (mode: ComposerMode) => void;
  onSubmit: (submission: ComposerSubmission) => void;
  onClose: () => void;
  /** 呼び出し側が直近文脈から組み立てる発見カード（空配列ならガイド文だけ表示） */
  discoveryCards?: DiscoveryCard[];
  onDiscoveryCardSelect?: (card: DiscoveryCard) => void;
};

function modeLabel(t: (k: string) => string, mode: ComposerMode): string {
  switch (mode) {
    case "ask":
      return t("composer.mode.ask");
    case "compose":
      return t("composer.mode.compose");
    case "insert-prov":
      return t("composer.mode.insertProv");
    case "insert-media":
      return t("composer.mode.insertMedia");
  }
}

export function Composer(props: ComposerProps) {
  const {
    open,
    mode,
    prompt,
    onPromptChange,
    onModeChange,
    onSubmit,
    onClose,
    discoveryCards,
    onDiscoveryCardSelect,
  } = props;

  const t = useT();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 開いた瞬間にフォーカス・textarea の縦サイズ初期化
  useEffect(() => {
    if (!open) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [open]);

  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter で送信（Shift+Enter は改行）
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const trimmed = prompt.trim();
      if (trimmed.length === 0) return;
      onSubmit({ mode, prompt: trimmed });
    }
  };

  // textarea 自動伸縮
  const handleInput = (value: string) => {
    onPromptChange(value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  const cards = useMemo(() => discoveryCards ?? [], [discoveryCards]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-label={t("composer.aria.dialog")}
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "14vh",
      }}
    >
      {/* オーバーレイ */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "oklch(0.22 0.01 85 / 0.35)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* 本体 */}
      <div
        style={{
          position: "relative",
          width: "min(640px, calc(100vw - 32px))",
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          borderRadius: "var(--r-3)",
          boxShadow: "var(--shadow-2)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 上段 — プロンプト */}
        <div
          style={{
            padding: "14px 16px 10px",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              fontSize: 13,
              color: "var(--forest)",
              lineHeight: "22px",
              userSelect: "none",
            }}
            aria-hidden
          >
            »
          </span>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("composer.placeholder")}
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 15,
              lineHeight: 1.5,
              color: "var(--ink)",
              minHeight: 22,
              maxHeight: 120,
              fontFamily: "inherit",
            }}
          />
          <kbd
            style={{
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: "var(--r-1)",
              border: "1px solid var(--rule)",
              color: "var(--ink-3)",
              background: "var(--paper-2)",
              alignSelf: "flex-start",
              whiteSpace: "nowrap",
            }}
          >
            Esc
          </kbd>
        </div>

        {/* 中段 — 発見カード */}
        {cards.length > 0 && (
          <div
            style={{
              borderTop: "1px solid var(--rule-2)",
              padding: "10px 12px 12px",
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
              background: "var(--paper-2)",
            }}
          >
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onDiscoveryCardSelect?.(card)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  borderRadius: "var(--r-2)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  font: "inherit",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                  {card.title}
                </span>
                {card.hint && (
                  <span style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.45 }}>
                    {card.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* 下段 — モードタブ */}
        <div
          role="tablist"
          aria-label={t("composer.aria.modes")}
          style={{
            borderTop: "1px solid var(--rule-2)",
            padding: "8px 12px",
            display: "flex",
            gap: 4,
            background: "var(--paper-2)",
            fontSize: 12,
          }}
        >
          {COMPOSER_MODES.map((m) => {
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onModeChange(m)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--r-1)",
                  border: "none",
                  background: active ? "var(--forest-soft)" : "transparent",
                  color: active ? "var(--forest-ink)" : "var(--ink-3)",
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                {modeLabel(t, m)}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <span
            style={{
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              fontSize: 10,
              color: "var(--ink-4)",
              alignSelf: "center",
            }}
          >
            Enter ↵
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
