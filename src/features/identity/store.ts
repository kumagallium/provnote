// AuthorIdentity の永続化と取得
// localStorage にユーザーの self-asserted identity（name + email）を保存する。
//
// Phase 0（team-shared-storage 基盤）: 共有機能の有無に関わらず、ユーザーが
// 登録した identity を recordRevision に流し込めるようにする。起動時には
// 必須化せず、Share 操作時 / Settings から任意に登録する運用。

import type { AuthorIdentity } from "../document-provenance/types";

const STORAGE_KEY = "graphium-author-identity";

/** 簡易バリデーション結果 */
export type IdentityValidation =
  | { ok: true }
  | { ok: false; field: "name" | "email"; reason: string };

/** name / email の簡易バリデーション（性善説） */
export function validateAuthorIdentity(input: {
  name: string;
  email: string;
}): IdentityValidation {
  const name = input.name.trim();
  if (!name) return { ok: false, field: "name", reason: "name is required" };
  if (name.length > 100)
    return { ok: false, field: "name", reason: "name is too long" };

  const email = input.email.trim();
  if (!email) return { ok: false, field: "email", reason: "email is required" };
  // 性善説: @ を含み、両側に文字があるか だけ確認する
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1 || email.includes(" "))
    return { ok: false, field: "email", reason: "email looks invalid" };

  return { ok: true };
}

/**
 * localStorage から AuthorIdentity を読み込む。
 * 未登録 / 不正な形式の場合は null を返す。
 */
export function loadAuthorIdentity(): AuthorIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthorIdentity>;
    if (typeof parsed.name !== "string" || typeof parsed.email !== "string")
      return null;
    const validation = validateAuthorIdentity({
      name: parsed.name,
      email: parsed.email,
    });
    if (!validation.ok) return null;
    return {
      name: parsed.name.trim(),
      email: parsed.email.trim(),
      ...(parsed.public_key ? { public_key: parsed.public_key } : {}),
      ...(parsed.signature ? { signature: parsed.signature } : {}),
      ...(parsed.verified_by ? { verified_by: parsed.verified_by } : {}),
      ...(parsed.subject ? { subject: parsed.subject } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * AuthorIdentity を localStorage に保存する。
 * バリデーション失敗時は例外を投げる（呼び出し側で UI 表示）。
 */
export function saveAuthorIdentity(identity: AuthorIdentity): void {
  const validation = validateAuthorIdentity(identity);
  if (!validation.ok) {
    throw new Error(`Invalid identity: ${validation.field} — ${validation.reason}`);
  }
  const normalized: AuthorIdentity = {
    ...identity,
    name: identity.name.trim(),
    email: identity.email.trim(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

/** 登録済み identity を削除する（テスト / 退会用） */
export function clearAuthorIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 現在の identity が登録済みかどうか。
 * Share 操作前のチェック等で使う想定。
 */
export function hasAuthorIdentity(): boolean {
  return loadAuthorIdentity() !== null;
}
