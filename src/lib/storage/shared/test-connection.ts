// Shared / Blob ストレージの接続テスト。
//
// Settings UI の "Test connection" ボタンから呼ばれ、ユーザーが選んだフォルダで
// 一連の読み書きが成功することを実機で検証する。Phase 1b の Rust コマンドの
// 動作確認も兼ねる。

import {
  LocalFolderSharedProvider,
  LocalFolderBlobProvider,
} from "./local-folder";
import { newSharedId } from "./id";
import type { AuthorIdentity } from "../../../features/document-provenance/types";

export type ConnectionTestResult =
  | { ok: true; id: string; hash: string }
  | { ok: false; error: string };

/**
 * shared root に対して write → read → verifyHash → delete のラウンドトリップを行う。
 * 成功時は entry id と hash を返し、失敗時はエラーメッセージを返す。
 */
export async function testSharedConnection(
  root: string,
  author: AuthorIdentity,
): Promise<ConnectionTestResult> {
  try {
    const provider = new LocalFolderSharedProvider(root);
    const id = newSharedId();
    const now = new Date().toISOString();
    const body = new TextEncoder().encode(
      `Graphium shared storage connection test at ${now}`,
    );

    await provider.write(
      {
        id,
        type: "note",
        author,
        created_at: now,
        updated_at: now,
        hash: "",
        prov: { derived_from: [] },
      },
      body,
    );

    const round = await provider.read(id);
    if (round.entry.id !== id) {
      return { ok: false, error: "Read returned a different entry id" };
    }
    if (new TextDecoder().decode(round.body) !== new TextDecoder().decode(body)) {
      return { ok: false, error: "Read returned different body bytes" };
    }
    const verified = await provider.verifyHash(id);
    if (!verified) {
      return { ok: false, error: "Hash verification failed" };
    }

    // 後始末: tombstone は残るが本体は消える
    await provider.delete(id);

    return { ok: true, id, hash: round.entry.hash };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * blob root に対して put → get → verifyHash の往復を行う。
 * blob は content-addressed なので delete はせず、テスト用 blob はそのまま残す
 * （次回テスト時は dedup されて書き込みすらスキップされる）。
 */
export async function testBlobConnection(
  root: string,
): Promise<ConnectionTestResult> {
  try {
    const provider = new LocalFolderBlobProvider(root);
    const body = new TextEncoder().encode(
      "Graphium blob storage connection test",
    );
    const ref = await provider.put(body, { filename: "graphium-test.txt" });
    const got = await provider.get(ref);
    if (new TextDecoder().decode(got) !== new TextDecoder().decode(body)) {
      return { ok: false, error: "Blob round-trip mismatch" };
    }
    const verified = await provider.verifyHash(ref);
    if (!verified) {
      return { ok: false, error: "Blob hash verification failed" };
    }
    return { ok: true, id: ref.uri, hash: ref.hash };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
