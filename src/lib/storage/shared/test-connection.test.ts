// testSharedConnection / testBlobConnection のテスト。
// Tauri invoke をモックしてラウンドトリップが成功 / 失敗のいずれも検出できることを確認する。

import { describe, it, expect, beforeEach, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { testSharedConnection, testBlobConnection } from "./test-connection";

const author = { name: "Ada", email: "a@b.co" };

class FakeFs {
  entries = new Map<string, string>();
  blobs = new Map<string, string>();
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
        case "shared_delete":
          this.entries.delete(`${args.entryType}/${args.id}`);
          return null;
        case "shared_blob_write":
          this.blobs.set(args.hash, args.contentBase64);
          return null;
        case "shared_blob_read": {
          const v = this.blobs.get(args.hash);
          if (!v) throw new Error("blob not found");
          return v;
        }
        case "shared_blob_exists":
          return this.blobs.has(args.hash);
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

describe("testSharedConnection", () => {
  it("ラウンドトリップが成功すれば ok=true と id/hash を返す", async () => {
    const res = await testSharedConnection("/tmp/shared", author);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.id).toMatch(/^[0-9a-f]{8}-/);
      expect(res.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("write が失敗すれば ok=false でエラーを返す", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "shared_write") throw new Error("permission denied");
      return null;
    });
    const res = await testSharedConnection("/tmp/shared", author);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("permission denied");
  });

  it("read で内容が違ったらエラーになる（理論上発生しないが防御確認）", async () => {
    // write は成功させ、read で別 content を返す
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === "shared_write") return null;
      if (cmd === "shared_read") {
        return JSON.stringify({
          entry: {
            id: args.id,
            type: "note",
            author,
            created_at: "x",
            updated_at: "x",
            hash: "sha256:0".repeat(64),
            prov: { derived_from: [] },
          },
          body_base64: btoa("DIFFERENT BYTES"),
        });
      }
      if (cmd === "shared_delete") return null;
      throw new Error(`unmocked: ${cmd}`);
    });
    const res = await testSharedConnection("/tmp/shared", author);
    expect(res.ok).toBe(false);
  });

  it("空 root だと例外をキャッチしてエラーを返す", async () => {
    const res = await testSharedConnection("", author);
    expect(res.ok).toBe(false);
  });
});

describe("testBlobConnection", () => {
  it("put → get → verifyHash が成功する", async () => {
    const res = await testBlobConnection("/tmp/blobs");
    expect(res.ok).toBe(true);
  });

  it("invoke 失敗時はエラーを返す", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async () => {
      throw new Error("disk full");
    });
    const res = await testBlobConnection("/tmp/blobs");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("disk full");
  });
});
