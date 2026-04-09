import { BookmarkBlock } from "./view";
import type { CustomBlockEntry } from "../../base/schema";

// ブロック登録エントリー
export const bookmarkBlock: CustomBlockEntry = {
  type: "bookmark",
  spec: BookmarkBlock,
};

// スラッシュメニュー用の挿入アイテム
export const bookmarkSlashItem = {
  title: "Bookmark",
  subtext: "URL をカード形式で表示",
  group: "メディア",
  onItemClick: (editor: any) => {
    editor.insertBlocks(
      [{ type: "bookmark", props: { url: "", title: "", description: "", ogImage: "", domain: "" } }],
      editor.getTextCursorPosition().block,
      "after",
    );
  },
  aliases: ["bookmark", "link", "url", "ブックマーク", "リンク"],
};
