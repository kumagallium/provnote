// URL ペースト時のスタイル選択メニュー
// ペーストされた URL を「ブックマーク」か「リンク（そのまま）」か選択する

import { useEffect, useRef } from "react";
import { Link, ExternalLink } from "lucide-react";
import { useT } from "../../i18n";

export type UrlPasteMenuProps = {
  url: string;
  /** メニュー表示位置（ペースト時のカーソル位置） */
  position: { x: number; y: number };
  onSelectBookmark: () => void;
  onSelectLink: () => void;
  onDismiss: () => void;
};

export function UrlPasteMenu({
  url,
  position,
  onSelectBookmark,
  onSelectLink,
  onDismiss,
}: UrlPasteMenuProps) {
  const t = useT();
  const menuRef = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    // 少し遅延して登録（ペーストイベントと競合しないため）
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKeyDown);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  // 画面外にはみ出さないよう調整
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 220),
    top: Math.min(position.y + 4, window.innerHeight - 120),
    zIndex: 100,
  };

  return (
    <div ref={menuRef} style={style}>
      <div className="bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[200px]">
        <div className="px-3 py-1.5 text-[10px] text-muted-foreground truncate max-w-[200px]">
          {url}
        </div>
        <div className="border-t border-border my-0.5" />
        <button
          onClick={onSelectBookmark}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
        >
          <ExternalLink size={14} className="text-muted-foreground shrink-0" />
          <div className="text-left">
            <div className="font-medium">{t("asset.urlStyleBookmark")}</div>
            <div className="text-[10px] text-muted-foreground">{t("asset.urlStyleBookmarkSub")}</div>
          </div>
        </button>
        <button
          onClick={onSelectLink}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
        >
          <Link size={14} className="text-muted-foreground shrink-0" />
          <div className="text-left">
            <div className="font-medium">{t("asset.urlStyleLink")}</div>
            <div className="text-[10px] text-muted-foreground">{t("asset.urlStyleLinkSub")}</div>
          </div>
        </button>
      </div>
    </div>
  );
}
