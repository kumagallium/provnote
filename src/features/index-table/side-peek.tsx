// Notion 風サイドピーク
// 画面右側からスライドインし、リンク先ノートを読み取り専用で表示する
// 背景ページは操作可能（薄暗くならない）

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { loadFile, type ProvNoteDocument } from "../../lib/google-drive";

type SidePeekProps = {
  noteId: string;
  onClose: () => void;
  onNavigate: (noteId: string) => void;
};

export function SidePeek({ noteId, onClose, onNavigate }: SidePeekProps) {
  const [doc, setDoc] = useState<ProvNoteDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ノート読み込み
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);

    loadFile(noteId)
      .then((d) => {
        if (!cancelled) {
          setDoc(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "読み込みに失敗しました"
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [noteId]);

  // 読み取り専用 BlockNote エディタ
  const blocks = useMemo(
    () => doc?.pages?.[0]?.blocks ?? [],
    [doc]
  );

  const editor = useCreateBlockNote({
    initialContent: blocks.length > 0 ? blocks : undefined,
  });

  // noteId が変わったらエディタの内容を差し替え
  useEffect(() => {
    if (blocks.length > 0 && editor) {
      editor.replaceBlocks(editor.document, blocks);
    }
  }, [blocks, editor]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "55%",
        minWidth: 400,
        maxWidth: 800,
        background: "white",
        borderLeft: "1px solid #e2e8f0",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        // スライドインアニメーション
        animation: "sidePeekSlideIn 0.2s ease-out",
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "8px 12px",
          borderBottom: "1px solid #e2e8f0",
          background: "#fafbfc",
          flexShrink: 0,
        }}
      >
        {/* >> 閉じるボタン */}
        <button
          onClick={onClose}
          title="サイドピークを閉じる"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 4,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "#64748b",
            fontSize: 16,
            fontWeight: 700,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#f1f5f9";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
          </svg>
        </button>

        {/* 拡大（フルで開く）ボタン */}
        <button
          onClick={() => onNavigate(noteId)}
          title="フルスクリーンで開く"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 4,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "#64748b",
            fontSize: 14,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#f1f5f9";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="10" y1="14" x2="3" y2="21" />
          </svg>
        </button>

        {/* タイトル */}
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: "#1e293b",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginLeft: 4,
          }}
        >
          {doc?.title ?? ""}
        </span>
      </div>

      {/* コンテンツ */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 200,
              color: "#94a3b8",
              fontSize: 13,
            }}
          >
            読み込み中...
          </div>
        )}
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 200,
              color: "#ef4444",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {!loading && !error && (
          <div style={{ padding: "16px 24px" }}>
            <BlockNoteView
              editor={editor}
              editable={false}
              theme="light"
            />
          </div>
        )}
      </div>

      {/* CSS アニメーション */}
      <style>{`
        @keyframes sidePeekSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}
