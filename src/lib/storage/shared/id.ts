// SharedEntry の ID 生成。
//
// 採用: uuidv7（時系列ソート可能、生成時刻が prefix）。
// 設計詳細: docs/internal/team-shared-storage-design.md §stable ID 設計

import { uuidv7 } from "uuidv7";

/** 新規 SharedEntry の ID を生成する。 */
export function newSharedId(): string {
  return uuidv7();
}

/**
 * uuidv7 形式の妥当性をチェックする。
 * - 全長 36 文字、ハイフン位置固定
 * - version nibble が 7
 * - variant が RFC 4122（10xx）
 *
 * 想定: 外部から受け取った id（共有フォルダから読み込んだメタデータ等）の
 * 簡易検証。ストレージは信頼できる前提なのでこれ以上は厳密化しない。
 */
export function isValidSharedId(id: string): boolean {
  if (typeof id !== "string" || id.length !== 36) return false;
  // xxxxxxxx-xxxx-7xxx-Nxxx-xxxxxxxxxxxx where N ∈ {8,9,a,b}
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return re.test(id);
}
