// shared エントリを tombstone 化する（誤共有リカバリ、Phase 2c）。
//
// 設計:
// - author 本人にしか実行できない（provider 側で email 一致チェック）
// - tombstone 後も body は残らないが、`status="unshared"` として _meta/tombstones に保管
// - data-manifest の場合、参照していた blob は **reference-counted GC** で削除する。
//   他の active な data-manifest が同じ hash を参照していなければ blob 本体も消す
// - ローカル側の sharedRef 削除は呼び出し側で行う（ノート編集状態を直接触らないため）
//
// 設計詳細: docs/internal/team-shared-storage-design.md §3 Unshare

import type { AuthorIdentity } from "../document-provenance/types";
import {
  LocalFolderSharedProvider,
  LocalFolderBlobProvider,
  type SharedEntry,
  type BlobRef,
} from "../../lib/storage/shared";

export type UnshareEntryOptions = {
  /** Settings の shared root */
  root: string;
  /** Settings 登録済みの AuthorIdentity（必須） */
  author: AuthorIdentity;
  /** data-manifest の blob GC を行うための blob root（任意） */
  blobRoot?: string;
};

export type UnshareEntryResult =
  | {
      ok: true;
      /** GC で削除した blob hash 群（data-manifest の場合のみ非空） */
      deletedBlobs: string[];
      /** 他 manifest からまだ参照されているため残した blob hash 群 */
      retainedBlobs: string[];
    }
  | { ok: false; error: string };

function extractBlobHashes(entry: SharedEntry): string[] {
  const extra = (entry.extra ?? {}) as Record<string, unknown>;
  const blobs = extra.blobs;
  if (!Array.isArray(blobs)) return [];
  const hashes: string[] = [];
  for (const b of blobs) {
    if (b && typeof b === "object" && typeof (b as BlobRef).hash === "string") {
      hashes.push((b as BlobRef).hash);
    }
  }
  return hashes;
}

/**
 * 指定 entry を tombstone 化し、data-manifest なら参照されなくなった blob も GC する。
 */
export async function unshareEntry(
  sharedId: string,
  options: UnshareEntryOptions,
): Promise<UnshareEntryResult> {
  try {
    const provider = new LocalFolderSharedProvider(options.root, {
      email: options.author.email,
    });

    // 削除前にエントリを読み、データ manifest なら blob hash を控えておく
    let blobHashesToCheck: string[] = [];
    let isDataManifest = false;
    try {
      const { entry } = await provider.read(sharedId);
      isDataManifest = entry.type === "data-manifest";
      if (isDataManifest) {
        blobHashesToCheck = extractBlobHashes(entry);
      }
    } catch {
      // 読み出せない（既に消えている等）場合は GC せず削除のみ試行
    }

    await provider.delete(sharedId);

    const deletedBlobs: string[] = [];
    const retainedBlobs: string[] = [];

    if (isDataManifest && blobHashesToCheck.length > 0 && options.blobRoot) {
      // 残存している data-manifest を全件読んで参照中の hash を集める
      const remaining = await provider.list("data-manifest");
      const stillReferenced = new Set<string>();
      for (const e of remaining) {
        for (const h of extractBlobHashes(e)) {
          stillReferenced.add(h);
        }
      }

      const blobProvider = new LocalFolderBlobProvider(options.blobRoot);
      for (const hash of blobHashesToCheck) {
        if (stillReferenced.has(hash)) {
          retainedBlobs.push(hash);
          continue;
        }
        try {
          await blobProvider.delete(hash);
          deletedBlobs.push(hash);
        } catch {
          // 個別の delete 失敗は致命ではない（blob だけ残る）。続行
          retainedBlobs.push(hash);
        }
      }
    }

    return { ok: true, deletedBlobs, retainedBlobs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
