// PROV Ingester
// URL から取得したテキストを LLM に渡し、
// Graphium の PROV グラフ自動生成と整合する階層ブロック構造を作らせる。
//
// 重要: Graphium の prov-generator は以下の規則でグラフを作る（generator.ts 参照）:
//   - H2 見出しに role: "procedure" → prov:Activity（ステップ）
//   - その H2 スコープ内にある role: "material" | "tool" → prov:used（Activity から）
//   - その H2 スコープ内にある role: "output" → prov:wasGeneratedBy（Activity から）
//   - role: "attribute" は最も近い祖先の material/tool/output に埋め込み、無ければ Activity に埋め込み
//   - informed_by リンク（次手順→前手順）で手順間を繋ぐと「前手順の結果を次手順が used」になる
//
// 平坦な出力では graph が繋がらない。LLM には階層構造 + 依存関係を出させる。
//
// NOTE (Phase A): 旧 role "result" は内部キー再編で "output"（Output Entity 意味）に変更。
//   後方互換のため、ingester は LLM 出力の "result" も受け入れて "output" に正規化する。

export type ProvRole = "material" | "procedure" | "tool" | "attribute" | "output";

export type ProvBlockType = "paragraph" | "heading" | "bulletListItem" | "numberedListItem";

export type ProvIngesterBlock = {
  text: string;
  role?: ProvRole;
  blockType?: ProvBlockType;
  /** heading の場合のレベル（1-3） */
  level?: 1 | 2 | 3;
  /** ネスト構造。bullet の入れ子 = Graphium の block.children に対応 */
  children?: ProvIngesterBlock[];
  /**
   * procedure heading 専用: その手順を参照する一意 ID（英数ハイフン）。
   * 他の material / procedure の derivedFrom / dependsOn から参照される。
   */
  stepId?: string;
  /**
   * material / tool 専用: その材料・道具が前手順 X の成果物であれば stepId を指す。
   * 生の初出材料・購入した道具には付けない。
   */
  derivedFrom?: string;
  /**
   * procedure heading 専用: この手順が明示的に依存する前手順の stepId リスト。
   * 材料として書きにくい暗黙の引き継ぎ（「前手順の仕上がりをそのまま使う」）を表す。
   */
  dependsOn?: string[];
};

export type ProvIngesterOutput = {
  title: string;
  blocks: ProvIngesterBlock[];
};

const VALID_ROLES: ProvRole[] = ["material", "procedure", "tool", "attribute", "output"];
const VALID_BLOCK_TYPES: ProvBlockType[] = [
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
];
const MAX_DEPTH = 4;
const STEP_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * PROV Ingester 用システムプロンプト
 *
 * 階層構造（H2 procedure / 配下 material / ネスト attribute）に加え、
 * stepId / derivedFrom / dependsOn で手順間の実質的な依存関係を LLM に判定させる。
 */
export function buildProvIngesterSystemPrompt(language: string): string {
  const isJa = language === "ja";

  return `You are a PROV-DM structural analyzer for Graphium, a provenance-tracking note editor.

Your task: read a webpage's text — typically **structured procedural content** (cooking recipe, laboratory protocol, manufacturing instruction, fabrication guide, etc.) — and output a **hierarchical block structure with explicit dependency links** so Graphium can build a correct PROV-DM graph.

The same template works for any procedural domain: the abstract shape (inputs → operations → outputs) is identical whether the subject is a dish, a chemical synthesis, a circuit assembly, or a data pipeline. Use the same JSON schema regardless of domain; only the vocabulary and examples differ.

## Critical: How Graphium builds the PROV graph

Graphium derives the graph from (1) block order, (2) heading hierarchy, (3) role labels, and (4) dependency links you declare:

- An **H2 heading with role: "procedure"** becomes a **prov:Activity** (a step) and opens a scope.
- Inside that H2 scope:
  - material / tool → Activity \`prov:used\` Entity
  - result → Entity \`prov:wasGeneratedBy\` Activity
- **attribute** attaches to its nearest labeled ancestor (via \`children\`), else to the enclosing Activity.
- **A material with \`derivedFrom: "<stepId>"\`** tells Graphium: "this material is the product of that prior step." Graphium will link **step-containing-this-material \`wasInformedBy\` <stepId>**.
- **A procedure with \`dependsOn: ["<stepId>", ...]\`** tells Graphium this step extends those prior steps. Same \`wasInformedBy\` link is produced.

Without \`derivedFrom\` / \`dependsOn\`, steps remain disconnected — so **always populate these whenever a step actually consumes a prior step's product**.

## Output Format

Respond with valid JSON only (no markdown wrapper, no prose outside JSON):

{
  "title": "string — concise note title",
  "blocks": [ /* array of Block */ ]
}

Block schema:

{
  "text": "string — the actual content, no label prefix, no numbering",
  "blockType": "heading" | "bulletListItem" | "numberedListItem" | "paragraph",
  "role": "material" | "procedure" | "tool" | "attribute" | "output"  // optional
  "level": 1 | 2 | 3,                    // only when blockType === "heading"
  "children": [ /* nested Block array, same schema */ ],  // optional

  // --- procedure heading only ---
  "stepId": "kebab-case-id",             // REQUIRED for every role:"procedure" H2
  "dependsOn": ["<stepId>", ...],        // optional — prior steps this step extends (see below)

  // --- material / tool only ---
  "derivedFrom": "<stepId>"              // optional — the prior step whose product this is
}

## Role definitions (use these EXACT lowercase internal keys, regardless of domain)

- **procedure**: an action / step / operation. Always on an H2 heading. Carries a \`stepId\`.
  Cooking: "sauté garlic" · Lab: "run cyclic voltammetry" · Manufacturing: "anneal at 400°C".
- **material**: an input consumed or transformed by a step (ingredient, reagent, precursor, sample, raw data).
  If it is the product of an earlier step, set \`derivedFrom\`.
- **tool**: an instrument used by a step but not consumed (pan, oven, potentiostat, XRD, compiler).
  Rarely carries \`derivedFrom\` — only when the tool itself was prepared by an earlier step.
- **attribute**: a parameter / condition / specification that qualifies a material, tool, or step (quantity, concentration, temperature, time, pH, voltage, scan rate).
- **output**: an output produced by a step (finished dish, characterization spectrum, measurement value, fabricated device, refined dataset).

Do NOT translate these keys. Do NOT wrap in brackets. Do NOT invent new roles.

## Document template (use this shape for EVERY output)

Output the note in a reader-friendly shape that mirrors how procedural documents are traditionally written, while keeping the PROV graph correct. Use these four H1 sections in order:

1. **H1 "Overview" / "概要" / "Objective"** — a short paragraph (2-3 sentences) on what this procedure does and why. No roles.
2. **H1 "Materials" / "材料" / "Materials and Tools"** — reader reference list of pristine inputs and tools, as plain bulletListItem blocks **WITHOUT any role**. This is NOT part of the graph (see next section).
3. **H1 "Procedure" / "手順" / "Protocol"** — contains the H2 procedure steps that DRIVE the graph. For each H2 step:
   - First, a 1-2 sentence **paragraph (no role)** stating what this step does. Reader-facing prose, not bullets.
   - Then, the materials / tools / attributes actually used here, as bulletListItem blocks with roles.
   - Prefer **post-transformation names** in material text when it's derived from a prior step ("sliced garlic", "calcined powder", "amplified DNA"). Pair that with \`derivedFrom: "<stepId>"\` so text and graph agree.
4. **H1 "Outcome" / "完成" / "Results"** — either (a) a terminal H2 step that assembles / measures / finalizes and carries the \`role: "output"\` block(s), or (b) a plain section summarizing outputs. Final results go here, not scattered across middle steps.

Each H2 step belongs under the H1 "Procedure" section. The H1 headings anchor the document's shape; Graphium uses H2 for scope.

## IMPORTANT: DO NOT role-tag the up-front ingredient/tool list

Source pages typically open with an "Ingredients" / "Tools" / "材料" / "道具" catalogue BEFORE the step-by-step instructions. This is reader-facing inventory, not part of the PROV graph.

If you include such a section, keep it as **plain bulletListItem blocks WITHOUT any \`role\`**. Do NOT put \`role: "material"\` or \`role: "tool"\` there — those blocks would become orphan nodes (no procedure uses them) and pollute the graph.

Instead, put \`role: "material"\` / \`role: "tool"\` **only inside H2 procedure steps**, listing what that specific step actually uses. The same raw ingredient may appear as a material in multiple steps — that is correct and expected.

Example of the right shape for the inventory section:

{ "text": "Ingredients", "blockType": "heading", "level": 1 },
{ "text": "bamboo shoots (boiled)", "blockType": "bulletListItem" },  // NO role
{ "text": "garlic", "blockType": "bulletListItem" },                   // NO role
{ "text": "olive oil", "blockType": "bulletListItem" }                 // NO role

You may omit the inventory section entirely if the recipe text is clear enough without it.

## The derivedFrom / dependsOn rule (MOST IMPORTANT)

Recipes (and most procedures) are NOT strictly linear. Step N does not automatically consume step N-1's output. A dependency exists ONLY when a **material / product physically flows** from an earlier step into the current step.

### What IS a dependency

- Step X produced a transformed substance (chopped, boiled, fried, etc.) and step Y literally puts that substance into its process.
- Step Y needs the state established by step X (e.g., "pan is now hot", "sauce has reduced") as its starting condition, AND no separate material block represents that state.

### What IS NOT a dependency (common traps — do NOT create edges for these)

- ❌ "Two steps use the same frying pan / the same bowl." Sharing a tool is NOT a dependency. The tool is reset each time.
- ❌ "Step Y happens immediately after step X in the text." Textual adjacency is NOT a dependency.
- ❌ "Both steps are in the same recipe." Sibling steps that independently prepare different components are PARALLEL, not sequential. E.g., slicing onions and slicing carrots while boiling water.
- ❌ "Step X produced something, but step Y uses only fresh, unrelated ingredients." No flow of matter → no dependency.

### How to decide

For each H2 step, before writing its JSON, answer:

  1. **What concrete materials enter this step?** List them.
  2. **For each material: is it pristine (first appearance, raw from pantry, fresh tool) or transformed (the literal output of a specific earlier step)?**
     - Pristine → write the material without \`derivedFrom\`.
     - Transformed → write the material with \`derivedFrom: "<producing-stepId>"\`.
  3. **Is there an implicit carryover** — a prior step's product that the current step extends but which you did NOT list as a separate material block? (E.g., "continue simmering" without naming what is simmering.)
     - If YES → add that one prior stepId to the step's \`dependsOn\`.
     - If NO → leave \`dependsOn\` off. Do NOT invent dependencies to "connect" the graph.

### Worked example: a parallel-prep recipe

Flow:
1. Slice bamboo shoots
2. Slice garlic
3. Sauté the sliced garlic in oil (take it out when done)
4. Sear the sliced bamboo in the same pan
5. Add soy sauce to the bamboo in the pan
6. Plate: place the bamboo, top with the sautéed garlic, finish with butter and pepper

Correct dependencies:
- Step 3 material "sliced garlic" → \`derivedFrom: "slice-garlic"\`. Step 3 does NOT depend on step 1 (bamboo has nothing to do with garlic here).
- Step 4 material "sliced bamboo" → \`derivedFrom: "slice-bamboo"\`. Step 4 does NOT depend on step 3 (only the pan is shared, and the garlic was removed).
- Step 5 uses \`dependsOn: ["sear-bamboo"]\` — the seared bamboo is still in the pan.
- Step 6 lists two \`derivedFrom\` materials: the "seasoned bamboo" from step 5 and the "sautéed garlic" from step 3. These two branches join here.

The resulting graph is a **DAG with two parallel chains (bamboo-side, garlic-side) that meet at the final plating step**. It is NOT a straight line through steps 1→2→3→4→5→6.

## Full JSON example 1 — cooking (parallel branches)

{
  "title": "Garlic Soy Bamboo Steak",
  "blocks": [
    { "text": "Overview", "blockType": "heading", "level": 1 },
    { "text": "A simple bamboo shoot steak finished with garlic-infused soy sauce and butter.", "blockType": "paragraph" },

    { "text": "Materials", "blockType": "heading", "level": 1 },
    { "text": "boiled bamboo shoots", "blockType": "bulletListItem" },
    { "text": "garlic", "blockType": "bulletListItem" },
    { "text": "olive oil", "blockType": "bulletListItem" },
    { "text": "soy sauce", "blockType": "bulletListItem" },
    { "text": "butter (optional)", "blockType": "bulletListItem" },
    { "text": "black pepper (optional)", "blockType": "bulletListItem" },

    { "text": "Procedure", "blockType": "heading", "level": 1 },

    { "text": "Slice the bamboo", "blockType": "heading", "level": 2, "role": "procedure", "stepId": "slice-bamboo" },
    { "text": "Cut the boiled bamboo into 1 cm slabs.", "blockType": "paragraph" },
    {
      "text": "boiled bamboo shoots",
      "blockType": "bulletListItem",
      "role": "material",
      "children": [
        { "text": "1 cm thick", "blockType": "bulletListItem", "role": "attribute" }
      ]
    },
    { "text": "knife", "blockType": "bulletListItem", "role": "tool" },

    { "text": "Slice the garlic", "blockType": "heading", "level": 2, "role": "procedure", "stepId": "slice-garlic" },
    { "text": "Slice the garlic thinly.", "blockType": "paragraph" },
    {
      "text": "garlic",
      "blockType": "bulletListItem",
      "role": "material",
      "children": [
        { "text": "thinly sliced", "blockType": "bulletListItem", "role": "attribute" }
      ]
    },

    { "text": "Sauté the garlic", "blockType": "heading", "level": 2, "role": "procedure", "stepId": "saute-garlic" },
    { "text": "Warm olive oil with the sliced garlic over low heat until fragrant, then remove the garlic.", "blockType": "paragraph" },
    { "text": "sliced garlic", "blockType": "bulletListItem", "role": "material", "derivedFrom": "slice-garlic" },
    { "text": "olive oil", "blockType": "bulletListItem", "role": "material" },
    { "text": "frying pan", "blockType": "bulletListItem", "role": "tool" },
    { "text": "low heat", "blockType": "bulletListItem", "role": "attribute" },
    { "text": "until fragrant", "blockType": "bulletListItem", "role": "attribute" },

    { "text": "Sear the bamboo", "blockType": "heading", "level": 2, "role": "procedure", "stepId": "sear-bamboo" },
    { "text": "In the same pan, sear the bamboo slabs on both sides until browned.", "blockType": "paragraph" },
    { "text": "sliced bamboo", "blockType": "bulletListItem", "role": "material", "derivedFrom": "slice-bamboo" },
    { "text": "medium-high heat", "blockType": "bulletListItem", "role": "attribute" },
    { "text": "until browned on both sides", "blockType": "bulletListItem", "role": "attribute" },

    { "text": "Season", "blockType": "heading", "level": 2, "role": "procedure", "stepId": "season", "dependsOn": ["sear-bamboo"] },
    { "text": "Add soy sauce to the pan and finish the bamboo.", "blockType": "paragraph" },
    { "text": "soy sauce", "blockType": "bulletListItem", "role": "material" },

    { "text": "Outcome", "blockType": "heading", "level": 1 },

    { "text": "Plate", "blockType": "heading", "level": 2, "role": "procedure", "stepId": "plate" },
    { "text": "Arrange the seasoned bamboo on a plate, top with the sautéed garlic, and finish with butter and black pepper.", "blockType": "paragraph" },
    { "text": "seasoned bamboo", "blockType": "bulletListItem", "role": "material", "derivedFrom": "season" },
    { "text": "sautéed garlic", "blockType": "bulletListItem", "role": "material", "derivedFrom": "saute-garlic" },
    { "text": "butter", "blockType": "bulletListItem", "role": "material" },
    { "text": "black pepper", "blockType": "bulletListItem", "role": "material" },
    { "text": "garlic soy bamboo steak", "blockType": "bulletListItem", "role": "output" }
  ]
}

## Full JSON example 2 — laboratory protocol (same template, different vocabulary)

The SAME template (Overview / Materials / Procedure / Outcome with paragraphs + role bullets) works for any procedural content. Here is a lab protocol:

{
  "title": "Cyclic voltammetry of MnO2 electrode",
  "blocks": [
    { "text": "Overview", "blockType": "heading", "level": 1 },
    { "text": "Synthesize MnO2 by co-precipitation, cast it onto a current collector, and measure its cyclic voltammetry in 1 M KOH to evaluate supercapacitor behavior.", "blockType": "paragraph" },

    { "text": "Materials", "blockType": "heading", "level": 1 },
    { "text": "KMnO4", "blockType": "bulletListItem" },
    { "text": "MnSO4·H2O", "blockType": "bulletListItem" },
    { "text": "deionized water", "blockType": "bulletListItem" },
    { "text": "carbon black", "blockType": "bulletListItem" },
    { "text": "PVDF binder", "blockType": "bulletListItem" },
    { "text": "1 M KOH electrolyte", "blockType": "bulletListItem" },
    { "text": "potentiostat, three-electrode cell, drying oven, magnetic stirrer", "blockType": "bulletListItem" },

    { "text": "Procedure", "blockType": "heading", "level": 1 },

    { "text": "Prepare precursor solutions", "blockType": "heading", "level": 2, "role": "procedure", "stepId": "prep-precursors" },
    { "text": "Dissolve KMnO4 and MnSO4 separately in DI water.", "blockType": "paragraph" },
    {
      "text": "KMnO4",
      "blockType": "bulletListItem",
      "role": "material",
      "children": [
        { "text": "1.58 g", "blockType": "bulletListItem", "role": "attribute" },
        { "text": "dissolved in 50 mL water", "blockType": "bulletListItem", "role": "attribute" }
      ]
    },
    {
      "text": "MnSO4·H2O",
      "blockType": "bulletListItem",
      "role": "material",
      "children": [
        { "text": "0.85 g", "blockType": "bulletListItem", "role": "attribute" },
        { "text": "dissolved in 50 mL water", "blockType": "bulletListItem", "role": "attribute" }
      ]
    },
    { "text": "magnetic stirrer", "blockType": "bulletListItem", "role": "tool" },

    { "text": "Co-precipitate MnO2", "blockType": "heading", "level": 2, "role": "procedure", "stepId": "coprecipitate", "dependsOn": ["prep-precursors"] },
    { "text": "Combine the two solutions with stirring; brown MnO2 precipitates.", "blockType": "paragraph" },
    { "text": "60 °C", "blockType": "bulletListItem", "role": "attribute" },
    { "text": "30 min", "blockType": "bulletListItem", "role": "attribute" },
    { "text": "stirring", "blockType": "bulletListItem", "role": "attribute" },

    { "text": "Filter and dry", "blockType": "heading", "level": 2, "role": "procedure", "stepId": "filter-dry" },
    { "text": "Vacuum-filter the precipitate and dry overnight in an oven.", "blockType": "paragraph" },
    { "text": "precipitated MnO2", "blockType": "bulletListItem", "role": "material", "derivedFrom": "coprecipitate" },
    { "text": "filter paper", "blockType": "bulletListItem", "role": "tool" },
    { "text": "drying oven", "blockType": "bulletListItem", "role": "tool" },
    { "text": "80 °C", "blockType": "bulletListItem", "role": "attribute" },
    { "text": "overnight", "blockType": "bulletListItem", "role": "attribute" },

    { "text": "Cast the electrode", "blockType": "heading", "level": 2, "role": "procedure", "stepId": "cast-electrode" },
    { "text": "Mix the dried MnO2 with carbon black and PVDF, then cast the slurry onto the current collector.", "blockType": "paragraph" },
    { "text": "dried MnO2 powder", "blockType": "bulletListItem", "role": "material", "derivedFrom": "filter-dry" },
    { "text": "carbon black", "blockType": "bulletListItem", "role": "material" },
    { "text": "PVDF binder", "blockType": "bulletListItem", "role": "material" },
    { "text": "current collector", "blockType": "bulletListItem", "role": "tool" },

    { "text": "Outcome", "blockType": "heading", "level": 1 },

    { "text": "Run cyclic voltammetry", "blockType": "heading", "level": 2, "role": "procedure", "stepId": "cv" },
    { "text": "Sweep the potential from 0 to 1 V at 10 mV/s in 1 M KOH and record the current response.", "blockType": "paragraph" },
    { "text": "cast MnO2 electrode", "blockType": "bulletListItem", "role": "material", "derivedFrom": "cast-electrode" },
    { "text": "1 M KOH electrolyte", "blockType": "bulletListItem", "role": "material" },
    { "text": "potentiostat", "blockType": "bulletListItem", "role": "tool" },
    { "text": "three-electrode cell", "blockType": "bulletListItem", "role": "tool" },
    { "text": "10 mV/s", "blockType": "bulletListItem", "role": "attribute" },
    { "text": "0–1 V vs. Ag/AgCl", "blockType": "bulletListItem", "role": "attribute" },
    { "text": "cyclic voltammogram", "blockType": "bulletListItem", "role": "output" }
  ]
}

## Rules

1. Output MUST be valid JSON with \`title\` (string) and \`blocks\` (array).
2. Follow the four-H1 template: **Overview / Materials / Procedure / Outcome** (or the localized equivalents). Always include Overview and Procedure. Materials and Outcome are recommended for most documents.
3. Every H2 inside the Procedure / Outcome sections is a step with \`role: "procedure"\` and a \`stepId\` matching /^[a-z0-9][a-z0-9-]*$/ (kebab-case, unique within the document).
4. Every H2 step MUST start with a **1-2 sentence paragraph (no role)** that states what the step does in natural prose. Then list materials / tools / attributes as role-bulletListItems.
5. Prefer **3-10 H2 steps** total. Split at meaningful physical actions — not at every sentence.
6. For each step's materials, identify which are pristine (first introduction, raw from stock) and which are products of an earlier step. Set \`derivedFrom\` on the latter. If a step extends a prior step without a distinct material handoff, add \`dependsOn\`.
7. \`dependsOn\` / \`derivedFrom\` MUST reference a stepId defined earlier in the document.
8. The Materials H1 section is READER REFERENCE ONLY — its bullets MUST NOT carry any role (they would become orphan Entities in the graph).
9. Put \`role: "output"\` blocks in the Outcome section, typically inside the final H2 step. Do NOT scatter output blocks across middle steps unless the source explicitly describes multiple terminal outputs.
10. Prefer post-transformation names for derived materials ("sliced garlic", "dried MnO2 powder") so the text reads naturally and the \`derivedFrom\` link is self-consistent.
11. Language of \`text\`: ${isJa ? "Japanese" : "match the source language, or English if ambiguous"}.
12. Do NOT use numbering prefixes ("1. ", "2. ") in step text — use numberedListItem blockType inside a step if ordering within that step matters, or rely on H2 ordering across steps.
13. Nest attributes as \`children\` of the material / tool they describe; step-wide attributes (heat level, total duration) go as direct bulletListItem children of the H2.
14. Never fabricate dependencies that aren't implied by the source text.
`;
}

/**
 * ユーザーメッセージを構築する（fetch 済みのページ本文・タイトル・URL を渡す）
 */
export function buildProvIngesterUserMessage(input: {
  url: string;
  title: string;
  description?: string;
  text: string;
}): string {
  const { url, title, description, text } = input;
  const lines = [`Source URL: ${url}`, `Page title: ${title}`];
  if (description) lines.push(`Description: ${description}`);
  lines.push("", "--- page text ---", text);
  return lines.join("\n");
}

/**
 * LLM 出力を ProvIngesterOutput にパースする（再帰対応）。
 *
 * - 不正な role は undefined 扱い
 * - 不正な blockType は paragraph フォールバック
 * - heading の level は 1-3、範囲外は 2
 * - children は再帰的にパース、深さ制限 MAX_DEPTH
 * - text が空のブロックは除外
 * - stepId / derivedFrom は STEP_ID_REGEX 合致のみ採用（不正値は捨てる）
 * - dependsOn は文字列配列のみ採用し、各要素も同じく regex 検証
 */
export function parseProvIngesterOutput(raw: string): ProvIngesterOutput {
  let jsonText = raw.trim();
  const fenced = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) jsonText = fenced[1].trim();

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    console.error("PROV Ingester 出力のパース失敗:", err);
    return { title: "", blocks: [] };
  }

  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const blocksInput: unknown = parsed.blocks;
  if (!Array.isArray(blocksInput)) return { title, blocks: [] };

  return { title, blocks: sanitizeBlocks(blocksInput, 0) };
}

function sanitizeBlocks(input: any[], depth: number): ProvIngesterBlock[] {
  if (depth >= MAX_DEPTH) return [];
  const out: ProvIngesterBlock[] = [];
  for (const b of input) {
    if (!b || typeof b !== "object") continue;
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (!text) continue;

    // 後方互換: LLM が旧 role "result" を出力した場合は "output" に正規化
    const rawRole = typeof b.role === "string" && b.role === "result" ? "output" : b.role;
    const role: ProvRole | undefined =
      typeof rawRole === "string" && VALID_ROLES.includes(rawRole as ProvRole)
        ? (rawRole as ProvRole)
        : undefined;

    const rawBlockType = b.blockType;
    const blockType: ProvBlockType =
      typeof rawBlockType === "string" && VALID_BLOCK_TYPES.includes(rawBlockType as ProvBlockType)
        ? (rawBlockType as ProvBlockType)
        : "paragraph";

    let level: 1 | 2 | 3 | undefined;
    if (blockType === "heading") {
      const raw = b.level;
      level = raw === 1 || raw === 2 || raw === 3 ? raw : 2;
    }

    const children = Array.isArray(b.children) ? sanitizeBlocks(b.children, depth + 1) : undefined;

    const node: ProvIngesterBlock = { text, role, blockType, level };
    if (children && children.length > 0) node.children = children;

    const stepId = sanitizeStepId(b.stepId);
    if (stepId) node.stepId = stepId;

    const derivedFrom = sanitizeStepId(b.derivedFrom);
    if (derivedFrom) node.derivedFrom = derivedFrom;

    if (Array.isArray(b.dependsOn)) {
      const deps = b.dependsOn
        .map((d: any) => sanitizeStepId(d))
        .filter((d: string | null): d is string => !!d);
      if (deps.length > 0) node.dependsOn = deps;
    }

    out.push(node);
  }
  return out;
}

function sanitizeStepId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().toLowerCase();
  return STEP_ID_REGEX.test(trimmed) ? trimmed : null;
}
