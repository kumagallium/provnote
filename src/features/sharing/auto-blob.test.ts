// auto-blob のユニットテスト（Tauri 非依存）。

import { describe, it, expect } from "vitest";
import {
  collectMediaRefs,
  rewriteMediaUrls,
  makeSharedBlobUrl,
  parseSharedBlobUrl,
  autoUploadMediaBlobs,
} from "./auto-blob";
import type { GraphiumDocument } from "../../lib/document-types";
import type { BlobRef, BlobStorageProvider } from "../../lib/storage/shared";

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

const fakeExtract = (url: string): string | null => {
  const m = url.match(/^file-media:\/\/(.+)$/);
  return m ? m[1] : null;
};

describe("makeSharedBlobUrl / parseSharedBlobUrl", () => {
  it("ラウンドトリップで hash が復元できる", () => {
    const hash = "sha256:" + "a".repeat(64);
    const url = makeSharedBlobUrl(hash);
    expect(url).toBe(`shared-blob:${hash}`);
    expect(parseSharedBlobUrl(url)).toBe(hash);
  });
  it("該当しない URL は null", () => {
    expect(parseSharedBlobUrl("file-media://abc")).toBeNull();
  });
});

describe("collectMediaRefs", () => {
  it("image / video / audio / file / pdf を全て拾い、重複 url は dedup する", () => {
    const d = doc([
      { id: "b1", type: "image", props: { url: "file-media://A" } },
      { id: "b2", type: "video", props: { url: "file-media://B" } },
      { id: "b3", type: "audio", props: { url: "file-media://C" } },
      { id: "b4", type: "file", props: { url: "file-media://D" } },
      { id: "b5", type: "pdf", props: { url: "file-media://E" } },
      { id: "b6", type: "image", props: { url: "file-media://A" } }, // 重複
      { id: "b7", type: "paragraph", content: [] },
    ]);
    const refs = collectMediaRefs(d, fakeExtract);
    expect(refs.map((r) => r.fileId)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("外部 URL（extractFileId が null を返す）はスキップ", () => {
    const d = doc([
      { id: "b1", type: "image", props: { url: "https://example.com/x.png" } },
      { id: "b2", type: "image", props: { url: "file-media://X" } },
    ]);
    const refs = collectMediaRefs(d, fakeExtract);
    expect(refs).toHaveLength(1);
    expect(refs[0].fileId).toBe("X");
  });

  it("既に shared-blob: の url はスキップ（fork 由来の引用は再アップロード不要）", () => {
    const d = doc([
      { id: "b1", type: "image", props: { url: "shared-blob:sha256:deadbeef" } },
      { id: "b2", type: "image", props: { url: "file-media://Y" } },
    ]);
    const refs = collectMediaRefs(d, fakeExtract);
    expect(refs).toHaveLength(1);
    expect(refs[0].fileId).toBe("Y");
  });

  it("子ブロックの media も再帰的に拾う", () => {
    const d = doc([
      {
        id: "b1",
        type: "paragraph",
        content: [],
        children: [
          { id: "b2", type: "image", props: { url: "file-media://Z" } },
        ],
      },
    ]);
    const refs = collectMediaRefs(d, fakeExtract);
    expect(refs).toHaveLength(1);
    expect(refs[0].fileId).toBe("Z");
  });
});

describe("rewriteMediaUrls", () => {
  it("mapping にある url のみ置換、他は無変更、元 doc は immutable", () => {
    const d = doc([
      { id: "b1", type: "image", props: { url: "file-media://A", caption: "x" } },
      { id: "b2", type: "image", props: { url: "https://ext/img" } },
    ]);
    const map = new Map([["file-media://A", "shared-blob:sha256:abc"]]);
    const out = rewriteMediaUrls(d, map);
    expect(out.pages[0].blocks[0].props.url).toBe("shared-blob:sha256:abc");
    expect(out.pages[0].blocks[0].props.caption).toBe("x");
    expect(out.pages[0].blocks[1].props.url).toBe("https://ext/img");
    // immutable
    expect(d.pages[0].blocks[0].props.url).toBe("file-media://A");
    expect(out).not.toBe(d);
  });

  it("mapping が空なら同一参照を返す", () => {
    const d = doc([{ id: "b1", type: "image", props: { url: "file-media://A" } }]);
    expect(rewriteMediaUrls(d, new Map())).toBe(d);
  });
});

describe("autoUploadMediaBlobs", () => {
  it("各 fileId に対して blobProvider.put を呼び、url を置換し、BlobRef を hash で dedup する", async () => {
    const d = doc([
      { id: "b1", type: "image", props: { url: "file-media://A" } },
      { id: "b2", type: "image", props: { url: "file-media://B" } },
      { id: "b3", type: "image", props: { url: "file-media://A" } }, // 同 url 再利用
    ]);
    const bytesByFile: Record<string, Uint8Array> = {
      A: new Uint8Array([1, 2, 3]),
      B: new Uint8Array([4, 5, 6]),
    };
    const fakeBlob: BlobStorageProvider = {
      kind: "fake",
      put: async (bytes) => ({
        provider: "fake",
        uri: `fake://h-${bytes[0]}`,
        hash: `sha256:h-${bytes[0]}`,
        size: bytes.length,
      } satisfies BlobRef),
      get: async () => new Uint8Array(),
      url: async () => "",
      verifyHash: async () => true,
    };
    const result = await autoUploadMediaBlobs(d, {
      extractFileId: fakeExtract,
      fetchBytes: async (id) => bytesByFile[id],
      blobProvider: fakeBlob,
    });
    expect(result.blobs.map((b) => b.hash).sort()).toEqual(["sha256:h-1", "sha256:h-4"]);
    expect(result.doc.pages[0].blocks[0].props.url).toBe("shared-blob:sha256:h-1");
    expect(result.doc.pages[0].blocks[1].props.url).toBe("shared-blob:sha256:h-4");
    expect(result.doc.pages[0].blocks[2].props.url).toBe("shared-blob:sha256:h-1");
  });

  it("media が無ければ blobs は空、doc は同一参照", async () => {
    const d = doc([{ id: "b1", type: "paragraph", content: [] }]);
    const result = await autoUploadMediaBlobs(d, {
      extractFileId: fakeExtract,
      fetchBytes: async () => new Uint8Array(),
      blobProvider: {
        kind: "fake",
        put: async () => {
          throw new Error("should not be called");
        },
        get: async () => new Uint8Array(),
        url: async () => "",
        verifyHash: async () => true,
      },
    });
    expect(result.blobs).toEqual([]);
    expect(result.doc).toBe(d);
  });
});
