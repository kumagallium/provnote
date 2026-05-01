// ──────────────────────────────────────────────
// コピペ時のインライン entityId 再発番（Phase E, 2026-04-30）
//
// BlockNote のコピペは inline style の `entityId` 値ごとそのまま複製するため、
// 複数の手順にコピペで貼ると「全部同じ Entity」として PROV グラフ上で
// 1 ノードに集約されてしまう。テンプレートからのコピーや「同じ構造を別実験で
// 使い回す」用途では、これは意図しない挙動になる。
//
// このモジュールは、新しく挿入されたブロック群の inline style を走査して
// entityId を新規発番し直す。**同じ (style, oldEntityId) ペアは同じ新 ID
// にマップされる**ので、複数ブロックにまたがる「論理的に同一」なエンティティ
// 関係はコピー後も保たれる（fresh だが一貫性は維持）。
//
// Phase F 以降の課題: 「コピー後にもとの Entity と同一視したい」場合の
// 明示的な merge UI は別途検討。
// ──────────────────────────────────────────────

import {
  parseAttributeBinding,
  formatAttributeBinding,
} from "./attribute-binding";

const INLINE_STYLE_TO_ROLE: Record<string, "material" | "tool" | "attribute" | "output"> = {
  inlineMaterial: "material",
  inlineTool: "tool",
  inlineAttribute: "attribute",
  inlineOutput: "output",
};

function freshEntityId(role: "material" | "tool" | "attribute" | "output"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ent_${role}_${rand}`;
}

/**
 * 新しく挿入されたブロック (newBlockIds) の inline style entityId を再発番する。
 *
 * - ブロックは `editor.updateBlock(id, { content })` でインプレース更新する
 * - children も再帰的に走査
 * - link 配下の text にも適用
 * - 同 (style, oldEntityId) ペアは同じ新 ID に揃える（コピー範囲内の同一性を維持）
 */
export function regenInlineEntitiesInBlocks(
  editor: any,
  newBlockIds: ReadonlySet<string>,
): void {
  if (!editor || newBlockIds.size === 0) return;

  // (styleKey, oldEntityId) → 新 entityId（同 input は同 output に揃える）
  const remap = new Map<string, string>();
  const remapEntityId = (styleKey: string, oldId: string): string => {
    const key = `${styleKey}:${oldId}`;
    let newId = remap.get(key);
    if (!newId) {
      const role = INLINE_STYLE_TO_ROLE[styleKey];
      newId = freshEntityId(role);
      remap.set(key, newId);
    }
    return newId;
  };

  const rewriteStyles = (
    styles: Record<string, unknown> | undefined,
  ): Record<string, unknown> | null => {
    if (!styles) return null;
    let changed = false;
    const next: Record<string, unknown> = { ...styles };
    for (const styleKey of Object.keys(INLINE_STYLE_TO_ROLE)) {
      const oldRaw = next[styleKey];
      if (typeof oldRaw === "string" && oldRaw) {
        if (styleKey === "inlineAttribute") {
          // 親 Entity 明示指定はコピー範囲外を指す可能性があるため破棄して最寄り推論に戻す
          const { entityId } = parseAttributeBinding(oldRaw);
          if (entityId) {
            next[styleKey] = formatAttributeBinding({
              entityId: remapEntityId(styleKey, entityId),
              parentEntityId: null,
            });
            changed = true;
          }
        } else {
          next[styleKey] = remapEntityId(styleKey, oldRaw);
          changed = true;
        }
      }
    }
    return changed ? next : null;
  };

  const rewriteContent = (content: any[]): any[] | null => {
    let mutated = false;
    const newContent = content.map((c: any) => {
      if (c?.type === "text") {
        const next = rewriteStyles(c.styles);
        if (next) {
          mutated = true;
          return { ...c, styles: next };
        }
      } else if (c?.type === "link" && Array.isArray(c.content)) {
        const innerNext = rewriteContent(c.content);
        if (innerNext) {
          mutated = true;
          return { ...c, content: innerNext };
        }
      }
      return c;
    });
    return mutated ? newContent : null;
  };

  const visit = (blocks: any[]): void => {
    for (const block of blocks) {
      if (block?.id && newBlockIds.has(block.id) && Array.isArray(block.content)) {
        const next = rewriteContent(block.content);
        if (next) {
          try {
            editor.updateBlock(block.id, { content: next });
          } catch {
            // ブロックが既に消えているケース等は無視
          }
        }
      }
      if (Array.isArray(block?.children) && block.children.length > 0) {
        visit(block.children);
      }
    }
  };

  visit(editor.document);
}
