import { describe, it, expect } from "vitest";
import { migrateToLatest, LATEST_DOCUMENT_VERSION } from "./document-migration";
import type { GraphiumDocument } from "./document-types";

const baseDoc = (version: number, page: any): GraphiumDocument => ({
  version: version as any,
  title: "test",
  pages: [page],
  createdAt: "2026-01-01T00:00:00Z",
  modifiedAt: "2026-01-01T00:00:00Z",
});

const txt = (text: string) => [{ type: "text", text, styles: {} }];

describe("migrateToLatest", () => {
  it("最終バージョンに到達する", () => {
    const doc = baseDoc(1, { id: "p1", title: "p1", blocks: [], labels: {}, provLinks: [], knowledgeLinks: [] });
    migrateToLatest(doc);
    expect(doc.version).toBe(LATEST_DOCUMENT_VERSION);
  });

  it("v3 → v4: result → output リネーム", () => {
    const doc = baseDoc(3, {
      id: "p1",
      title: "p1",
      blocks: [{ id: "b1", type: "paragraph", content: txt("test"), children: [] }],
      labels: { b1: "result" },
      provLinks: [],
      knowledgeLinks: [],
    });
    migrateToLatest(doc);
    // v4 → v5 で labels から消えて highlights に行く
    expect(doc.pages[0].labels).toEqual({});
    expect(doc.pages[0].highlights).toBeDefined();
    expect(doc.pages[0].highlights).toHaveLength(1);
    expect(doc.pages[0].highlights![0].label).toBe("output");
  });

  it("v4 → v5: block-level inline-type ラベルが whole-block highlight に変換される", () => {
    const doc = baseDoc(4, {
      id: "p1",
      title: "p1",
      blocks: [
        { id: "b_mat", type: "bulletListItem", content: txt("NaCl 5g"), children: [] },
        { id: "b_tool", type: "bulletListItem", content: txt("ホットプレート"), children: [] },
        { id: "b_attr", type: "bulletListItem", content: txt("80°C"), children: [] },
        { id: "b_out", type: "paragraph", content: txt("透明溶液を得た"), children: [] },
      ],
      labels: {
        b_mat: "material",
        b_tool: "tool",
        b_attr: "attribute",
        b_out: "output",
      },
      provLinks: [],
      knowledgeLinks: [],
    });
    migrateToLatest(doc);

    expect(doc.pages[0].labels).toEqual({}); // 全て highlights に移動
    expect(doc.pages[0].highlights).toHaveLength(4);

    const matH = doc.pages[0].highlights!.find((h) => h.blockId === "b_mat")!;
    expect(matH.label).toBe("material");
    expect(matH.from).toBe(0);
    expect(matH.to).toBe("NaCl 5g".length);
    expect(matH.text).toBe("NaCl 5g");

    const outH = doc.pages[0].highlights!.find((h) => h.blockId === "b_out")!;
    expect(outH.label).toBe("output");
    expect(outH.text).toBe("透明溶液を得た");
  });

  it("v4 → v5: heading 系ラベル（procedure/plan/result/free.*）は labels に残る", () => {
    const doc = baseDoc(4, {
      id: "p1",
      title: "p1",
      blocks: [
        { id: "h1", type: "heading", props: { level: 2 }, content: txt("ステップ"), children: [] },
        { id: "h_plan", type: "heading", props: { level: 3 }, content: txt("計画"), children: [] },
        { id: "h_result", type: "heading", props: { level: 3 }, content: txt("結果"), children: [] },
        { id: "p_free", type: "paragraph", content: txt("ここは目的"), children: [] },
      ],
      labels: {
        h1: "procedure",
        h_plan: "plan",
        h_result: "result",
        p_free: "free.purpose",
      },
      provLinks: [],
      knowledgeLinks: [],
    });
    migrateToLatest(doc);
    expect(doc.pages[0].labels).toEqual({
      h1: "procedure",
      h_plan: "plan",
      h_result: "result",
      p_free: "free.purpose",
    });
    expect(doc.pages[0].highlights ?? []).toHaveLength(0);
  });

  it("v4 → v5: 既存 highlights があれば破壊せず append する", () => {
    const doc = baseDoc(4, {
      id: "p1",
      title: "p1",
      blocks: [
        { id: "b_x", type: "paragraph", content: txt("hello"), children: [] },
      ],
      labels: { b_x: "material" },
      highlights: [
        { id: "pre_h", blockId: "b_other", from: 0, to: 3, label: "tool", entityId: "ent_t1", text: "abc" },
      ],
      provLinks: [],
      knowledgeLinks: [],
    } as any);
    migrateToLatest(doc);
    expect(doc.pages[0].highlights).toHaveLength(2);
    expect(doc.pages[0].highlights!.some((h) => h.id === "pre_h")).toBe(true);
    expect(doc.pages[0].highlights!.some((h) => h.blockId === "b_x" && h.label === "material")).toBe(true);
  });

  it("v4 → v5: ネストされた children ブロックも index される", () => {
    const doc = baseDoc(4, {
      id: "p1",
      title: "p1",
      blocks: [
        {
          id: "parent",
          type: "bulletListItem",
          content: txt("親"),
          children: [
            { id: "child", type: "bulletListItem", content: txt("子要素"), children: [] },
          ],
        },
      ],
      labels: { child: "material" },
      provLinks: [],
      knowledgeLinks: [],
    });
    migrateToLatest(doc);
    expect(doc.pages[0].labels).toEqual({});
    expect(doc.pages[0].highlights).toHaveLength(1);
    const h = doc.pages[0].highlights![0];
    expect(h.blockId).toBe("child");
    expect(h.text).toBe("子要素");
    expect(h.to).toBe("子要素".length);
  });

  it("v4 → v5: ブロックが見つからないラベルは label から消すだけ（空 text の highlight 生成）", () => {
    const doc = baseDoc(4, {
      id: "p1",
      title: "p1",
      blocks: [],
      labels: { ghost: "material" },
      provLinks: [],
      knowledgeLinks: [],
    });
    migrateToLatest(doc);
    expect(doc.pages[0].labels).toEqual({});
    // ブロック未存在 → text 空の highlight を 1 件残す（後段クリーンアップ対象）
    expect(doc.pages[0].highlights).toHaveLength(1);
    expect(doc.pages[0].highlights![0].text).toBe("");
    expect(doc.pages[0].highlights![0].to).toBe(0);
  });
});
