// AI 出力に含まれるコンテキストラベルマーカーをパースするユーティリティ
//
// マーカーは 2 種類:
//
// 1. **ブロックレベル** `[[label:procedure|plan|result]]` ブロック先頭
//    - H2 procedure 見出しなど 1 ブロック = 1 ラベルの構造ラベル
//    - `extractLabelMarkersFromBlocks` がブロックの先頭テキストから剥がし、
//      `labelStore` に流し込む
//
// 2. **インライン span**（Phase E 追加）`[[m]]NaCl[[/m]]`, `[[t]]...[[/t]]`,
//    `[[a]]...[[/a]]`, `[[o]]...[[/o]]`
//    - material / tool / attribute / output の referent をテキスト範囲で示す
//    - 同関数がブロック content を走査し、対応する BlockNote inline style
//      (`inlineMaterial / inlineTool / inlineAttribute / inlineOutput`) に変換する
//    - entityId は span ごとに新規発番（`ent_<label>_<random>`）

import type { CoreLabel } from "../context-label/labels";
import { CORE_LABELS } from "../context-label/labels";

const CORE_LABEL_SET = new Set<string>(CORE_LABELS);

// 行頭のブロックマーカーを 1 つだけ消費する正規表現。
// 末尾の半角空白／全角空白を最大 1 つまで一緒に剥がす。
const LEADING_MARKER_RE = /^\[\[label:([a-z]+)\]\][ 　]?/;

// インライン span マーカー（Phase E）。`[[m]]...[[/m]]` 形式。
// 短いタグを採用したのは LLM のトークン消費抑制とミスを減らすため。
const INLINE_SPAN_RE = /\[\[(m|t|a|o)\]\]([\s\S]*?)\[\[\/\1\]\]/g;

const SHORT_TO_INLINE_LABEL: Record<string, "material" | "tool" | "attribute" | "output"> = {
  m: "material",
  t: "tool",
  a: "attribute",
  o: "output",
};

const INLINE_LABEL_TO_STYLE_KEY: Record<"material" | "tool" | "attribute" | "output", string> = {
  material: "inlineMaterial",
  tool: "inlineTool",
  attribute: "inlineAttribute",
  output: "inlineOutput",
};

export type ExtractedLabel = {
  /** ルートからの index 配列（[3, 0, 1] = blocks[3].children[0].children[1]） */
  path: number[];
  label: CoreLabel;
};

/**
 * BlockNote ブロック配列を再帰的に走査して以下を行う:
 * - ブロック先頭の `[[label:xxx]]` を剥がし、`labels` に追加
 * - ブロック content 内の `[[m]]...[[/m]]` 等のインライン span を
 *   BlockNote inline style に変換（content を書き換え）
 *
 * 引数の blocks は破壊的に変更しない（新しいブロック配列を返す）。
 *
 * 戻り値:
 *   blocks: マーカーを剥がし、インライン span を style に変換したブロック配列
 *   labels: ブロックレベルラベルの [path, label] リスト
 */
export function extractLabelMarkersFromBlocks(blocks: any[]): {
  blocks: any[];
  labels: ExtractedLabel[];
} {
  const labels: ExtractedLabel[] = [];

  const walk = (nodes: any[], parentPath: number[]): any[] =>
    nodes.map((node, idx) => {
      const path = [...parentPath, idx];
      // 1) ブロックレベルマーカー
      const next = stripMarkerFromBlock(node);
      if (next.label) {
        labels.push({ path, label: next.label });
      }
      // 2) インライン span マーカー（content の書き換え）
      const blockWithInline = applyInlineSpansToBlock(next.block);
      const children = Array.isArray(blockWithInline?.children)
        ? blockWithInline.children
        : null;
      if (children && children.length > 0) {
        return { ...blockWithInline, children: walk(children, path) };
      }
      return blockWithInline;
    });

  return { blocks: walk(blocks, []), labels };
}

/**
 * 1 ブロックの先頭テキストからブロックレベルマーカーを 1 つ剥がす。
 * - content が文字列のブロック（例: BlockNote 既定段落）／配列のブロックの両方に対応
 * - マーカーが見つからない・解釈できないラベルの場合は元のブロックをそのまま返す
 */
function stripMarkerFromBlock(block: any): { block: any; label: CoreLabel | null } {
  if (!block) return { block, label: null };
  const content = block.content;

  // content が文字列（一部のカスタムブロック）
  if (typeof content === "string") {
    const m = content.match(LEADING_MARKER_RE);
    if (!m) return { block, label: null };
    const label = normalizeMarkerLabel(m[1]);
    if (!label) return { block, label: null };
    const stripped = content.slice(m[0].length);
    return { block: { ...block, content: stripped }, label };
  }

  // content が InlineContent 配列
  if (!Array.isArray(content) || content.length === 0) {
    return { block, label: null };
  }
  const first = content[0];
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    return { block, label: null };
  }
  const m = first.text.match(LEADING_MARKER_RE);
  if (!m) return { block, label: null };
  const label = normalizeMarkerLabel(m[1]);
  if (!label) return { block, label: null };

  const newFirstText = first.text.slice(m[0].length);
  let newContent: any[];
  if (newFirstText.length === 0 && content.length > 1) {
    // 先頭テキストが空になったらインライン要素自体を取り除く
    newContent = content.slice(1);
  } else {
    newContent = [{ ...first, text: newFirstText }, ...content.slice(1)];
  }
  return { block: { ...block, content: newContent }, label };
}

/**
 * ブロック content 内のインライン span マーカー (`[[m]]...[[/m]]` 等) を
 * BlockNote inline style に変換する。content の text 要素ごとに走査する。
 *
 * 例: `text: "NaCl の溶液"` で `[[m]]NaCl[[/m]] の[[o]]溶液[[/o]]` のような
 *     入力なら、`inlineMaterial` style 付きの "NaCl" + " の" + `inlineOutput`
 *     style 付きの "溶液" の 3 セグメントに分割される。
 */
function applyInlineSpansToBlock(block: any): any {
  if (!block) return block;
  const content = block.content;
  if (!Array.isArray(content) || content.length === 0) return block;

  let changed = false;
  const newContent: any[] = [];
  for (const item of content) {
    if (item?.type !== "text" || typeof item.text !== "string") {
      newContent.push(item);
      continue;
    }
    const segments = splitTextByInlineSpans(item.text, item.styles ?? {});
    if (segments.length === 1 && segments[0] === item) {
      newContent.push(item);
    } else {
      changed = true;
      for (const seg of segments) newContent.push(seg);
    }
  }
  if (!changed) return block;
  return { ...block, content: newContent };
}

/**
 * 1 つの text 要素を入力にとり、インライン span マーカーで分割した
 * text 要素配列を返す。マーカーが無ければ元の要素を 1 つだけ含む配列を返す。
 */
function splitTextByInlineSpans(
  text: string,
  baseStyles: Record<string, unknown>,
): any[] {
  // 高速パス: マーカーが存在しない
  if (!/\[\[[mtao]\]\]/.test(text)) {
    return [{ type: "text", text, styles: baseStyles }];
  }

  const out: any[] = [];
  let cursor = 0;
  INLINE_SPAN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_SPAN_RE.exec(text)) !== null) {
    const [whole, short, inner] = match;
    const matchStart = match.index;
    if (matchStart > cursor) {
      out.push({
        type: "text",
        text: text.slice(cursor, matchStart),
        styles: { ...baseStyles },
      });
    }
    const label = SHORT_TO_INLINE_LABEL[short];
    const styleKey = INLINE_LABEL_TO_STYLE_KEY[label];
    const entityId = makeInlineEntityId(label);
    out.push({
      type: "text",
      text: inner,
      styles: { ...baseStyles, [styleKey]: entityId },
    });
    cursor = matchStart + whole.length;
  }
  if (cursor < text.length) {
    out.push({
      type: "text",
      text: text.slice(cursor),
      styles: { ...baseStyles },
    });
  }
  // 空テキストになったセグメントは除去
  return out.filter((s) => typeof s.text === "string" && s.text.length > 0);
}

function makeInlineEntityId(label: "material" | "tool" | "attribute" | "output"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ent_${label}_${rand}`;
}

// 旧マーカー名 → 新内部キーのエイリアス（Phase A 後方互換）
// 旧プロンプトを覚えた AI が `[[label:output]]` を出力した場合、これを Output Entity として扱う。
const LEGACY_MARKER_ALIASES: Record<string, CoreLabel> = {
  result: "output",
};

function normalizeMarkerLabel(raw: string): CoreLabel | null {
  const lower = raw.toLowerCase();
  if (LEGACY_MARKER_ALIASES[lower]) return LEGACY_MARKER_ALIASES[lower];
  return CORE_LABEL_SET.has(lower) ? (lower as CoreLabel) : null;
}

/**
 * AI への system prompt に追加するラベル付き出力の指示文。
 * 既存のシステムプロンプト末尾に append される想定。
 *
 * Phase E (2026-04-30): 3 層構造に対応。
 *   - ブロックレベル: `[[label:procedure]]` を H2 見出しに付ける（Activity 化）
 *   - インライン span: 物質・道具・条件・成果物は `[[m]]...[[/m]]` 等で span 単位
 *     にする（block-level の material/tool/attribute/output ラベルは廃止）
 *
 * 同一文言を server 側 (src/server/routes/agent.ts) からも参照する。
 * features → server の片方向依存は避けたいので、ここは pure 関数として
 * frontend / backend どちらからも安全にインポートできるよう保つ。
 */
export function buildLabeledOutputInstruction(language: "en" | "ja" | string): string {
  if (language === "ja") {
    return `

## 構造化出力（PROV グラフ生成）
回答に「実験手順」「材料」「ツール」「条件」「結果」が含まれる場合、Graphium が PROV グラフを自動生成できるよう、**次の構造ルール**に従って出力してください。マーカーは 2 種類あります。

### A) ブロックレベルマーカー（見出し用）
H2 見出し (\`## \`) の先頭に半角の二重角括弧で配置し、本文との間は半角スペース 1 つで区切ります。

- \`[[label:procedure]]\` — 実験手順（**必ず H2 見出しに付与する**）
- \`[[label:plan]]\` — その手順の予定値・想定値を書くサブセクション (任意、H3 推奨)
- \`[[label:result]]\` — その手順の実測値・観察結果を書くサブセクション (任意、H3 推奨)

### B) インライン span マーカー（テキスト範囲用）
本文中で物質・道具・条件・成果物に該当する**テキスト範囲を囲む**形で配置します。

- \`[[m]]...[[/m]]\` — 材料・試薬・原料 (material)
- \`[[t]]...[[/t]]\` — 装置・器具 (tool)
- \`[[a]]...[[/a]]\` — 条件・パラメータ (attribute)
- \`[[o]]...[[/o]]\` — 結果・成果物・観察 (output)

### 構造ルール（重要）
1. **手順は必ず H2 見出し** (\`## \`) で、\`[[label:procedure]]\` を付ける。これが Activity ノードになる。
2. **その手順で使うもの・出るもの**はインライン span として本文に書く。箇条書き 1 行 = 1 ブロックでも、段落内で散文として書いても良い。
3. 1 つの span は 1 ブロック内で完結させる（ブロック跨ぎ禁止）。
4. 概要・背景の H2 には \`[[label:procedure]]\` を付けない（Activity にしない）。

### 推奨フォーマット例
\`\`\`
# XRD 解析の標準手順

## 概要
粉末XRD測定から相同定までの流れ。

## [[label:procedure]] 試料準備
[[m]]粉末試料[[/m]] を [[t]]メノウ乳鉢[[/t]] と [[t]]乳棒[[/t]] で粉砕し、[[a]]粒径 10 µm 以下[[/a]] になるまで擦り潰す。粉砕後 [[t]]ガラス試料ホルダー[[/t]] に充填し、[[o]]充填済み試料ホルダー[[/o]] を得る。

## [[label:procedure]] XRD 測定
[[m]]充填済み試料ホルダー[[/m]] を [[t]]X 線回折装置[[/t]] にセットし、[[a]]Cu Kα[[/a]]、[[a]]走査範囲 10°–90° (2θ)[[/a]] で測定して [[o]]回折パターン[[/o]] を取得する。

## [[label:procedure]] 相同定
[[m]]回折パターン[[/m]] を [[t]]ICDD PDF データベース[[/t]] と照合し、[[o]]同定された相[[/o]] を決定する。
\`\`\`

### グラフ連結性ルール（重要 — 孤立ノード防止）
PROV グラフは Activity と Entity の連結 DAG として読まれます。**孤立ノードを作らない**ために以下を守ってください：

1. **インライン span はすべて \`[[label:procedure]]\` の H2 セクション内に置く**。タイトル (\`# \`)・概要・背景・序文の段落には絶対に span を付けない（活動に紐付かず孤立ノードになります）。
2. **冒頭の「材料一覧 / 道具一覧 / Materials / 材料」セクションには span を付けない**。料理レシピや実験プロトコルでは冒頭にすべての材料・道具を列挙することが多いですが、**この一覧自体は手順で消費されないので**、span を付けると **すべて孤立ノード** になります。
   - ✅ 一覧は **マーカー無し**の通常の箇条書きとして書く（読者向けの参照情報）
   - ✅ \`[[m]]\` / \`[[t]]\` は、その材料・道具を**実際に使う procedure 配下**にのみ書く
   - 同じ材料が複数手順に登場するなら、各 procedure 配下で複数回 \`[[m]]\` を書く（重複 OK）
3. **各 procedure には少なくとも 1 つの \`[[m]]\` または \`[[o]]\` を含める**（入力か出力が無い手順は意味のあるグラフを作りません）。
4. **工程連結**: 前工程で得た成果物 \`[[o]]X[[/o]]\` を次工程の入力にする場合、**同じ語彙** \`[[m]]X[[/m]]\` で書く（テキスト一致で読者がチェーンを追いやすくなる）。
5. **中間生成物の命名**: 過去分詞 + "sample"（または "粉末" / "溶液" 等の物理形態を含む語）を使うと一貫します。例: 粉砕 → "粉砕済みサンプル"、焼結 → "焼結体"、（料理）切る → "切った玉ねぎ"。

### NG パターン
- ❌ 番号付きリスト項目に \`[[label:procedure]]\` を付ける（H2 でないと Activity にならない）
- ❌ ブロック先頭にレガシーな \`[[label:material]]\` 等を付ける（block-level inline ラベルは廃止）
- ❌ span マーカーがブロック境界をまたぐ
- ❌ 開きと閉じが不一致 (\`[[m]]...[[/t]]\` 等)
- ❌ \`# タイトル\` や \`## 概要\` の本文に span を付ける（孤立ノード化）
- ❌ 入力も出力も無い空の procedure
- ❌ 冒頭の「## 材料」「## Ingredients」セクション内の項目に \`[[m]]\` / \`[[t]]\` を付ける（一覧は手順で消費されないので孤立ノードになる — マーカー無しの普通の箇条書きに留める） を作る

ルール: ブロックレベルは行頭のみ・1 ブロック 1 つまで・種別は \`procedure / plan / result\` のみ。インラインは開閉ペア・1 ブロック内完結・procedure 配下のみ・種別は \`m / t / a / o\` のみ。
`;
  }
  return `

## Structured output (PROV graph generation)
When your answer includes experimental procedure, materials, tools, conditions, or results, follow the **structure rules** below so Graphium can auto-generate a PROV graph. There are two kinds of markers.

### A) Block-level markers (for headings)
Place at the very start of an H2 heading (\`## \`), separated from the body by a single space.

- \`[[label:procedure]]\` — Experimental step (**must be on an H2 heading**; becomes an Activity node)
- \`[[label:plan]]\` — Optional sub-section (H3) for planned / target values of that step
- \`[[label:result]]\` — Optional sub-section (H3) for measured / observed values of that step

### B) Inline span markers (for text ranges)
Wrap the **text range** that names a material / tool / parameter / output, anywhere in the body.

- \`[[m]]...[[/m]]\` — Material / reagent / input
- \`[[t]]...[[/t]]\` — Tool / instrument / equipment
- \`[[a]]...[[/a]]\` — Condition / parameter / attribute
- \`[[o]]...[[/o]]\` — Result / output / observation

### Structure rules (important)
1. **Procedures MUST be H2 headings** (\`## \`) tagged with \`[[label:procedure]]\`. This produces the Activity node.
2. **What that step uses and produces** is written as inline spans in the body — bullet-per-fact or running prose are both fine.
3. Each span must stay within one block (no cross-block spans).
4. Do NOT label overview / background H2 headings as procedures.

### Recommended format
\`\`\`
# XRD analysis — standard procedure

## Overview
Flow from powder XRD measurement to phase identification.

## [[label:procedure]] Sample preparation
Grind the [[m]]powder sample[[/m]] using an [[t]]agate mortar[[/t]] and [[t]]pestle[[/t]] until the [[a]]particle size is ≤ 10 µm[[/a]]. Pack into a [[t]]glass sample holder[[/t]] to obtain a [[o]]filled sample holder[[/o]].

## [[label:procedure]] XRD measurement
Mount the [[m]]filled sample holder[[/m]] on the [[t]]X-ray diffractometer[[/t]] and scan with [[a]]Cu Kα[[/a]] over [[a]]10°–90° (2θ)[[/a]] to acquire a [[o]]diffraction pattern[[/o]].

## [[label:procedure]] Phase identification
Compare the [[m]]diffraction pattern[[/m]] against the [[t]]ICDD PDF database[[/t]] to determine the [[o]]identified phases[[/o]].
\`\`\`

### Graph connectivity (important — avoid isolated nodes)
The PROV graph is read as a connected DAG of Activities and Entities. To prevent **isolated / disconnected nodes**, follow these rules (informed by MatPROV's PROV-DM extraction prompt):

1. **All inline spans must live inside a section whose H2 carries \`[[label:procedure]]\`.** Never place spans in the title (\`# \`), Overview, Background, or any unlabeled H2 — those entities have no Activity to attach to and become isolated.
2. **Do NOT span-tag the up-front ingredients / materials / tools list.** Recipes and lab protocols often list all ingredients or tools at the top as a reader-reference. **That list itself is not consumed by any step**, so tagging items there with \`[[m]]\` / \`[[t]]\` produces **isolated nodes for every item**.
   - ✅ Keep the up-front list as plain unmarked bullets.
   - ✅ Place \`[[m]]\` / \`[[t]]\` **inside the procedure that actually uses the item**.
   - The same ingredient appearing in multiple steps should be tagged with \`[[m]]\` in each procedure (duplication is correct).
3. **Every procedure must contain at least one \`[[m]]\` or \`[[o]]\` span.** A procedure with no input and no output produces no edges.
4. **Chain steps via shared text.** When step N's output is consumed by step N+1, write it as \`[[o]]X[[/o]]\` in step N and \`[[m]]X[[/m]]\` in step N+1 with the **same wording** so a reader can trace the chain.
5. **Naming intermediate products.** Use "<past-participle> sample" or a phrase that includes the physical form (e.g. "crushed sample", "sealed sample", "calcined powder", "sliced onion"). Keeps labels consistent across steps.

### Anti-patterns
- ❌ Putting \`[[label:procedure]]\` on a numbered list item (only H2 becomes an Activity)
- ❌ Putting legacy \`[[label:material]]\` etc at block start (block-level inline labels are deprecated)
- ❌ Span markers crossing block boundaries
- ❌ Mismatched open/close (e.g. \`[[m]]...[[/t]]\`)
- ❌ Spans in \`# Title\` / \`## Overview\` / \`## Background\` (creates isolated nodes)
- ❌ A procedure with no input and no output
- ❌ Tagging items inside an up-front \`## Ingredients\` / \`## Materials\` list with \`[[m]]\` / \`[[t]]\` (the list isn't consumed by any step → isolated nodes; keep it as plain unmarked bullets)

Rules: block-level only at start of H2, at most one per block, types limited to \`procedure / plan / result\`. Inline spans must come in matching pairs, stay within one block, sit inside a procedure section, types limited to \`m / t / a / o\`.
`;
}
