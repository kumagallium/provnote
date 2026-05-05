// ノート Share 時の自動 blob 化（Phase 2c-1）。
//
// 設計判断（docs/internal/team-shared-storage-design.md §12 Phase 2c）:
// - shared 側 doc 内の image / video / audio / file / pdf ブロックの props.url は
//   `shared-blob:sha256:<hex>` に置換し、実体バイト列は BlobStorageProvider に置く
// - personal 側の doc は触らない（破壊的変更なし）
// - extra.blobs に BlobRef[] を載せて、後の resolver / 整合性検証 / GC が引けるようにする

import type { GraphiumDocument } from "../../lib/document-types";
import type { BlobRef, BlobStorageProvider } from "../../lib/storage/shared";

const MEDIA_TYPES = new Set(["image", "video", "audio", "file", "pdf"]);

export type MediaUrlRef = {
  /** ブロックの props.url（置換対象キー） */
  url: string;
  /** 解決済みの fileId（ローカルメディア識別子） */
  fileId: string;
};

/** `shared-blob:<hash>` URL を組み立てる（hash は "sha256:<hex>" 形式）。 */
export function makeSharedBlobUrl(hash: string): string {
  return `shared-blob:${hash}`;
}

/** `shared-blob:<hash>` から hash を取り出す。該当しなければ null。 */
export function parseSharedBlobUrl(url: string): string | null {
  const m = url.match(/^shared-blob:(.+)$/);
  return m ? m[1] : null;
}

/**
 * doc を走査して media block の (url, fileId) ペアを集める。同じ url は dedup。
 * extractFileId は active StorageProvider のものを差し込む（テスト時に差し替え可）。
 *
 * - 既に `shared-blob:` 形式の url は対象外（fork 元から引き継いだ参照は再アップロード不要）
 * - extractFileId が null を返した url（外部 URL、bookmark 等）はスキップ
 */
export function collectMediaRefs(
  doc: GraphiumDocument,
  extractFileId: (url: string) => string | null,
): MediaUrlRef[] {
  const seen = new Set<string>();
  const refs: MediaUrlRef[] = [];
  const walk = (blocks: any[] | undefined): void => {
    if (!blocks) return;
    for (const b of blocks) {
      if (
        MEDIA_TYPES.has(b?.type) &&
        typeof b?.props?.url === "string" &&
        !b.props.url.startsWith("shared-blob:")
      ) {
        const fileId = extractFileId(b.props.url);
        if (fileId && !seen.has(b.props.url)) {
          seen.add(b.props.url);
          refs.push({ url: b.props.url, fileId });
        }
      }
      if (b?.children?.length) walk(b.children);
    }
  };
  for (const page of doc.pages ?? []) walk(page.blocks);
  return refs;
}

/**
 * doc 内の media block の props.url を mapping に従って置換した新しい doc を返す。
 * mapping に無い url はそのまま。doc は immutable に扱う（新オブジェクトを返す）。
 */
export function rewriteMediaUrls(
  doc: GraphiumDocument,
  mapping: Map<string, string>,
): GraphiumDocument {
  if (mapping.size === 0) return doc;
  const remap = (blocks: any[]): any[] =>
    blocks.map((b) => {
      let next = b;
      if (
        MEDIA_TYPES.has(b?.type) &&
        typeof b?.props?.url === "string" &&
        mapping.has(b.props.url)
      ) {
        next = { ...b, props: { ...b.props, url: mapping.get(b.props.url)! } };
      }
      if (next?.children?.length) {
        next = { ...next, children: remap(next.children) };
      }
      return next;
    });
  return {
    ...doc,
    pages: doc.pages.map((p) => ({ ...p, blocks: remap(p.blocks) })),
  };
}

export type FetchMediaBytes = (fileId: string) => Promise<Uint8Array>;

export type AutoBlobResult = {
  /** url 置換後の新しい doc */
  doc: GraphiumDocument;
  /** アップロードした BlobRef（hash で dedup 済み） */
  blobs: BlobRef[];
};

/**
 * doc 内のローカルメディアを blob として書き出し、url を `shared-blob:<hash>` に置換する。
 *
 * Tauri のような実行環境依存の処理は呼び出し側から差し込む（fetchBytes / blobProvider）。
 * このため本関数自体はテスト時に純粋関数として呼べる。
 */
export async function autoUploadMediaBlobs(
  doc: GraphiumDocument,
  opts: {
    extractFileId: (url: string) => string | null;
    fetchBytes: FetchMediaBytes;
    blobProvider: BlobStorageProvider;
  },
): Promise<AutoBlobResult> {
  const refs = collectMediaRefs(doc, opts.extractFileId);
  if (refs.length === 0) return { doc, blobs: [] };

  const mapping = new Map<string, string>();
  const byHash = new Map<string, BlobRef>();
  for (const ref of refs) {
    const bytes = await opts.fetchBytes(ref.fileId);
    const blobRef = await opts.blobProvider.put(bytes, { filename: ref.fileId });
    mapping.set(ref.url, makeSharedBlobUrl(blobRef.hash));
    if (!byHash.has(blobRef.hash)) byHash.set(blobRef.hash, blobRef);
  }
  return {
    doc: rewriteMediaUrls(doc, mapping),
    blobs: [...byHash.values()],
  };
}
