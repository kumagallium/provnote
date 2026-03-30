// インデックステーブルの行頭アイコンレイヤー
// ProvIndicatorLayer と同じパターンで body ポータルに描画する

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIndexTableStore } from "./store";
import { getFirstCellText, createNoteFromRow } from "./create-note-from-row";
import { getIndexTableCallbacks } from "./context";
import { MentionPreview } from "../block-link/mention-preview";

// 行ごとのアイコン情報
type RowIcon = {
  blockId: string;
  rowIndex: number;
  sampleName: string;
  linkedNoteId: string | null;
  top: number;
  left: number;
};

// プレビュー表示状態
type PreviewState = {
  noteId: string;
  anchorRect: { top: number; left: number };
} | null;

export function IndexTableIconLayer({ editorRef }: { editorRef: React.RefObject<any> }) {
  const store = useIndexTableStore();
  const [icons, setIcons] = useState<RowIcon[]>([]);
  const [loading, setLoading] = useState<string | null>(null); // "blockId:rowIndex"
  const [preview, setPreview] = useState<PreviewState>(null);

  // テーブル行の位置を計算
  const compute = useCallback(() => {
    const next: RowIcon[] = [];
    const editor = editorRef.current;
    if (!editor) return;

    store.tables.forEach((linkedNotes, blockId) => {
      const block = editor.getBlock(blockId);
      if (!block || block.type !== "table") return;

      // DOM からテーブル要素を取得
      const blockEl = document.querySelector(
        `[data-id="${blockId}"][data-node-type="blockOuter"]`
      );
      if (!blockEl) return;

      const trElements = blockEl.querySelectorAll("tr");
      const tableRows = block.content?.rows;
      if (!tableRows) return;

      // ヘッダー行（最初の行）はスキップ
      for (let i = 1; i < trElements.length && i < tableRows.length; i++) {
        const tr = trElements[i];
        const trRect = tr.getBoundingClientRect();
        const sampleName = getFirstCellText(block, i);
        const linkedNoteId = sampleName ? linkedNotes[sampleName] ?? null : null;

        next.push({
          blockId,
          rowIndex: i,
          sampleName,
          linkedNoteId,
          // viewport 座標
          top: trRect.top + trRect.height / 2,
          left: trRect.left - 28,
        });
      }
    });

    setIcons(next);
  }, [store.tables, editorRef]);

  // DOM 変化を監視
  useEffect(() => {
    const raf = requestAnimationFrame(compute);
    return () => cancelAnimationFrame(raf);
  }, [compute]);

  useEffect(() => {
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);

    // エディタ内の DOM 変化を監視
    const editorEl = document.querySelector("[data-label-wrapper]");
    let observer: MutationObserver | null = null;
    if (editorEl) {
      observer = new MutationObserver(compute);
      observer.observe(editorEl, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    }

    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
      observer?.disconnect();
    };
  }, [compute]);

  // 未リンク行 → ノート作成
  const handleCreateNote = useCallback(
    async (blockId: string, rowIndex: number) => {
      const callbacks = getIndexTableCallbacks();
      const editor = editorRef.current;
      if (!callbacks || !editor) return;

      const key = `${blockId}:${rowIndex}`;
      setLoading(key);
      try {
        const fileId = await createNoteFromRow(
          editor,
          blockId,
          rowIndex,
          callbacks.files,
          store,
        );
        if (fileId) {
          callbacks.onRefreshFiles();
        }
      } catch (err) {
        console.error("ノート作成に失敗:", err);
      } finally {
        setLoading(null);
      }
    },
    [editorRef, store]
  );

  // リンク済み行 → プレビュー
  const handleLinkedClick = useCallback(
    (noteId: string, e: React.MouseEvent) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setPreview({
        noteId,
        anchorRect: { top: rect.bottom, left: rect.right + 8 },
      });
    },
    []
  );

  // プレビューからのノート遷移
  const handleNavigate = useCallback((noteId: string) => {
    const callbacks = getIndexTableCallbacks();
    if (!callbacks) return;
    callbacks.onNavigateNote(noteId);
  }, []);

  if (icons.length === 0) return null;

  return createPortal(
    <>
      {icons.map((icon) => {
        const key = `${icon.blockId}:${icon.rowIndex}`;
        const isLoading = loading === key;

        return (
          <button
            key={key}
            onClick={(e) =>
              icon.linkedNoteId
                ? handleLinkedClick(icon.linkedNoteId, e)
                : handleCreateNote(icon.blockId, icon.rowIndex)
            }
            title={
              icon.linkedNoteId
                ? `${icon.sampleName} のノートをプレビュー`
                : icon.sampleName
                  ? `${icon.sampleName} のノートを作成`
                  : "セルにテキストを入力してください"
            }
            disabled={!icon.sampleName || isLoading}
            style={{
              position: "fixed",
              top: icon.top - 10,
              left: icon.left,
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              border: "none",
              background: "transparent",
              cursor: icon.sampleName ? "pointer" : "default",
              opacity: icon.sampleName ? 1 : 0.3,
              fontSize: 12,
              zIndex: 50,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (icon.sampleName)
                (e.target as HTMLElement).style.background = "#f0f0f0";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = "transparent";
            }}
          >
            {isLoading ? (
              <span style={{ fontSize: 10 }}>...</span>
            ) : icon.linkedNoteId ? (
              <span style={{ color: "#22c55e" }}>&#10003;</span>
            ) : (
              <span style={{ color: "#6b7280" }}>&#128196;</span>
            )}
          </button>
        );
      })}

      {preview && (
        <MentionPreview
          noteId={preview.noteId}
          anchorRect={preview.anchorRect}
          onClose={() => setPreview(null)}
          onNavigate={handleNavigate}
        />
      )}
    </>,
    document.body
  );
}
