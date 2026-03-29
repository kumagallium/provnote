// ──────────────────────────────────────────────
// sampleScope ブロック自動挿入ロジック
//
// [パターン]（[試料]）ラベル付きテーブルがノート内に存在するとき、
// 全 [手順] スコープに sampleScope ブロックを自動挿入する。
// ──────────────────────────────────────────────

import { normalizeLabel } from "../context-label/labels";
import { parseSampleTable } from "../sample-branch/parser";

/**
 * ノート全体のブロックとラベルから [パターン] テーブルを検出し、
 * 試料 ID 一覧を返す。テーブルが見つからなければ空配列。
 */
export function detectSampleIds(
  blocks: any[],
  labels: Map<string, string>,
): string[] {
  const table = findSampleTableRecursive(blocks, labels);
  if (!table) return [];
  const parsed = parseSampleTable(table);
  if (!parsed || parsed.rows.length === 0) return [];
  return parsed.rows.map((r) => r.sampleId);
}

/**
 * ブロックツリー全体を再帰的に探索し、
 * [パターン] ラベル付きテーブルを返す。
 */
function findSampleTableRecursive(
  blocks: any[],
  labels: Map<string, string>,
): any | null {
  for (const block of blocks) {
    const rawLabel = labels.get(block.id);
    if (rawLabel) {
      const normalized = normalizeLabel(rawLabel);
      if (normalized === "[パターン]" && block.type === "table") {
        return block;
      }
    }
    if (block.children && block.children.length > 0) {
      const found = findSampleTableRecursive(block.children, labels);
      if (found) return found;
    }
  }
  return null;
}

/**
 * エディタに sampleScope ブロックを自動挿入する。
 *
 * - [手順] ラベル付きの見出しスコープの children 末尾に挿入
 * - 既に sampleScope ブロックが存在するスコープには二重挿入しない
 * - 新規挿入時は各試料の Block[] を空で初期化
 *
 * @returns 挿入された sampleScope ブロック数
 */
export function autoInsertSampleScopes(
  editor: any,
  labels: Map<string, string>,
  sampleIds: string[],
): number {
  if (sampleIds.length === 0) return 0;

  const blocks = editor.document;
  let insertCount = 0;

  // [手順] ラベル付きブロックを探す
  for (const block of flattenBlocks(blocks)) {
    const rawLabel = labels.get(block.id);
    if (!rawLabel) continue;
    const normalized = normalizeLabel(rawLabel);
    if (normalized !== "[手順]") continue;

    // 見出しブロックのみ対象（段落の [手順] はスコープを持たない場合がある）
    if (block.type !== "heading") continue;

    // 既に sampleScope が存在するか確認
    const children = block.children || [];
    const hasSampleScope = children.some((c: any) => c.type === "sampleScope");
    if (hasSampleScope) continue;

    // 初期 samples: 全試料に空配列を設定
    const samplesInit: Record<string, any[]> = {};
    for (const id of sampleIds) {
      samplesInit[id] = [];
    }

    // 見出しの children 末尾に挿入
    try {
      editor.insertBlocks(
        [
          {
            type: "sampleScope",
            props: {
              samples: JSON.stringify(samplesInit),
              activeSampleId: sampleIds[0],
              skippedSamples: "{}",
            },
          },
        ],
        block.id,
        "nested",
      );
      insertCount++;
    } catch (e) {
      console.warn("[sampleScope] 自動挿入失敗:", block.id, e);
    }
  }

  return insertCount;
}

/**
 * 既存 sampleScope ブロックの試料一覧を更新する。
 * 新しい試料が追加された場合は空配列を追加、
 * 削除された試料はそのまま保持（ユーザーデータ保護）。
 */
export function syncSampleScopeIds(
  editor: any,
  sampleIds: string[],
): void {
  const blocks = editor.document;
  for (const block of flattenBlocks(blocks)) {
    if (block.type !== "sampleScope") continue;

    let samples: Record<string, any[]>;
    try {
      samples = JSON.parse(block.props.samples) || {};
    } catch {
      samples = {};
    }

    let changed = false;
    for (const id of sampleIds) {
      if (!(id in samples)) {
        samples[id] = [];
        changed = true;
      }
    }

    // activeSampleId が空なら先頭に設定
    const activeSampleId = block.props.activeSampleId || sampleIds[0] || "";

    if (changed || !block.props.activeSampleId) {
      editor.updateBlock(block.id, {
        props: {
          samples: JSON.stringify(samples),
          activeSampleId,
        },
      });
    }
  }
}

/** ブロックツリーをフラット化 */
function flattenBlocks(blocks: any[]): any[] {
  const result: any[] = [];
  for (const block of blocks) {
    result.push(block);
    if (block.children && Array.isArray(block.children)) {
      result.push(...flattenBlocks(block.children));
    }
  }
  return result;
}
