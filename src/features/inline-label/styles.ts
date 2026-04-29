// ──────────────────────────────────────────────
// BlockNote インライン style としてのコアラベル
//
// Phase C (2026-04-29): block-level の material/tool/attribute/output ラベルを
// 廃止し、BlockNote のテキスト style として保存する。各 style の値は
// PROV Entity の同一性キー (entityId) を string で持つ。
//
// ProseMirror mark として永続化されるため、
//   - ブロック編集に追従（mark は自動で split/merge される）
//   - ノート JSON 内で blocks[].content[].styles に格納される
//   - ハイライトの from/to/text 等は BlockNote が管理する
//
// 1 つの mark = 1 ハイライト = 1 PROV Entity のリファレンス。
// 同 entityId を共有する複数 mark が同じ Entity を指すこともある（参照重複の集約）。
// ──────────────────────────────────────────────

import { createStyleSpec } from "@blocknote/core";

const BASE_STYLE = "padding: 0 0.1em; border-radius: 2px;";

const COLORS = {
  // Inline 4 種の色（既存のラベルバッジ色と揃える）
  material: { bg: "rgba(75, 122, 82, 0.18)", border: "#4B7A52" },   // Input
  tool: { bg: "rgba(192, 139, 62, 0.18)", border: "#c08b3e" },       // Tool
  attribute: { bg: "rgba(160, 160, 160, 0.18)", border: "#8a8a8a" }, // Parameter
  output: { bg: "rgba(194, 99, 86, 0.18)", border: "#c26356" },      // Output
} as const;

type InlineLabel = keyof typeof COLORS;

function buildSpec(label: InlineLabel) {
  const colors = COLORS[label];
  return createStyleSpec(
    {
      type: `inline${label[0].toUpperCase()}${label.slice(1)}`,
      propSchema: "string",
    },
    {
      render: (entityId) => {
        const span = document.createElement("span");
        span.setAttribute("data-inline-label", label);
        if (typeof entityId === "string" && entityId) {
          span.setAttribute("data-entity-id", entityId);
        }
        span.style.cssText = [
          BASE_STYLE,
          `background-color: ${colors.bg};`,
          `border-bottom: 1px solid ${colors.border};`,
        ].join(" ");
        return { dom: span, contentDOM: span };
      },
    },
  );
}

export const inlineMaterialStyle = buildSpec("material");
export const inlineToolStyle = buildSpec("tool");
export const inlineAttributeStyle = buildSpec("attribute");
export const inlineOutputStyle = buildSpec("output");

/**
 * BlockNoteSchema.create に渡す styleSpecs マップ。
 *   key = style 名（プロパティ名として content[].styles[key] = entityId に格納される）
 */
export const inlineLabelStyleSpecs = {
  inlineMaterial: inlineMaterialStyle,
  inlineTool: inlineToolStyle,
  inlineAttribute: inlineAttributeStyle,
  inlineOutput: inlineOutputStyle,
} as const;

/** BlockNote style 名 ↔ コアラベル */
export const STYLE_TO_LABEL: Record<string, InlineLabel> = {
  inlineMaterial: "material",
  inlineTool: "tool",
  inlineAttribute: "attribute",
  inlineOutput: "output",
};

export const LABEL_TO_STYLE: Record<InlineLabel, keyof typeof inlineLabelStyleSpecs> = {
  material: "inlineMaterial",
  tool: "inlineTool",
  attribute: "inlineAttribute",
  output: "inlineOutput",
};
