// モバイル用ヘッダー（ハンバーガーメニュー + タイトル）

import { Menu } from "lucide-react";

type MobileHeaderProps = {
  onMenuToggle: () => void;
};

export function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  return (
    <header className="md:hidden flex items-center gap-3 px-3 py-2 border-b border-border bg-sidebar-background shrink-0">
      <button
        onClick={onMenuToggle}
        className="w-11 h-11 flex items-center justify-center rounded-lg text-foreground hover:bg-surface-hover transition-colors"
        aria-label="メニューを開く"
      >
        <Menu size={22} />
      </button>
      <div className="flex items-center gap-2">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="w-6 h-6" />
        <img src={`${import.meta.env.BASE_URL}logo-text.png`} alt="Graphium" className="h-4" />
      </div>
    </header>
  );
}
