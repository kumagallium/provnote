// テンプレート定義
//
// build() の戻り値:
//   blocks: BlockNote ブロックの配列
//   labels: 挿入後にコンテキストラベルを付与する [path, label] のリスト
//   provLinks: 挿入後に PROV リンクを張る [sourcePath → targetPath] のリスト
//
// path: ルートからのインデックス配列（例: [3, 0, 1] = blocks[3].children[0].children[1]）

import type { CoreLabel } from "../context-label/labels";

export type TemplateSource = "official" | "user";

export type TemplateBuildResult = {
  blocks: any[];
  /** 挿入後にコンテキストラベルを付与するブロック */
  labels: { path: number[]; label: CoreLabel }[];
  /** 挿入後に張る PROV リンク（前手順紐付けなど） */
  provLinks?: {
    sourcePath: number[];
    targetPath: number[];
    type: "informed_by";
  }[];
};

export type TemplateDef = {
  id: string;
  source: TemplateSource;
  titleKey: string;
  descKey: string;
  /** 検索・カテゴリ表示用のタグキー */
  tagKeys?: string[];
  /** テンプレート適用後にカーソルを置くブロックのパス */
  focusPath: number[];
  build: (t: (key: string) => string) => TemplateBuildResult;
};

// ── 計画テンプレート ─────────────────────────────────────────
//
// # （計画タイトル）
// ## 背景・目的         (paragraph)
// ## 試料と条件         (index table: サンプル名 / 組成 / 温度 / 時間 / 実験ノート)
// ## 予想される結果      (paragraph)
//
const planTemplate: TemplateDef = {
  id: "plan",
  source: "official",
  titleKey: "template.plan.title",
  descKey: "template.plan.desc",
  tagKeys: ["template.tag.plan", "template.tag.indexTable"],
  focusPath: [0],
  build: (t) => ({
    blocks: [
      // [0] H1 計画タイトル
      {
        type: "heading",
        props: { level: 1 },
        content: [{ type: "text", text: t("template.plan.h1Placeholder"), styles: {} }],
        children: [],
      },
      // [1] H2 背景・目的
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: t("template.plan.backgroundHeading"), styles: {} }],
        children: [],
      },
      // [2] paragraph 動機
      {
        type: "paragraph",
        content: [{ type: "text", text: "", styles: {} }],
        children: [],
      },
      // [3] H2 試料と条件
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: t("template.plan.samplesHeading"), styles: {} }],
        children: [],
      },
      // [4] インデックステーブル: 対象（=ノート名） / 種類 / 条件1 / 条件2
      // ※ 1列目のテキストがノート名になり、行頭ボタンで @ リンクに変換される
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            {
              cells: [
                [{ type: "text", text: t("template.plan.colSampleName"), styles: {} }],
                [{ type: "text", text: t("template.plan.colComposition"), styles: {} }],
                [{ type: "text", text: t("template.plan.colTemperature"), styles: {} }],
                [{ type: "text", text: t("template.plan.colDuration"), styles: {} }],
              ],
            },
            {
              cells: [
                [{ type: "text", text: "S-01", styles: {} }],
                [{ type: "text", text: "", styles: {} }],
                [{ type: "text", text: "", styles: {} }],
                [{ type: "text", text: "", styles: {} }],
              ],
            },
            {
              cells: [
                [{ type: "text", text: "S-02", styles: {} }],
                [{ type: "text", text: "", styles: {} }],
                [{ type: "text", text: "", styles: {} }],
                [{ type: "text", text: "", styles: {} }],
              ],
            },
          ],
        },
      },
      // [5] H2 予想される結果
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: t("template.plan.hypothesisHeading"), styles: {} }],
        children: [],
      },
      // [6] paragraph 仮説
      {
        type: "paragraph",
        content: [{ type: "text", text: "", styles: {} }],
        children: [],
      },
    ],
    labels: [],
  }),
};

// ── 実験テンプレート ─────────────────────────────────────────
//
// # （試料名: S-01 など）
// ## Overview              (paragraph)
// ## Procedure
//   ### 手順1               (procedure, stepId=step-1)
//     #### 計画              (no role)
//       - material
//       - tool
//       - attribute
//     #### 結果・考察         (no role)
//       - result
//   ### 手順2               (procedure, stepId=step-2, informed_by step-1)
//     #### 計画              (no role)
//       - material
//       - tool
//       - attribute
//     #### 結果・考察         (no role)
//       - result
//
// 注: BlockNote のデフォルト heading は level 1-3 のみサポート。
//     #### 計画 / 結果・考察 は level 3 で代用し、視覚階層は太字 paragraph で補う。
//     procedure scope は level 2 を使う（prov-generator の仕様）。
const experimentTemplate: TemplateDef = {
  id: "experiment",
  source: "official",
  titleKey: "template.experiment.title",
  descKey: "template.experiment.desc",
  tagKeys: ["template.tag.run", "template.tag.prov"],
  focusPath: [0],
  build: (t) => {
    // Step 1 / Step 2 を生成するヘルパー
    const buildStep = (stepLabel: string) => [
      // [0] H2 手順 (procedure, stepId)
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: stepLabel, styles: {} }],
        children: [],
      },
      // [1] H3 計画
      {
        type: "heading",
        props: { level: 3 },
        content: [{ type: "text", text: t("template.experiment.planHeading"), styles: {} }],
        children: [],
      },
      // [2] bullet material
      {
        type: "bulletListItem",
        content: [{ type: "text", text: t("template.experiment.materialPlaceholder"), styles: {} }],
        children: [],
      },
      // [3] bullet tool
      {
        type: "bulletListItem",
        content: [{ type: "text", text: t("template.experiment.toolPlaceholder"), styles: {} }],
        children: [],
      },
      // [4] bullet attribute
      {
        type: "bulletListItem",
        content: [{ type: "text", text: t("template.experiment.attributePlaceholder"), styles: {} }],
        children: [],
      },
      // [5] H3 結果・考察
      {
        type: "heading",
        props: { level: 3 },
        content: [{ type: "text", text: t("template.experiment.resultHeading"), styles: {} }],
        children: [],
      },
      // [6] bullet result
      {
        type: "bulletListItem",
        content: [{ type: "text", text: t("template.experiment.resultPlaceholder"), styles: {} }],
        children: [],
      },
    ];

    // フラット展開: 各ステップは 7 ブロック
    // [0] H1 試料名
    // [1] H2 Overview
    // [2] paragraph (overview body)
    // [3..9]   step 1 (7 blocks)
    // [10..16] step 2 (7 blocks)
    const step1 = buildStep(t("template.experiment.step1"));
    const step2 = buildStep(t("template.experiment.step2"));

    return {
      blocks: [
        // [0] H1 タイトル（試料名プレースホルダ）
        {
          type: "heading",
          props: { level: 1 },
          content: [{ type: "text", text: t("template.experiment.h1Placeholder"), styles: {} }],
          children: [],
        },
        // [1] H2 Overview
        {
          type: "heading",
          props: { level: 2 },
          content: [{ type: "text", text: t("template.experiment.overviewHeading"), styles: {} }],
          children: [],
        },
        // [2] paragraph overview 本文
        {
          type: "paragraph",
          content: [{ type: "text", text: t("template.experiment.overviewPlaceholder"), styles: {} }],
          children: [],
        },
        ...step1,
        ...step2,
      ],
      labels: [
        // step 1
        { path: [3], label: "procedure" },
        { path: [5], label: "material" },
        { path: [6], label: "tool" },
        { path: [7], label: "attribute" },
        { path: [9], label: "output" },
        // step 2
        { path: [10], label: "procedure" },
        { path: [12], label: "material" },
        { path: [13], label: "tool" },
        { path: [14], label: "attribute" },
        { path: [16], label: "output" },
      ],
      provLinks: [
        // step 2 → step 1 (前手順リンク)
        { sourcePath: [10], targetPath: [3], type: "informed_by" },
      ],
    };
  },
};

// ── 公式テンプレート登録 ──
const OFFICIAL_TEMPLATES: TemplateDef[] = [planTemplate, experimentTemplate];

// ユーザー定義テンプレート（将来拡張ポイント）
let _userTemplates: TemplateDef[] = [];

export function registerUserTemplate(tmpl: TemplateDef) {
  _userTemplates = [..._userTemplates.filter((t) => t.id !== tmpl.id), tmpl];
}

export function getAllTemplates(): TemplateDef[] {
  return [...OFFICIAL_TEMPLATES, ..._userTemplates];
}
