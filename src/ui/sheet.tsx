// Crucible デザインシステム — Sheet（サイドドロワー）
// モバイルでサイドバーをオーバーレイ表示するためのコンポーネント

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type SheetProps = {
  /** ドロワーの開閉状態 */
  open: boolean;
  /** 閉じるコールバック */
  onClose: () => void;
  /** スライド方向 */
  side?: "left" | "right";
  children: React.ReactNode;
  className?: string;
};

export function Sheet({ open, onClose, side = "left", children, className }: SheetProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    // モバイルでドロワーが開いている間、背景スクロールを防止
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9998]">
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/40 animate-fade-in"
        onClick={onClose}
      />
      {/* ドロワーコンテンツ */}
      <div
        className={cn(
          "absolute top-0 bottom-0 bg-sidebar-background border-sidebar-border flex flex-col overflow-hidden",
          side === "left"
            ? "left-0 border-r animate-slide-in-left"
            : "right-0 border-l animate-slide-in-right",
          "w-[280px] max-w-[85vw]",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
