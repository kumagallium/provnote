// テキスト選択時の FormattingToolbar に AI ボタン + インラインラベル群を追加
// メディアブロック (image/video/audio/file/pdf) の NodeSelection 時も同じツールバーで
// インラインラベルを付与する（Phase D-3-β: データ保存先のみサイドストアに分岐）

import {
  FormattingToolbar,
  getFormattingToolbarItems,
  useBlockNoteEditor,
} from "@blocknote/react";
import { Bot } from "lucide-react";
import { useAiAssistant } from "../features/ai-assistant";
import { useT, getDisplayLabelName } from "../i18n";
import type { FormattingToolbarProps } from "@blocknote/react";
import { LABEL_TO_STYLE } from "../features/inline-label/styles";
import {
  useMediaInlineLabelStoreOptional,
  makeMediaEntityId,
  type MediaInlineLabelType,
} from "../features/inline-label/media-store";

type InlineLabelKey = keyof typeof LABEL_TO_STYLE;

const INLINE_LABEL_ORDER: InlineLabelKey[] = ["material", "tool", "attribute", "output"];

const INLINE_LABEL_COLOR_CLASS: Record<InlineLabelKey, string> = {
  material: "text-[#4B7A52] hover:bg-[rgba(75,122,82,0.12)]",
  tool: "text-[#c08b3e] hover:bg-[rgba(192,139,62,0.12)]",
  attribute: "text-[#8a8a8a] hover:bg-[rgba(160,160,160,0.12)]",
  output: "text-[#c26356] hover:bg-[rgba(194,99,86,0.12)]",
};

/** ランダムな entityId を生成（テキスト inline 用） */
function makeEntityId(label: InlineLabelKey): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ent_${label}_${rand}`;
}

const MEDIA_BLOCK_TYPES = new Set(["image", "video", "audio", "file", "pdf"]);

/**
 * tiptap の現在の選択がメディアブロックの NodeSelection なら
 * 当該ブロック ID とメディア種別を返す。それ以外は null。
 */
function getSelectedMediaBlock(
  editor: any,
): { blockId: string; blockType: string } | null {
  const tiptap = editor?._tiptapEditor;
  if (!tiptap) return null;
  const sel = tiptap.state.selection;
  const node = sel?.node;
  if (!node) return null;

  // 1) ノード自身がメディア
  if (node.type?.name && MEDIA_BLOCK_TYPES.has(node.type.name)) {
    const $pos = sel.$from;
    for (let depth = $pos.depth; depth >= 0; depth--) {
      const ancestor = $pos.node(depth);
      if (ancestor?.type?.name === "blockContainer") {
        const id = ancestor.attrs?.id;
        if (id) return { blockId: id, blockType: node.type.name };
      }
    }
  }
  // 2) blockContainer 配下にメディアが入っている
  if (node.type?.name === "blockContainer") {
    const id = node.attrs?.id;
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
}

export function NoteFormattingToolbar(props: FormattingToolbarProps) {
  const editor = useBlockNoteEditor<any, any, any>();
  const aiAssistant = useAiAssistant();
  const mediaStore = useMediaInlineLabelStoreOptional();
  const t = useT();
  const mediaSel = getSelectedMediaBlock(editor);

  const handleAiClick = async () => {
    const selectedText = window.getSelection()?.toString()?.trim();
    if (!selectedText) return;

    const selection = editor.getSelection();
    const blockIds = selection?.blocks?.map((b: any) => b.id) ?? [];

    aiAssistant.openChat({
      sourceBlockIds: blockIds,
      quotedMarkdown: selectedText,
    });
  };

  /** テキスト選択時のラベルトグル（ProseMirror mark を付け外し） */
  const handleTextLabelClick = (label: InlineLabelKey) => {
    const styleKey = LABEL_TO_STYLE[label];
    const selection = editor.getSelection();
    if (selection?.blocks && selection.blocks.length > 1) {
      console.warn("[Graphium] inline label cannot span multiple blocks");
      return;
    }
    const activeStyles = editor.getActiveStyles?.() ?? {};
    const isActive = Boolean(activeStyles[styleKey]);
    if (isActive) {
      editor.removeStyles({ [styleKey]: activeStyles[styleKey] } as any);
    } else {
      editor.addStyles({ [styleKey]: makeEntityId(label) } as any);
    }
  };

  /** メディアブロック選択時のラベルトグル（サイドストアに書き込み） */
  const handleMediaLabelClick = (label: MediaInlineLabelType, blockId: string) => {
    if (!mediaStore) return;
    const current = mediaStore.getLabel(blockId);
    if (current?.label === label) {
      mediaStore.setLabel(blockId, null);
    } else {
      mediaStore.setLabel(blockId, {
        label,
        entityId: current?.entityId ?? makeMediaEntityId(label),
      });
    }
  };

  // ラベルボタンのアクティブ状態判定
  const activeStyles = mediaSel ? {} : editor.getActiveStyles?.() ?? {};
  const mediaCurrent = mediaSel ? mediaStore?.getLabel(mediaSel.blockId) : undefined;

  return (
    <FormattingToolbar {...props}>
      {getFormattingToolbarItems(props.blockTypeSelectItems)}
      {INLINE_LABEL_ORDER.map((label) => {
        const isActive = mediaSel
          ? mediaCurrent?.label === label
          : Boolean(activeStyles[LABEL_TO_STYLE[label]]);
        const onClick = () => {
          if (mediaSel) {
            handleMediaLabelClick(label as MediaInlineLabelType, mediaSel.blockId);
          } else {
            handleTextLabelClick(label);
          }
        };
        return (
          <button
            key={label}
            onClick={onClick}
            title={getDisplayLabelName(label)}
            className={[
              "bn-button inline-flex items-center justify-center rounded transition-colors px-1.5 text-[11px] font-semibold",
              INLINE_LABEL_COLOR_CLASS[label],
              isActive ? "bg-black/5 ring-1 ring-current/30" : "",
            ].join(" ")}
            data-test={`inlineLabel-${label}`}
          >
            {getDisplayLabelName(label)}
          </button>
        );
      })}
      {aiAssistant.aiAvailable && (
        <button
          onClick={handleAiClick}
          title={t("editor.askAi")}
          className="bn-button inline-flex items-center justify-center rounded hover:bg-violet-100 text-violet-500 transition-colors"
          data-test="aiButton"
        >
          <Bot size={18} />
        </button>
      )}
    </FormattingToolbar>
  );
}
