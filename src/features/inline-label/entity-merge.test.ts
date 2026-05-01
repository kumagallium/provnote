import { describe, it, expect } from "vitest";
import {
  collectHighlights,
  buildMergeCandidates,
  mergeEntityIds,
} from "./entity-merge";

function makeBlock(id: string, content: any[]) {
  return { id, content, children: [] };
}

const sampleDoc = () => [
  makeBlock("b1", [
    {
      type: "text",
      text: "NaCl",
      styles: { inlineMaterial: "ent_material_aaa" },
    },
    { type: "text", text: " 5g", styles: {} },
  ]),
  makeBlock("b2", [
    {
      type: "text",
      text: "NaCl",
      styles: { inlineMaterial: "ent_material_bbb" },
    },
  ]),
  makeBlock("b3", [
    {
      type: "text",
      text: "balance",
      styles: { inlineTool: "ent_tool_xyz" },
    },
  ]),
];

describe("collectHighlights", () => {
  it("flattens all inline highlights with block id, label, entityId, text", () => {
    const all = collectHighlights(sampleDoc());
    expect(all).toHaveLength(3);
    expect(all[0]).toMatchObject({
      blockId: "b1",
      label: "material",
      entityId: "ent_material_aaa",
      text: "NaCl",
    });
    expect(all[2].label).toBe("tool");
  });

  it("recurses into link content and children", () => {
    const blocks = [
      makeBlock("p", [
        {
          type: "link",
          href: "x",
          content: [
            { type: "text", text: "salt", styles: { inlineMaterial: "ent_material_zzz" } },
          ],
        },
      ]),
    ];
    (blocks[0] as any).children = [
      makeBlock("c1", [
        { type: "text", text: "child", styles: { inlineOutput: "ent_output_q" } },
      ]),
    ];
    const all = collectHighlights(blocks);
    expect(all.map((h) => h.entityId).sort()).toEqual([
      "ent_material_zzz",
      "ent_output_q",
    ]);
  });
});

describe("buildMergeCandidates", () => {
  it("excludes self entityId and other labels", () => {
    const cands = buildMergeCandidates(sampleDoc(), "material", "ent_material_aaa");
    expect(cands).toHaveLength(1);
    expect(cands[0].entityId).toBe("ent_material_bbb");
    expect(cands[0].texts).toEqual(["NaCl"]);
    expect(cands[0].blockCount).toBe(1);
  });

  it("returns empty when no other matching highlight exists", () => {
    const cands = buildMergeCandidates(sampleDoc(), "tool", "ent_tool_xyz");
    expect(cands).toEqual([]);
  });
});

describe("mergeEntityIds", () => {
  it("rewrites only matching label+entityId via editor.updateBlock", () => {
    const doc = sampleDoc();
    const updates: Array<{ id: string; patch: any }> = [];
    const editor = {
      document: doc,
      updateBlock: (id: string, patch: any) => {
        updates.push({ id, patch });
        // mutate doc to reflect (so subsequent walk sees new state)
        const b = doc.find((x) => x.id === id);
        if (b && patch.content) (b as any).content = patch.content;
      },
    };

    const touched = mergeEntityIds(editor, "material", "ent_material_aaa", "ent_material_bbb");
    expect(touched).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("b1");
    expect(updates[0].patch.content[0].styles.inlineMaterial).toBe("ent_material_bbb");
    // tool 行は触られない
    expect(doc.find((b) => b.id === "b3")?.content[0].styles.inlineTool).toBe("ent_tool_xyz");
  });

  it("noop when source equals target", () => {
    const editor = { document: sampleDoc(), updateBlock: () => {} };
    expect(mergeEntityIds(editor, "material", "ent_material_aaa", "ent_material_aaa")).toBe(0);
  });

  it("does not touch a different label sharing the same entityId string", () => {
    const doc = [
      makeBlock("b1", [
        { type: "text", text: "A", styles: { inlineMaterial: "shared_id" } },
      ]),
      makeBlock("b2", [
        { type: "text", text: "B", styles: { inlineTool: "shared_id" } },
      ]),
    ];
    const updates: Array<{ id: string; patch: any }> = [];
    const editor = {
      document: doc,
      updateBlock: (id: string, patch: any) => {
        updates.push({ id, patch });
        const b = doc.find((x) => x.id === id);
        if (b && patch.content) (b as any).content = patch.content;
      },
    };
    mergeEntityIds(editor, "material", "shared_id", "new_id");
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("b1");
  });
});
