import { describe, it, expect } from "vitest";
import { computeSharedEntryHash, computeBlobHash, __internal } from "./hash";
import type { SharedEntry } from "./types";

const author = { name: "Ada", email: "a@b.co" };

function baseEntry(): SharedEntry {
  return {
    id: "0192f7a8-1234-7abc-89ab-0123456789ab",
    type: "note",
    author,
    created_at: "2026-05-04T00:00:00Z",
    updated_at: "2026-05-04T00:00:00Z",
    hash: "", // 計算前のプレースホルダ
    prov: { derived_from: [] },
  };
}

const body = new TextEncoder().encode("hello world");

describe("canonicalStringify", () => {
  it("オブジェクトのキーがアルファベット順", () => {
    const s = __internal.canonicalStringify({ b: 1, a: 2, c: 3 });
    expect(s).toBe('{"a":2,"b":1,"c":3}');
  });

  it("ネストしたオブジェクトも再帰的に正規化", () => {
    const s = __internal.canonicalStringify({ z: { y: 1, x: 2 }, a: [3, { c: 4, b: 5 }] });
    expect(s).toBe('{"a":[3,{"b":5,"c":4}],"z":{"x":2,"y":1}}');
  });

  it("配列の順序は保持する", () => {
    const s = __internal.canonicalStringify([3, 1, 2]);
    expect(s).toBe("[3,1,2]");
  });

  it("undefined フィールドは省略", () => {
    const s = __internal.canonicalStringify({ a: 1, b: undefined, c: 3 });
    expect(s).toBe('{"a":1,"c":3}');
  });
});

describe("metadataForHash", () => {
  it("hash / history / superseded_by / attestations を除外する", () => {
    const e: SharedEntry = {
      ...baseEntry(),
      hash: "sha256:xxx",
      history: [{ hash: "sha256:old", updated_at: "x", updated_by: author, change_kind: "minor" }],
      superseded_by: "some-id",
      attestations: [{ provider: "bloxberg", hash: "x", timestamp: "x", proof: "x" }],
    };
    const m = __internal.metadataForHash(e);
    expect(m.hash).toBeUndefined();
    expect(m.history).toBeUndefined();
    expect(m.superseded_by).toBeUndefined();
    expect(m.attestations).toBeUndefined();
    expect(m.id).toBe(e.id);
    expect(m.author).toEqual(author);
  });
});

describe("computeSharedEntryHash", () => {
  it("hash 形式は sha256:<64 hex>", async () => {
    const h = await computeSharedEntryHash(baseEntry(), body);
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("同じ入力に対して同じ hash を返す（決定性）", async () => {
    const h1 = await computeSharedEntryHash(baseEntry(), body);
    const h2 = await computeSharedEntryHash(baseEntry(), body);
    expect(h1).toBe(h2);
  });

  it("メタデータのキー順序が違っても同じ hash（canonical）", async () => {
    const e1 = baseEntry();
    const e2: SharedEntry = {
      hash: "",
      prov: { derived_from: [] },
      author,
      type: "note",
      updated_at: "2026-05-04T00:00:00Z",
      created_at: "2026-05-04T00:00:00Z",
      id: "0192f7a8-1234-7abc-89ab-0123456789ab",
    };
    const h1 = await computeSharedEntryHash(e1, body);
    const h2 = await computeSharedEntryHash(e2, body);
    expect(h1).toBe(h2);
  });

  it("hash 自身を変えても hash 結果は不変（自己参照を回避）", async () => {
    const e1 = baseEntry();
    const e2 = { ...baseEntry(), hash: "sha256:dummy" };
    const h1 = await computeSharedEntryHash(e1, body);
    const h2 = await computeSharedEntryHash(e2, body);
    expect(h1).toBe(h2);
  });

  it("history を追加しても hash 結果は不変", async () => {
    const e1 = baseEntry();
    const e2: SharedEntry = {
      ...baseEntry(),
      history: [{ hash: "sha256:old", updated_at: "x", updated_by: author, change_kind: "minor" }],
    };
    const h1 = await computeSharedEntryHash(e1, body);
    const h2 = await computeSharedEntryHash(e2, body);
    expect(h1).toBe(h2);
  });

  it("本体が変われば hash が変わる", async () => {
    const h1 = await computeSharedEntryHash(baseEntry(), body);
    const h2 = await computeSharedEntryHash(baseEntry(), new TextEncoder().encode("hello world!"));
    expect(h1).not.toBe(h2);
  });

  it("author が変われば hash が変わる（content と author の一貫性を担保）", async () => {
    const h1 = await computeSharedEntryHash(baseEntry(), body);
    const h2 = await computeSharedEntryHash(
      { ...baseEntry(), author: { name: "Mallory", email: "m@x.co" } },
      body,
    );
    expect(h1).not.toBe(h2);
  });

  it("メタデータと本体の境界で衝突しない（unit separator 効果）", async () => {
    // body=A、metadata の serialized 末尾と body 先頭をくっつけても
    // 区切り byte (0x1F) があるため別 hash になる
    const e1 = baseEntry();
    const h1 = await computeSharedEntryHash(e1, new TextEncoder().encode("hello"));
    const h2 = await computeSharedEntryHash(e1, new TextEncoder().encode("hell"));
    expect(h1).not.toBe(h2);
  });
});

describe("computeBlobHash", () => {
  it("既知ベクトル: 'abc' の SHA-256", async () => {
    const h = await computeBlobHash(new TextEncoder().encode("abc"));
    expect(h).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("空 bytes の SHA-256", async () => {
    const h = await computeBlobHash(new Uint8Array());
    expect(h).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
