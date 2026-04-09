// URL ブックマーク登録モーダル
// 外部 URL を入力し、メタデータを取得してアセットとして登録する

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Loader2, ExternalLink } from "lucide-react";
import { useT } from "../../i18n";
import {
  fetchUrlMetadata,
  generateUrlBookmarkId,
  getFaviconUrl,
  extractDomain,
} from "./media-index";
import type { MediaIndexEntry } from "./media-index";

export type UrlBookmarkModalProps = {
  onRegister: (entry: MediaIndexEntry) => void;
  onClose: () => void;
};

export function UrlBookmarkModal({ onRegister, onClose }: UrlBookmarkModalProps) {
  const t = useT();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [ogImage, setOgImage] = useState<string | undefined>();
  const [domain, setDomain] = useState("");
  const [registering, setRegistering] = useState(false);
  // 自動取得済み URL を追跡（同じ URL で再取得しないため）
  const lastFetchedUrl = useRef("");

  /** URL が有効かどうか */
  const isValidUrl = useCallback((value: string) => {
    try {
      new URL(value.trim());
      return true;
    } catch {
      return false;
    }
  }, []);

  // メタデータを取得
  const doFetch = useCallback(async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed || !isValidUrl(trimmed)) return;
    if (lastFetchedUrl.current === trimmed) return;
    lastFetchedUrl.current = trimmed;
    setFetching(true);
    try {
      const meta = await fetchUrlMetadata(trimmed);
      setTitle(meta.title);
      setDescription(meta.description ?? "");
      setOgImage(meta.ogImage);
      setDomain(meta.domain);
      setFetched(true);
    } finally {
      setFetching(false);
    }
  }, [isValidUrl]);

  // URL が有効な値に変わったら自動取得（ペースト・入力完了時）
  useEffect(() => {
    const trimmed = url.trim();
    if (!isValidUrl(trimmed) || lastFetchedUrl.current === trimmed) return;
    // 短いデバウンス（ペーストは即座に、手入力は少し待つ）
    const timer = setTimeout(() => doFetch(trimmed), 300);
    return () => clearTimeout(timer);
  }, [url, isValidUrl, doFetch]);

  // URL 変更時にリセット
  const handleUrlChange = useCallback((value: string) => {
    setUrl(value);
    if (lastFetchedUrl.current && lastFetchedUrl.current !== value.trim()) {
      setFetched(false);
    }
  }, []);

  // ESC / Enter
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  // 登録
  const handleRegister = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setRegistering(true);
    try {
      const d = domain || extractDomain(trimmed);
      const entry: MediaIndexEntry = {
        fileId: generateUrlBookmarkId(),
        name: title.trim() || d,
        type: "url",
        mimeType: "text/x-uri",
        url: trimmed,
        thumbnailUrl: getFaviconUrl(d),
        uploadedAt: new Date().toISOString(),
        usedIn: [],
        urlMeta: {
          domain: d,
          description: description.trim() || undefined,
          ogImage,
        },
      };
      onRegister(entry);
    } finally {
      setRegistering(false);
    }
  }, [url, title, description, domain, ogImage, onRegister]);

  const urlValid = isValidUrl(url);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-popover border border-border rounded-lg shadow-lg w-full max-w-md mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Link size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              {t("asset.urlRegisterTitle")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none px-1"
          >
            ✕
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-5 space-y-4">
          {/* URL 入力 */}
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">URL</label>
            <div className="relative">
              <input
                type="url"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://example.com/article"
                autoFocus
                className="w-full text-xs px-3 py-2 pr-8 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
              />
              {fetching && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          {/* メタデータプレビュー（取得後に表示） */}
          {fetched && (
            <>
              {/* タイトル */}
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">
                  {t("asset.urlTitle")}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded border border-border bg-background text-foreground outline-none focus:border-primary transition-colors"
                />
              </div>

              {/* 説明 */}
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">
                  {t("asset.urlDescription")}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder={t("asset.urlDescriptionPlaceholder")}
                  className="w-full text-xs px-3 py-2 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none"
                />
              </div>

              {/* プレビューカード */}
              <div className="border border-border rounded-md p-3 bg-muted/30">
                <div className="flex items-start gap-3">
                  <img
                    src={getFaviconUrl(domain)}
                    alt=""
                    className="w-8 h-8 rounded mt-0.5"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {title || domain}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {domain}
                    </p>
                    {description && (
                      <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                        {description}
                      </p>
                    )}
                  </div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        {/* フッター */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded border border-border text-foreground hover:bg-muted transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleRegister}
            disabled={!urlValid || fetching || registering}
            className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {registering ? t("asset.urlRegistering") : t("asset.urlRegister")}
          </button>
        </div>
      </div>
    </div>
  );
}
