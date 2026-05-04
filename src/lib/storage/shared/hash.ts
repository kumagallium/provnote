// SharedEntry の hash 計算。
//
// 設計:
//   hash = SHA-256( canonical_json(metadata_for_hash) || 0x1F || body )
//
//   metadata_for_hash = entry without { hash, history, superseded_by, attestations }
//
//   - hash 自身は除外（自己参照を回避）
//   - history は付随情報（過去 hash の積み重ね）で、現エントリ内容を変えない
//   - superseded_by は将来後継エントリが書き込まれた時にだけ追記される
//   - attestations は外部証明（hash 確定後に追記）
//
// canonical JSON はキーをアルファベット順、配列内は順序保持、Unicode は
// 標準の JSON.stringify に従う（U+0000–U+001F は \uXXXX エスケープ）。
// 0x1F (Unit Separator) は本体との区切り（衝突時の bytes shift 防止）。
//
// 設計詳細: docs/internal/team-shared-storage-design.md §AuthorIdentity §改ざん検知

import type { SharedEntry } from "./types";

/** hash 計算から除外するキー（理由は冒頭コメント参照）。 */
const HASH_EXCLUDED_KEYS = new Set<string>([
  "hash",
  "history",
  "superseded_by",
  "attestations",
]);

/**
 * オブジェクト/配列を再帰的に正規化し、キーをアルファベット順に並べた
 * canonical JSON 文字列を返す。`undefined` のフィールドは省略する
 * （JSON.stringify の挙動と整合）。
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalStringify(v)).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>)
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .sort();
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonicalStringify((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}

/** hash 計算用にメタデータを抽出する（hash / history / ... を除外）。 */
function metadataForHash(entry: SharedEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (HASH_EXCLUDED_KEYS.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

const UNIT_SEPARATOR = new Uint8Array([0x1f]);

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

/**
 * SubtleCrypto による SHA-256。Node 環境（vitest）でも globalThis.crypto.subtle
 * が標準で使える（Node 19+）。
 */
async function sha256(bytes: Uint8Array): Promise<string> {
  // SubtleCrypto.digest は BufferSource を受け取る。Uint8Array は本来 BufferSource
  // だが、TypeScript 5.7+ では Uint8Array<ArrayBufferLike> が SharedArrayBuffer を
  // 含む可能性を考慮して BufferSource に直接代入できないため、型を緩めて渡す。
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return "sha256:" + bytesToHex(new Uint8Array(buf));
}

/**
 * SharedEntry の hash を計算する。
 *
 * 入力: メタデータ（一部キーを除外） + 本体バイト列
 * 出力: "sha256:<hex>" 形式の文字列（Provider 実装で entry.hash にセット）
 */
export async function computeSharedEntryHash(
  entry: SharedEntry,
  body: Uint8Array,
): Promise<string> {
  const metaJson = canonicalStringify(metadataForHash(entry));
  const metaBytes = new TextEncoder().encode(metaJson);
  return sha256(concatBytes(metaBytes, UNIT_SEPARATOR, body));
}

/** 単独の Blob bytes に対する SHA-256（BlobRef.hash 用）。 */
export async function computeBlobHash(body: Uint8Array): Promise<string> {
  return sha256(body);
}

// 内部関数はテストから直接検証したいので名前付きでも公開する
export const __internal = { canonicalStringify, metadataForHash };
