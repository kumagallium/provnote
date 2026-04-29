// ──────────────────────────────────────────────
// GraphiumDocument マイグレーション
//
// 各プロバイダ（google-drive / local / filesystem）が loadFile 時に
// 呼び出す共通関数。読み込んだドキュメントを最新 version に正規化する。
//
// version 履歴:
//   1 → 2: links フィールドを provLinks / knowledgeLinks に分離
//   2 → 3: labels の値を日本語ブラケット（[材料] 等）から内部キー（material 等）に移行
//   3 → 4: 旧内部キー "result"（Output Entity 意味）を "output" にリネーム。
//          Phase 用の "plan" / "result"（Phase 意味）を新設したため衝突回避。
//   4 → 5: block-level inline-type ラベル（material/tool/attribute/output）を
//          ブロック全文をカバーするインラインハイライトに変換。
//          LabelStore は heading 用ラベル（procedure/plan/result/free.*）に純化。
// ──────────────────────────────────────────────

import type { GraphiumDocument, InlineHighlight } from "./document-types";
import { normalizeLabel, classifyLabel } from "../features/context-label/labels";

export const LATEST_DOCUMENT_VERSION = 5;

const INLINE_TYPE_LABELS = new Set(["material", "tool", "attribute", "output"]);

/** 読み込んだドキュメントを最新 version に揃える（破壊的に変更して同じ参照を返す） */
export function migrateToLatest(doc: GraphiumDocument): GraphiumDocument {
  if (!doc || typeof doc !== "object") return doc;

  // v1 → v2: links を provLinks / knowledgeLinks に分離
  migrateLinksToV2(doc);

  // v2 → v3: labels の値を内部キーに正規化
  if ((doc.version ?? 1) < 3) {
    migrateLabelsToV3(doc);
    doc.version = 3;
  }

  // v3 → v4: "result" → "output" リネーム（Output Entity 意味のラベルを移行）
  if ((doc.version ?? 1) < 4) {
    migrateResultToOutputV4(doc);
    doc.version = 4;
  }

  // v4 → v5: block-level inline-type ラベルを whole-block highlight に変換
  if ((doc.version ?? 1) < 5) {
    migrateInlineLabelsToHighlightsV5(doc);
    doc.version = 5;
  }

  return doc;
}

/** v1 → v2: ページ内の links を provLinks / knowledgeLinks に分解 */
function migrateLinksToV2(doc: GraphiumDocument): void {
  for (const page of doc.pages ?? []) {
    if (page.links && !page.provLinks) {
      const provLinks: any[] = [];
      const knowledgeLinks: any[] = [];
      for (const link of page.links) {
        const isProv = !link.type || [
          "derived_from", "used", "generated", "reproduction_of", "informed_by",
        ].includes(link.type);
        if (isProv) {
          provLinks.push({ ...link, layer: "prov" });
        } else {
          knowledgeLinks.push({ ...link, layer: "knowledge" });
        }
      }
      page.provLinks = provLinks;
      page.knowledgeLinks = knowledgeLinks;
    }
    if (!page.provLinks) page.provLinks = [];
    if (!page.knowledgeLinks) page.knowledgeLinks = [];
  }
  if ((doc.version ?? 1) < 2) {
    doc.version = 2;
  }
}

/**
 * v2 → v3: labels の値を内部キーに正規化する。
 * 既知のエイリアス（[材料] 等）は ALIAS_MAP で内部キーに変換する。
 * 未知のラベル文字列はそのまま保持（フリーラベル扱い）。
 */
function migrateLabelsToV3(doc: GraphiumDocument): void {
  for (const page of doc.pages ?? []) {
    if (!page.labels) continue;
    const next: Record<string, string> = {};
    for (const [blockId, rawLabel] of Object.entries(page.labels)) {
      if (typeof rawLabel !== "string") continue;
      const layer = classifyLabel(rawLabel);
      // core / alias 両方に対して normalizeLabel が正規化する
      next[blockId] = layer === "free" ? rawLabel : normalizeLabel(rawLabel);
    }
    page.labels = next;
  }
}

/**
 * v3 → v4: 旧内部キー "result"（Output Entity 意味）を "output" にリネーム。
 *
 * Phase A で 3 層構造（Section / Phase / Inline）に再編した際、
 * Phase 用に新ラベル "plan" / "result" を導入した。旧 v3 では "result" は
 * Output Entity を意味していたため、衝突回避のため Output 側を "output" に移す。
 *
 * 既存ノートの labels マップ内の "result" は **無条件に "output" へ書き換える**。
 * （v3 時点では Phase 意味の "result" は存在しないため安全）。
 */
function migrateResultToOutputV4(doc: GraphiumDocument): void {
  for (const page of doc.pages ?? []) {
    if (!page.labels) continue;
    const next: Record<string, string> = {};
    for (const [blockId, rawLabel] of Object.entries(page.labels)) {
      if (typeof rawLabel !== "string") {
        continue;
      }
      next[blockId] = rawLabel === "result" ? "output" : rawLabel;
    }
    page.labels = next;
  }
}

/**
 * v4 → v5: block-level inline-type ラベル（material/tool/attribute/output）を
 * ブロック全文をカバーするインラインハイライトに変換する。
 *
 * Phase C 設計（docs/internal/provenance-layer-design.md）:
 *   - block-level inline-type ラベルは廃止。インラインハイライトのみが referent を表す
 *   - 既存ノートを壊さないため、変換時に whole-block ハイライトを生成して同じ意味を保つ
 *   - LabelStore は heading 用（procedure/plan/result/free.*）に純化される
 *
 * 安全策:
 *   - 該当ラベルが付いていてもブロックが見つからない場合は、ハイライト未生成で labels から削除
 *   - 既に highlights 配列がある場合は append（破壊しない）
 *   - 元のテキストが空のブロックは from=0, to=0 のハイライトとして残す（後段で空ハイライトのクリーンアップを別途行う）
 */
function migrateInlineLabelsToHighlightsV5(doc: GraphiumDocument): void {
  for (const page of doc.pages ?? []) {
    if (!page.labels) continue;
    const blockIndex = buildBlockIndex(page.blocks ?? []);
    const remainingLabels: Record<string, string> = {};
    const highlights: InlineHighlight[] = page.highlights ? [...page.highlights] : [];

    for (const [blockId, rawLabel] of Object.entries(page.labels)) {
      if (typeof rawLabel !== "string") continue;

      if (!INLINE_TYPE_LABELS.has(rawLabel)) {
        // heading 用ラベル / free ラベルはそのまま残す
        remainingLabels[blockId] = rawLabel;
        continue;
      }

      const block = blockIndex.get(blockId);
      const text = block ? extractBlockText(block) : "";

      highlights.push({
        id: `mig_${blockId}_${rawLabel}`,
        blockId,
        from: 0,
        to: text.length,
        label: rawLabel as InlineHighlight["label"],
        entityId: `ent_${blockId}`,
        text,
      });
      // labels からは消す
    }

    page.labels = remainingLabels;
    if (highlights.length > 0) {
      page.highlights = highlights;
    }
  }
}

/**
 * ブロックツリーを再帰的に走査して `Map<blockId, block>` を作る。
 */
function buildBlockIndex(blocks: any[]): Map<string, any> {
  const index = new Map<string, any>();
  const walk = (nodes: any[]) => {
    for (const node of nodes ?? []) {
      if (node && typeof node.id === "string") {
        index.set(node.id, node);
      }
      if (node?.children?.length) {
        walk(node.children);
      }
    }
  };
  walk(blocks);
  return index;
}

/**
 * ブロックの content からテキストを抽出する。
 * BlockNote の InlineContent 配列を想定:
 *   - { type: "text", text: "..." } → text を連結
 *   - { type: "link", content: [...] } → 中の text を連結
 *   - 文字列の場合はそのまま
 *   - その他 (image / table 等) はテキスト 0
 */
function extractBlockText(block: any): string {
  const content = block?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c: any) => {
      if (typeof c === "string") return c;
      if (c?.type === "text") return c.text ?? "";
      if (c?.type === "link") return extractInlineText(c.content ?? []);
      return "";
    })
    .join("");
}

function extractInlineText(inlines: any[]): string {
  if (!Array.isArray(inlines)) return "";
  return inlines
    .map((c: any) => (typeof c === "string" ? c : c?.text ?? ""))
    .join("");
}
