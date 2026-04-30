// ──────────────────────────────────────────────
// メディアブロック単独選択時に表示するフローティングツールバー（Phase D-3-β）
//
// テキスト用 FormattingToolbar とボタン外観を揃え、データの保存先だけ
// MediaInlineLabelStore（サイドストア）に分かれる二重実装。
// 詳細: docs/internal/provenance-layer-design.md §8.6
// ──────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useBlockNoteEditor } from "@blocknote/react";
import { getDisplayLabelName } from "../../i18n";
import {
  useMediaInlineLabelStoreOptional,
  makeMediaEntityId,
  type MediaLabelEntry,
} from "./media-store";

const MEDIA_BLOCK_TYPES = new Set(["image", "video", "audio", "file", "pdf"]);

type InlineLabelKey = MediaLabelEntry["label"];

const INLINE_LABEL_ORDER: InlineLabelKey[] = [
  "material",
  "tool",
  "attribute",
  "output",
];

const INLINE_LABEL_COLOR_CLASS: Record<InlineLabelKey, string> = {
  material: "text-[#4B7A52] hover:bg-[rgba(75,122,82,0.12)]",
  tool: "text-[#c08b3e] hover:bg-[rgba(192,139,62,0.12)]",
  attribute: "text-[#8a8a8a] hover:bg-[rgba(160,160,160,0.12)]",
  output: "text-[#c26356] hover:bg-[rgba(194,99,86,0.12)]",
};

type SingleSelection = {
  blockId: string;
  blockType: string;
};

/**
 * 単一のメディアブロックが選択された状態を tiptap NodeSelection から検出する。
 * BlockNote の `editor.getSelection()` は範囲選択 (≥2 ブロック) のみ返すため、
 * NodeSelection を直接見て image/video/audio/file/pdf を識別する。
 */
function useSingleMediaBlockSelection(editor: any): SingleSelection | null {
  const [selection, setSelection] = useState<SingleSelection | null>(null);

  useEffect(() => {
    if (!editor?._tiptapEditor) return;
    const tiptap = editor._tiptapEditor;

    const compute = () => {
      const sel = tiptap.state.selection;
      // NodeSelection の判定: from + nodeSize === to かつ node が選択されている
      const node = sel.node;
      if (!node) {
        setSelection(null);
        return;
      }
      // BlockNote のメディアブロックは blockOuter > blockContent > <media node>
      // のいずれかが node selection になる。実装上、内側の media ノードが
      // 選ばれる場合と外側が選ばれる場合があるため両方判定する。
      const findMediaInfo = (): SingleSelection | null => {
        // 1) ノード自身がメディア
        if (node?.type?.name && MEDIA_BLOCK_TYPES.has(node.type.name)) {
          // blockOuter までさかのぼって id を取得
          const $pos = sel.$from;
          for (let depth = $pos.depth; depth >= 0; depth--) {
            const ancestor = $pos.node(depth);
            if (ancestor?.type?.name === "blockContainer") {
              const id = ancestor.attrs?.id;
              if (id) return { blockId: id, blockType: node.type.name };
            }
          }
        }
        // 2) ノードが blockContainer で、その content にメディアが入っている
        if (node?.type?.name === "blockContainer") {
          const id = node.attrs?.id;
          // blockContainer > blockContent > mediaNode
          let mediaType: string | null = null;
          node.descendants((d: any) => {
            if (mediaType) return false;
            if (d?.type?.name && MEDIA_BLOCK_TYPES.has(d.type.name)) {
              mediaType = d.type.name;
              return false;
            }
            return true;
          });
          if (id && mediaType) return { blockId: id, blockType: mediaType };
        }
        return null;
      };

      const info = findMediaInfo();
      setSelection((prev) => {
        if (!info) return null;
        if (prev && prev.blockId === info.blockId && prev.blockType === info.blockType) {
          return prev;
        }
        return info;
      });
    };

    compute();
    tiptap.on("selectionUpdate", compute);
    tiptap.on("transaction", compute);
    return () => {
      tiptap.off("selectionUpdate", compute);
      tiptap.off("transaction", compute);
    };
  }, [editor]);

  return selection;
}

export function MediaInlineLabelToolbar() {
  const editor = useBlockNoteEditor<any, any, any>();
  const store = useMediaInlineLabelStoreOptional();
  const selection = useSingleMediaBlockSelection(editor);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  // ツールバー位置を計算
  useEffect(() => {
    if (!selection) {
      setPosition(null);
      return;
    }
    const blockEl = document.querySelector(
      `[data-node-type="blockOuter"][data-id="${selection.blockId}"]`,
    );
    if (!blockEl) {
      setPosition(null);
      return;
    }
    const rect = blockEl.getBoundingClientRect();
    const editorEl = document.querySelector(".bn-editor");
    const editorRect = editorEl?.getBoundingClientRect();
    if (!editorRect) {
      setPosition(null);
      return;
    }
    setPosition({
      top: rect.top - editorRect.top - 44,
      left: rect.left - editorRect.left,
    });
  }, [selection]);

  if (!store || !selection || !position) return null;

  const current = store.getLabel(selection.blockId);

  const handleClick = (label: InlineLabelKey) => {
    if (current?.label === label) {
      // 同じラベルをもう一度押すと解除（テキスト inline と同じトグル挙動）
      store.setLabel(selection.blockId, null);
    } else {
      store.setLabel(selection.blockId, {
        label,
        entityId: current?.entityId ?? makeMediaEntityId(label),
      });
    }
  };

  return (
    <div
      className="absolute z-50 flex items-center gap-1 rounded-lg border border-border bg-white px-2 py-1 shadow-md"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => {
        // クリックでメディア選択が外れないように
        e.preventDefault();
      }}
      data-test="media-inline-label-toolbar"
    >
      {INLINE_LABEL_ORDER.map((label) => {
        const isActive = current?.label === label;
        return (
          <button
            key={label}
            onClick={() => handleClick(label)}
            title={getDisplayLabelName(label)}
            className={[
              "bn-button inline-flex items-center justify-center rounded transition-colors px-1.5 text-[11px] font-semibold",
              INLINE_LABEL_COLOR_CLASS[label],
              isActive ? "bg-black/5 ring-1 ring-current/30" : "",
            ].join(" ")}
            data-test={`mediaInlineLabel-${label}`}
          >
            {getDisplayLabelName(label)}
          </button>
        );
      })}
    </div>
  );
}
