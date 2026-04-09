import { BookmarkBlock } from "./view";
import type { CustomBlockEntry } from "../../base/schema";

// ブロック登録エントリー
export const bookmarkBlock: CustomBlockEntry = {
  type: "bookmark",
  spec: BookmarkBlock,
};

// スラッシュメニューからピッカーを開くグローバルコールバック
let bookmarkPickerCallback: (() => void) | null = null;

export function setBookmarkPickerCallback(cb: (() => void) | null) {
  bookmarkPickerCallback = cb;
}

// スラッシュメニュー用アイテム（ピッカーモーダルを開く）
export const bookmarkSlashItem = {
  title: "Bookmark",
  subtext: "URL をカード形式で表示",
  group: "メディア",
  onItemClick: () => {
    bookmarkPickerCallback?.();
  },
  aliases: ["bookmark", "link", "url", "ブックマーク", "リンク"],
};
