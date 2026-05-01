import { describe, it, expect } from "vitest";
import {
  parseAttributeBinding,
  formatAttributeBinding,
  setAttributeParent,
  collectSameBlockEntities,
  findAttributeBlockId,
  getAttributeBinding,
  PARENT_ACTIVITY_MARKER,
} from "./attribute-binding";

describe("parse/formatAttributeBinding", () => {
  it("parses simple entityId without @", () => {
    expect(parseAttributeBinding("ent_attr_x")).toEqual({
      entityId: "ent_attr_x",
      parentEntityId: null,
    });
  });
  it("parses composite entityId@parent", () => {
    expect(parseAttributeBinding("ent_attr_x@ent_material_y")).toEqual({
      entityId: "ent_attr_x",
      parentEntityId: "ent_material_y",
    });
  });
  it("parses activity marker", () => {
    expect(parseAttributeBinding("ent_attr_x@activity")).toEqual({
      entityId: "ent_attr_x",
      parentEntityId: PARENT_ACTIVITY_MARKER,
    });
  });
  it("formats roundtrip", () => {
    expect(
      formatAttributeBinding({
        entityId: "ent_attr_x",
        parentEntityId: "ent_material_y",
      }),
    ).toBe("ent_attr_x@ent_material_y");
    expect(
      formatAttributeBinding({ entityId: "ent_attr_x", parentEntityId: null }),
    ).toBe("ent_attr_x");
  });
});

describe("collectSameBlockEntities", () => {
  it("returns only entity (non-attribute) highlights in the given block", () => {
    const blocks = [
      {
        id: "b1",
        content: [
          {
            type: "text",
            text: "NaCl",
            styles: { inlineMaterial: "ent_mat_a" },
          },
          {
            type: "text",
            text: "balance",
            styles: { inlineTool: "ent_tool_b" },
          },
          {
            type: "text",
            text: "5g",
            styles: { inlineAttribute: "ent_attr_c" },
          },
        ],
        children: [],
      },
      {
        id: "b2",
        content: [
          { type: "text", text: "other", styles: { inlineMaterial: "ent_mat_z" } },
        ],
        children: [],
      },
    ];
    const got = collectSameBlockEntities(blocks, "b1");
    expect(got.map((e) => e.entityId).sort()).toEqual(["ent_mat_a", "ent_tool_b"]);
  });
});

describe("setAttributeParent", () => {
  function makeEditor(blocks: any[]) {
    return {
      document: blocks,
      updateBlock(id: string, patch: any) {
        const b = blocks.find((x) => x.id === id);
        if (b && patch.content) b.content = patch.content;
      },
    };
  }

  it("sets parent on attribute style", () => {
    const blocks = [
      {
        id: "b1",
        content: [
          {
            type: "text",
            text: "5g",
            styles: { inlineAttribute: "ent_attr_x" },
          },
        ],
        children: [],
      },
    ];
    const ed = makeEditor(blocks);
    const touched = setAttributeParent(ed, "ent_attr_x", "ent_material_y");
    expect(touched).toBe(1);
    expect(blocks[0].content[0].styles.inlineAttribute).toBe(
      "ent_attr_x@ent_material_y",
    );
  });

  it("clears parent when null", () => {
    const blocks = [
      {
        id: "b1",
        content: [
          {
            type: "text",
            text: "5g",
            styles: { inlineAttribute: "ent_attr_x@ent_material_y" },
          },
        ],
        children: [],
      },
    ];
    const ed = makeEditor(blocks);
    setAttributeParent(ed, "ent_attr_x", null);
    expect(blocks[0].content[0].styles.inlineAttribute).toBe("ent_attr_x");
  });

  it("does not touch other attributes", () => {
    const blocks = [
      {
        id: "b1",
        content: [
          {
            type: "text",
            text: "5g",
            styles: { inlineAttribute: "ent_attr_x" },
          },
          {
            type: "text",
            text: "ml",
            styles: { inlineAttribute: "ent_attr_y" },
          },
        ],
        children: [],
      },
    ];
    const ed = makeEditor(blocks);
    setAttributeParent(ed, "ent_attr_x", PARENT_ACTIVITY_MARKER);
    expect(blocks[0].content[0].styles.inlineAttribute).toBe(
      "ent_attr_x@activity",
    );
    expect(blocks[0].content[1].styles.inlineAttribute).toBe("ent_attr_y");
  });
});

describe("findAttributeBlockId / getAttributeBinding", () => {
  const blocks = [
    {
      id: "b1",
      content: [
        {
          type: "text",
          text: "5g",
          styles: { inlineAttribute: "ent_attr_x@ent_material_a" },
        },
      ],
      children: [],
    },
  ];
  it("finds the block id of an attribute", () => {
    expect(findAttributeBlockId(blocks, "ent_attr_x")).toBe("b1");
    expect(findAttributeBlockId(blocks, "ent_attr_missing")).toBeNull();
  });
  it("gets the current binding", () => {
    expect(getAttributeBinding(blocks, "ent_attr_x")).toEqual({
      entityId: "ent_attr_x",
      parentEntityId: "ent_material_a",
    });
  });
});
