import { describe, expect, it } from "vitest";
import { extractLabelMarkersFromBlocks, buildLabeledOutputInstruction } from "./label-markers";

const tBlock = (text: string, type = "paragraph", extra: Record<string, unknown> = {}) => ({
  type,
  content: [{ type: "text", text, styles: {} }],
  children: [] as any[],
  ...extra,
});

describe("extractLabelMarkersFromBlocks", () => {
  it("先頭マーカーを剥がしてラベルを返す", () => {
    const blocks = [
      tBlock("[[label:procedure]] 試料 A と B を混合"),
      tBlock("[[label:material]] 試料 A"),
      tBlock("普通の段落"),
      tBlock("[[label:result]] 単相結晶相", "bulletListItem"),
    ];
    const { blocks: out, labels } = extractLabelMarkersFromBlocks(blocks);
    expect(labels).toEqual([
      { path: [0], label: "procedure" },
      { path: [1], label: "material" },
      { path: [3], label: "output" },
    ]);
    expect(out[0].content[0].text).toBe("試料 A と B を混合");
    expect(out[1].content[0].text).toBe("試料 A");
    expect(out[2].content[0].text).toBe("普通の段落");
    expect(out[3].content[0].text).toBe("単相結晶相");
  });

  it("未知のラベル名は剥がさない", () => {
    const blocks = [tBlock("[[label:unknown]] hello")];
    const { blocks: out, labels } = extractLabelMarkersFromBlocks(blocks);
    expect(labels).toEqual([]);
    expect(out[0].content[0].text).toBe("[[label:unknown]] hello");
  });

  it("行頭以外のマーカーは無視する", () => {
    const blocks = [tBlock("foo [[label:procedure]] bar")];
    const { labels } = extractLabelMarkersFromBlocks(blocks);
    expect(labels).toEqual([]);
  });

  it("children を再帰的に走査する", () => {
    const blocks = [
      {
        ...tBlock("親"),
        children: [tBlock("[[label:tool]] 電気炉"), tBlock("[[label:attribute]] 80℃")],
      },
    ];
    const { labels } = extractLabelMarkersFromBlocks(blocks);
    expect(labels).toEqual([
      { path: [0, 0], label: "tool" },
      { path: [0, 1], label: "attribute" },
    ]);
  });

  it("先頭テキストが空になったら inline 要素を取り除く", () => {
    const blocks = [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "[[label:procedure]] ", styles: {} },
          { type: "text", text: "後続テキスト", styles: { bold: true } },
        ],
        children: [],
      },
    ];
    const { blocks: out } = extractLabelMarkersFromBlocks(blocks);
    expect(out[0].content).toHaveLength(1);
    expect(out[0].content[0].text).toBe("後続テキスト");
  });

  it("元の blocks を破壊しない", () => {
    const blocks = [tBlock("[[label:result]] 結果")];
    const original = JSON.stringify(blocks);
    extractLabelMarkersFromBlocks(blocks);
    expect(JSON.stringify(blocks)).toBe(original);
  });
});

describe("buildLabeledOutputInstruction", () => {
  it("ja は日本語の指示文を返し H2 ルールを含む", () => {
    const text = buildLabeledOutputInstruction("ja");
    expect(text).toContain("PROV グラフ");
    expect(text).toContain("[[label:procedure]]");
    expect(text).toContain("H2");
  });

  it("en は英語の指示文を返し H2 ルールを含む", () => {
    const text = buildLabeledOutputInstruction("en");
    expect(text).toContain("PROV graph");
    expect(text).toContain("[[label:procedure]]");
    expect(text).toContain("H2");
  });

  it("既知でない言語は en にフォールバックする", () => {
    const text = buildLabeledOutputInstruction("fr");
    expect(text).toContain("PROV graph");
  });

  // Phase E: インライン span マーカーをプロンプトで教える
  it("ja でインライン span マーカー [[m]] / [[/o]] を指示する", () => {
    const text = buildLabeledOutputInstruction("ja");
    expect(text).toContain("[[m]]");
    expect(text).toContain("[[/m]]");
    expect(text).toContain("[[t]]");
    expect(text).toContain("[[a]]");
    expect(text).toContain("[[o]]");
  });

  it("en でインライン span マーカーを指示する", () => {
    const text = buildLabeledOutputInstruction("en");
    expect(text).toContain("[[m]]");
    expect(text).toContain("[[t]]");
    expect(text).toContain("[[a]]");
    expect(text).toContain("[[o]]");
  });
});

describe("extractLabelMarkersFromBlocks: インライン span (Phase E)", () => {
  it("[[m]]NaCl[[/m]] を inlineMaterial style に変換する", () => {
    const blocks = [
      tBlock(""),
      // 別のブロックに対象のテキスト
      {
        type: "paragraph",
        content: [{ type: "text", text: "[[m]]NaCl[[/m]] を使う", styles: {} }],
        children: [],
      },
    ];
    const { blocks: out } = extractLabelMarkersFromBlocks(blocks);
    const segs = out[1].content;
    expect(segs).toHaveLength(2);
    expect(segs[0].text).toBe("NaCl");
    expect(segs[0].styles.inlineMaterial).toMatch(/^ent_material_/);
    expect(segs[1].text).toBe(" を使う");
    expect(segs[1].styles.inlineMaterial).toBeUndefined();
  });

  it("複数の span を含むテキストを正しく分割する", () => {
    const blocks = [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "[[m]]NaCl[[/m]] を [[t]]ピペット[[/t]] で 80°C 投入し [[o]]溶液[[/o]] を得る",
            styles: { bold: true },
          },
        ],
        children: [],
      },
    ];
    const { blocks: out } = extractLabelMarkersFromBlocks(blocks);
    const segs = out[0].content;
    // span 3 つ + 間に挟まる平文 3 つで合計 6 セグメント
    expect(segs).toHaveLength(6);
    expect(segs[0].text).toBe("NaCl");
    expect(segs[0].styles.inlineMaterial).toMatch(/^ent_material_/);
    expect(segs[0].styles.bold).toBe(true);
    expect(segs[1].text).toBe(" を ");
    expect(segs[2].text).toBe("ピペット");
    expect(segs[2].styles.inlineTool).toMatch(/^ent_tool_/);
    expect(segs[4].text).toBe("溶液");
    expect(segs[4].styles.inlineOutput).toMatch(/^ent_output_/);
    expect(segs[5].text).toBe(" を得る");
  });

  it("span マーカーが無いテキストはそのまま保持する", () => {
    const blocks = [
      {
        type: "paragraph",
        content: [{ type: "text", text: "普通の文", styles: {} }],
        children: [],
      },
    ];
    const { blocks: out } = extractLabelMarkersFromBlocks(blocks);
    expect(out[0].content).toHaveLength(1);
    expect(out[0].content[0].text).toBe("普通の文");
    expect(out[0].content[0].styles.inlineMaterial).toBeUndefined();
  });

  it("ブロックレベル + インライン span の併用", () => {
    const blocks = [
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "[[label:procedure]] [[m]]NaCl[[/m]] 添加", styles: {} }],
        children: [],
      },
    ];
    const { blocks: out, labels } = extractLabelMarkersFromBlocks(blocks);
    expect(labels).toEqual([{ path: [0], label: "procedure" }]);
    const segs = out[0].content;
    // 先頭の "[[label:procedure]] " が剥がれた結果、残りは "[[m]]NaCl[[/m]] 添加"
    // → "NaCl"(material) + " 添加" の 2 セグメント
    expect(segs).toHaveLength(2);
    expect(segs[0].text).toBe("NaCl");
    expect(segs[0].styles.inlineMaterial).toMatch(/^ent_material_/);
    expect(segs[1].text).toBe(" 添加");
  });
});
