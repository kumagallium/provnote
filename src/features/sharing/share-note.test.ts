// shareNote のテスト。Tauri invoke をモックしてラウンドトリップを確認する。

import { describe, it, expect, beforeEach, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { shareNote } from "./share-note";
import type { GraphiumDocument } from "../../lib/document-types";
import type { AuthorIdentity } from "../document-provenance/types";

const author: AuthorIdentity = { name: "Ada", email: "a@b.co" };

class FakeFs {
  entries = new Map<string, string>();
  install() {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string, args: any) => {
      switch (cmd) {
        case "shared_write":
          this.entries.set(`${args.entryType}/${args.id}`, args.content);
          return null;
        case "shared_read": {
          const v = this.entries.get(`${args.entryType}/${args.id}`);
          if (!v) throw new Error("not found");
          return v;
        }
        default:
          throw new Error(`unmocked: ${cmd}`);
      }
    });
  }
}

let fs: FakeFs;
beforeEach(() => {
  fs = new FakeFs();
  fs.install();
});

function makeDoc(overrides: Partial<GraphiumDocument> = {}): GraphiumDocument {
  return {
    version: 5,
    title: "Test note",
    pages: [
      {
        id: "p1",
        title: "Test note",
        blocks: [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "hi" }] }],
        labels: {},
        provLinks: [],
        knowledgeLinks: [],
      },
    ],
    createdAt: "2026-05-04T00:00:00Z",
    modifiedAt: "2026-05-04T00:00:00Z",
    ...overrides,
  };
}

describe("shareNote — first share", () => {
  it("ok=true、新しい sharedRef が付き、isUpdate=false", async () => {
    const result = await shareNote(makeDoc(), { root: "/tmp/shared", author });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isUpdate).toBe(false);
    expect(result.doc.sharedRef).toBeDefined();
    expect(result.doc.sharedRef!.id).toMatch(/^[0-9a-f]{8}-/);
    expect(result.doc.sharedRef!.type).toBe("note");
    expect(result.doc.sharedRef!.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.doc.sharedRef!.sharedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("shared 側に書き込まれた entry には author / type / title が反映される", async () => {
    const result = await shareNote(makeDoc(), { root: "/tmp/shared", author });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = JSON.parse([...fs.entries.values()][0]);
    expect(stored.entry.author).toEqual(author);
    expect(stored.entry.type).toBe("note");
    expect(stored.entry.extra?.title).toBe("Test note");
  });

  it("元の doc は変更されない（immutable）", async () => {
    const original = makeDoc();
    await shareNote(original, { root: "/tmp/shared", author });
    expect(original.sharedRef).toBeUndefined();
  });
});

describe("shareNote — re-share (update)", () => {
  it("isUpdate=true で同じ id を維持する", async () => {
    const first = await shareNote(makeDoc(), { root: "/tmp/shared", author });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // 内容を変えて再共有
    const updated = await shareNote(
      { ...first.doc, title: "Updated title" },
      { root: "/tmp/shared", author },
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.isUpdate).toBe(true);
    expect(updated.doc.sharedRef!.id).toBe(first.doc.sharedRef!.id);
    // hash は内容変更により変わる
    expect(updated.doc.sharedRef!.hash).not.toBe(first.doc.sharedRef!.hash);
  });
});

describe("shareNote — failure paths", () => {
  it("空 root だと ok=false", async () => {
    const r = await shareNote(makeDoc(), { root: "", author });
    expect(r.ok).toBe(false);
  });

  it("invoke が失敗すれば ok=false", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async () => {
      throw new Error("disk full");
    });
    const r = await shareNote(makeDoc(), { root: "/tmp/shared", author });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("disk full");
  });
});
