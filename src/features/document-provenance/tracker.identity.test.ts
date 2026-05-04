// recordRevision に AuthorIdentity が渡されたとき、人間 EditAgent に
// author が埋め込まれることを検証する（team-shared-storage Phase 0）。

import { describe, it, expect } from "vitest";
import { recordRevision } from "./tracker";
import type { AuthorIdentity } from "./types";
import type { GraphiumDocument } from "../../lib/document-types";

function makeDoc(): GraphiumDocument {
  return {
    version: 5,
    title: "t",
    pages: [
      {
        id: "p1",
        title: "t",
        blocks: [
          { id: "b1", type: "paragraph", content: [{ type: "text", text: "hello" }] },
        ],
        labels: {},
        provLinks: [],
        knowledgeLinks: [],
      },
    ],
    createdAt: "2026-05-04T00:00:00Z",
    modifiedAt: "2026-05-04T00:00:00Z",
  };
}

const identity: AuthorIdentity = { name: "Ada", email: "a@b.co" };

describe("recordRevision + AuthorIdentity", () => {
  it("人間エージェントに author が埋まる", async () => {
    const doc = await recordRevision(makeDoc(), null, "human_edit", { author: identity });
    const human = doc.documentProvenance!.agents.find((a) => a.type === "human");
    expect(human?.author).toEqual(identity);
  });

  it("AI エージェントには author を付けない（self-asserted を AI に持たせない）", async () => {
    const doc = await recordRevision(makeDoc(), null, "ai_generation", {
      agentLabel: "claude",
      author: identity,
    });
    const ai = doc.documentProvenance!.agents.find((a) => a.type === "ai");
    expect(ai?.author).toBeUndefined();
  });

  it("author を渡さなければ既存挙動と同じ（author 未設定）", async () => {
    const doc = await recordRevision(makeDoc(), null, "human_edit");
    const human = doc.documentProvenance!.agents.find((a) => a.type === "human");
    expect(human?.author).toBeUndefined();
  });

  it("既存 human agent がある状態で author 付きで保存すると最新値で更新される", async () => {
    let doc = await recordRevision(makeDoc(), null, "human_edit");
    // 内容を少し変える
    doc = {
      ...doc,
      pages: [{ ...doc.pages[0], blocks: [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "world" }] }] }],
    };
    const prev = { ...doc.pages[0], blocks: [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "hello" }] }] };
    const updated: AuthorIdentity = { name: "Ada Lovelace", email: "ada@example.org" };
    doc = await recordRevision(doc, prev, "human_edit", { author: updated });
    const human = doc.documentProvenance!.agents.find((a) => a.type === "human");
    expect(human?.author).toEqual(updated);
  });
});
