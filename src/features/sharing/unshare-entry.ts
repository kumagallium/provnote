// shared エントリを tombstone 化する（誤共有リカバリ、Phase 2c）。
//
// 設計:
// - author 本人にしか実行できない（provider 側で email 一致チェック）
// - tombstone 後も body は残らないが、`status="unshared"` として _meta/tombstones に保管
// - ローカル側の sharedRef 削除は呼び出し側で行う（ノート編集状態を直接触らないため）
//
// 設計詳細: docs/internal/team-shared-storage-design.md §3 Unshare

import type { AuthorIdentity } from "../document-provenance/types";
import { LocalFolderSharedProvider } from "../../lib/storage/shared";

export type UnshareEntryOptions = {
  /** Settings の shared root */
  root: string;
  /** Settings 登録済みの AuthorIdentity（必須） */
  author: AuthorIdentity;
};

export type UnshareEntryResult =
  | { ok: true }
  | { ok: false; error: string };

export async function unshareEntry(
  sharedId: string,
  options: UnshareEntryOptions,
): Promise<UnshareEntryResult> {
  try {
    const provider = new LocalFolderSharedProvider(options.root, {
      email: options.author.email,
    });
    await provider.delete(sharedId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
