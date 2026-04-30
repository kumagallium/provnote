// テキスト選択時の FormattingToolbar に AI ボタン + インラインラベル群を追加

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

type InlineLabelKey = keyof typeof LABEL_TO_STYLE;

const INLINE_LABEL_ORDER: InlineLabelKey[] = ["material", "tool", "attribute", "output"];

const INLINE_LABEL_COLOR_CLASS: Record<InlineLabelKey, string> = {
  material: "text-[#4B7A52] hover:bg-[rgba(75,122,82,0.12)]",
  tool: "text-[#c08b3e] hover:bg-[rgba(192,139,62,0.12)]",
  attribute: "text-[#8a8a8a] hover:bg-[rgba(160,160,160,0.12)]",
  output: "text-[#c26356] hover:bg-[rgba(194,99,86,0.12)]",
};

/** ランダムな entityId を生成（後でユーザーが既存 Entity を選んで上書きできる想定） */
function makeEntityId(label: InlineLabelKey): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ent_${label}_${rand}`;
}

export function NoteFormattingToolbar(props: FormattingToolbarProps) {
  const editor = useBlockNoteEditor<any, any, any>();
  const aiAssistant = useAiAssistant();
  const t = useT();

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

  /**
   * 指定ラベルの inline style を選択範囲にトグルする。
   *   - 選択範囲がブロック跨ぎの場合は無効（規約違反、コンソール警告のみ）
   *   - 既に同じ style が当たっていたら removeStyles で外す
   *   - 当たっていなければ新しい entityId を生成して addStyles で付ける
   */
  const handleInlineLabelClick = (label: InlineLabelKey) => {
    const styleKey = LABEL_TO_STYLE[label];
    const selection = editor.getSelection();
    if (selection?.blocks && selection.blocks.length > 1) {
      // ブロック跨ぎ禁止（Phase C 設計）
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

  return (
    <FormattingToolbar {...props}>
      {getFormattingToolbarItems(props.blockTypeSelectItems)}
      {INLINE_LABEL_ORDER.map((label) => {
        const styleKey = LABEL_TO_STYLE[label];
        const activeStyles = editor.getActiveStyles?.() ?? {};
        const isActive = Boolean(activeStyles[styleKey]);
        return (
          <button
            key={label}
            onClick={() => handleInlineLabelClick(label)}
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
