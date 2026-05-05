// ノートを team-shared storage に書き出す（Phase 2a）。
//
// Phase 2a の設計判断:
// - personal 側のノートは消さない（コピー扱い）。Phase 2b で移動 semantics に切替
// - Share 済みノートを再 Share した場合は **同じ id に上書き**（minor 改訂）
// - shared 側の body は GraphiumDocument の JSON シリアライズ（他の Graphium で
//   開けば完全復元できる）。markdown 変換は v2 で検討
//
// 設計: docs/internal/team-shared-storage-design.md §3 Share アクション

import type { GraphiumDocument } from "../../lib/document-types";
import type { AuthorIdentity } from "../document-provenance/types";
import {
  LocalFolderSharedProvider,
  newSharedId,
  computeSharedEntryHash,
  type SharedEntry,
} from "../../lib/storage/shared";

export type ShareNoteResult =
  | {
      ok: true;
      doc: GraphiumDocument;
      entry: SharedEntry;
      isUpdate: boolean;
    }
  | { ok: false; error: string };

export type ShareNoteOptions = {
  /** Settings から渡される shared root path */
  root: string;
  /** Settings 登録済みの AuthorIdentity（必須） */
  author: AuthorIdentity;
};

/**
 * ノートを shared に書き出し、`sharedRef` 付きの新しい GraphiumDocument を返す。
 * 既に共有済みのノート（doc.sharedRef がある）は同じ id に上書きされる。
 *
 * 注意: 呼び出し側で「現在のドキュメント状態」を保存しておくこと。
 *       本関数は doc を編集せず、新しい sharedRef を載せた document を返すだけ。
 */
export async function shareNote(
  doc: GraphiumDocument,
  options: ShareNoteOptions,
): Promise<ShareNoteResult> {
  try {
    const provider = new LocalFolderSharedProvider(options.root, {
      email: options.author.email,
    });
    const isUpdate = !!doc.sharedRef;
    const id = doc.sharedRef?.id ?? newSharedId();
    const now = new Date().toISOString();

    // body は shared 側で完全復元できるよう、GraphiumDocument 全体を JSON 化
    const bodyJson = JSON.stringify(doc);
    const body = new TextEncoder().encode(bodyJson);

    // 表示用 title を extra に詰めて list 時に拾える形にする（Phase 2 後半 Library UI で使う）
    const baseEntry: SharedEntry = {
      id,
      type: "note",
      author: options.author,
      created_at: doc.sharedRef?.sharedAt ?? now,
      updated_at: now,
      hash: "", // provider.write が再計算する
      prov: { derived_from: [] },
      extra: { title: doc.title },
    };

    // hash 値を sharedRef に持たせるためにここで先に計算する
    // （provider.write も同じロジックで再計算するので結果は一致する）
    const hash = await computeSharedEntryHash(baseEntry, body);
    await provider.write(baseEntry, body);

    const updatedDoc: GraphiumDocument = {
      ...doc,
      sharedRef: {
        id,
        type: "note",
        sharedAt: now,
        hash,
      },
    };

    return {
      ok: true,
      doc: updatedDoc,
      entry: { ...baseEntry, hash },
      isUpdate,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
