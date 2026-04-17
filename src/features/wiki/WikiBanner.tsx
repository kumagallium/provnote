// Wiki ドキュメント用バナー
// エディタ上部に表示: AI 生成バッジ、ステータス、由来ノート、アクションボタン

import { Bot, Check, RefreshCw, Trash2 } from "lucide-react";
import type { WikiMeta } from "../../lib/document-types";

type Props = {
  wikiMeta: WikiMeta;
  onApprove: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  loading?: boolean;
};

/** 日付をフォーマット */
function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function WikiBanner({
  wikiMeta,
  onApprove,
  onRegenerate,
  onDelete,
  loading = false,
}: Props) {
  const isDraft = wikiMeta.status === "draft";
  const kindLabel = wikiMeta.kind === "summary" ? "Summary" : "Concept";

  return (
    <div className="mx-4 mt-2 mb-1 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        {/* AI バッジ */}
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          <Bot size={12} />
          AI {kindLabel}
        </span>

        {/* ステータスバッジ */}
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
            isDraft
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          }`}
        >
          {isDraft ? "Draft" : "Published"}
        </span>

        {/* 生成日 */}
        <span className="text-[10px] text-muted-foreground">
          {formatDate(wikiMeta.generatedAt)}
        </span>

        {/* モデル */}
        {wikiMeta.generatedBy?.model && (
          <span className="text-[10px] text-muted-foreground/60">
            {wikiMeta.generatedBy.model}
          </span>
        )}

        <div className="flex-1" />

        {/* アクションボタン */}
        <div className="flex items-center gap-1">
          {isDraft && (
            <button
              onClick={onApprove}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
              title="Approve (Draft → Published)"
            >
              <Check size={12} />
              Approve
            </button>
          )}
          <button
            onClick={onRegenerate}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Regenerate"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={onDelete}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* 由来ノート */}
      {wikiMeta.derivedFromNotes.length > 0 && (
        <div className="mt-1 text-[10px] text-muted-foreground/70">
          Source: {wikiMeta.derivedFromNotes.length} note(s)
        </div>
      )}
    </div>
  );
}
