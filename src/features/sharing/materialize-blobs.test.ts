// materialize-blobs のユニットテスト（Tauri 非依存）。

import { describe, it, expect } from "vitest";
import {
  collectSharedBlobHashes,
  rewriteSharedBlobUrls,
  sniffMimeType,
  extensionForMime,
  materializeSharedBlobs,
} from "./materialize-blobs";
import type { GraphiumDocument } from "../../lib/document-types";
import type { BlobRef } from "../../lib/storage/shared";

function doc(blocks: any[]): GraphiumDocument {
  return {
    version: 5,
    title: "t",
    pages: [
      { id: "p1", title: "t", blocks, labels: {}, provLinks: [], knowledgeLinks: [] },
    ],
    createdAt: "2026-05-05T00:00:00Z",
    modifiedAt: "2026-05-05T00:00:00Z",
  };
}

describe("collectSharedBlobHashes", () => {
  it("media block の shared-blob: hash を dedup して返す", () => {
    const d = doc([
      { id: "b1", type: "image", props: { url: "shared-blob:sha256:aaa" } },
      { id: "b2", type: "image", props: { url: "shared-blob:sha256:aaa" } }, // 重複
      { id: "b3", type: "video", props: { url: "shared-blob:sha256:bbb" } },
      { id: "b4", type: "image", props: { url: "file-media://local" } }, // 非対象
      { id: "b5", type: "paragraph", content: [] },
    ]);
    expect(collectSharedBlobHashes(d).sort()).toEqual(["sha256:aaa", "sha256:bbb"]);
  });

  it("子ブロックも再帰的に拾う", () => {
    const d = doc([
      {
        id: "b1",
        type: "paragraph",
        content: [],
        children: [
          { id: "b2", type: "image", props: { url: "shared-blob:sha256:nested" } },
        ],
      },
    ]);
    expect(collectSharedBlobHashes(d)).toEqual(["sha256:nested"]);
  });
});

describe("rewriteSharedBlobUrls", () => {
  it("hash → 新 url で置換、他は無変更、元 doc は immutable", () => {
    const d = doc([
      { id: "b1", type: "image", props: { url: "shared-blob:sha256:x", caption: "c" } },
      { id: "b2", type: "image", props: { url: "https://ext/img.png" } },
    ]);
    const map = new Map([["sha256:x", "file-media://new-id"]]);
    const out = rewriteSharedBlobUrls(d, map);
    expect(out.pages[0].blocks[0].props.url).toBe("file-media://new-id");
    expect(out.pages[0].blocks[0].props.caption).toBe("c");
    expect(out.pages[0].blocks[1].props.url).toBe("https://ext/img.png");
    expect(d.pages[0].blocks[0].props.url).toBe("shared-blob:sha256:x");
  });

  it("mapping が空なら同一参照", () => {
    const d = doc([{ id: "b1", type: "image", props: { url: "shared-blob:sha256:y" } }]);
    expect(rewriteSharedBlobUrls(d, new Map())).toBe(d);
  });
});

describe("sniffMimeType", () => {
  const cases: [string, number[]][] = [
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["image/gif", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    ["application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]],
    ["image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
    ["video/mp4", [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]],
    ["audio/mpeg", [0x49, 0x44, 0x33, 0x04]],
  ];
  for (const [expected, magic] of cases) {
    it(`${expected} を識別する`, () => {
      expect(sniffMimeType(new Uint8Array(magic))).toBe(expected);
    });
  }
  it("不明バイトは application/octet-stream", () => {
    expect(sniffMimeType(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBe(
      "application/octet-stream",
    );
  });
});

describe("extensionForMime", () => {
  it("既知 MIME に対応する拡張子", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("application/pdf")).toBe("pdf");
    expect(extensionForMime("audio/mpeg")).toBe("mp3");
  });
  it("不明 MIME は bin", () => {
    expect(extensionForMime("application/x-foo")).toBe("bin");
  });
});

describe("materializeSharedBlobs", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

  function makeBlobRef(hash: string, filename?: string): BlobRef {
    return { provider: "local-folder", uri: `local-folder://${hash}`, hash, size: 8, filename };
  }

  it("各 hash について bytes 取得 → uploadMedia → mapping 構築 → doc を rewrite", async () => {
    const d = doc([
      { id: "b1", type: "image", props: { url: "shared-blob:sha256:a" } },
      { id: "b2", type: "image", props: { url: "shared-blob:sha256:a" } },
      { id: "b3", type: "pdf", props: { url: "shared-blob:sha256:b" } },
    ]);
    const blobs = [makeBlobRef("sha256:a", "orig.png"), makeBlobRef("sha256:b")];
    const fetched: string[] = [];
    const uploaded: { name: string; type: string }[] = [];
    let counter = 0;
    const result = await materializeSharedBlobs(d, {
      blobs,
      fetchBytes: async (ref) => {
        fetched.push(ref.hash);
        return ref.hash === "sha256:a" ? PNG : PDF;
      },
      uploadMedia: async (file) => {
        uploaded.push({ name: file.name, type: file.type });
        return { url: `file-media://new-${++counter}` };
      },
    });
    expect(fetched.sort()).toEqual(["sha256:a", "sha256:b"]);
    expect(uploaded[0]).toEqual({ name: "orig.png", type: "image/png" });
    expect(uploaded[1].type).toBe("application/pdf");
    expect(uploaded[1].name).toMatch(/\.pdf$/);
    // 同一 hash は 1 回しか upload しない（dedup 済）
    expect(uploaded).toHaveLength(2);
    expect(result.doc.pages[0].blocks[0].props.url).toBe("file-media://new-1");
    expect(result.doc.pages[0].blocks[1].props.url).toBe("file-media://new-1");
    expect(result.doc.pages[0].blocks[2].props.url).toBe("file-media://new-2");
    expect(result.missing).toEqual([]);
  });

  it("対応 BlobRef が無い hash は missing に積み、doc 内の url は shared-blob: のまま残す", async () => {
    const d = doc([
      { id: "b1", type: "image", props: { url: "shared-blob:sha256:exists" } },
      { id: "b2", type: "image", props: { url: "shared-blob:sha256:gone" } },
    ]);
    const blobs = [makeBlobRef("sha256:exists")];
    const result = await materializeSharedBlobs(d, {
      blobs,
      fetchBytes: async () => PNG,
      uploadMedia: async () => ({ url: "file-media://restored" }),
    });
    expect(result.missing).toEqual(["sha256:gone"]);
    expect(result.doc.pages[0].blocks[0].props.url).toBe("file-media://restored");
    expect(result.doc.pages[0].blocks[1].props.url).toBe("shared-blob:sha256:gone");
  });

  it("fetchBytes が失敗した hash も missing に積む", async () => {
    const d = doc([
      { id: "b1", type: "image", props: { url: "shared-blob:sha256:bad" } },
    ]);
    const result = await materializeSharedBlobs(d, {
      blobs: [makeBlobRef("sha256:bad")],
      fetchBytes: async () => {
        throw new Error("disk read fail");
      },
      uploadMedia: async () => ({ url: "x" }),
    });
    expect(result.missing).toEqual(["sha256:bad"]);
  });

  it("shared-blob: が無いノートは何もせず同一参照", async () => {
    const d = doc([{ id: "b1", type: "paragraph", content: [] }]);
    const result = await materializeSharedBlobs(d, {
      blobs: [],
      fetchBytes: async () => PNG,
      uploadMedia: async () => ({ url: "x" }),
    });
    expect(result.doc).toBe(d);
    expect(result.mapping.size).toBe(0);
    expect(result.missing).toEqual([]);
  });
});
