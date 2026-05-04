// ゴミ箱ビュー
// deletedAt が設定されているインデックスエントリを表示し、復元・完全削除を行う。
// PROV-DM 参照数を表示し、参照ありエントリの完全削除には強い警告を出す。

import { useMemo, useState } from "react";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import type { GraphiumIndex, NoteIndexEntry } from "./index-file";
import { findIncomingReferences } from "./index-file";
import { useT } from "../../i18n";
import { Breadcrumb } from "../../components/Breadcrumb";

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

// 完全削除確認ダイアログ。参照がある場合は参照元一覧を表示する
function PermanentDeleteDialog({
  count,
  refsBreakdown,
  onConfirm,
  onCancel,
  busy,
}: {
  count: number;
  /** 削除対象ノートと、それぞれを参照しているノート一覧 */
  refsBreakdown: { note: NoteIndexEntry; referrers: NoteIndexEntry[] }[];
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const t = useT();
  const totalRefs = refsBreakdown.reduce((sum, r) => sum + r.referrers.length, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-popover border border-border rounded-lg shadow-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-start gap-2 mb-2">
          {totalRefs > 0 && (
            <AlertTriangle size={16} className="text-destructive shrink-0 mt-0.5" />
          )}
          <h3 className="text-sm font-semibold text-foreground">
            {t("trash.permanentDeleteTitle", { count: String(count) })}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {t("trash.permanentDeleteMessage")}
        </p>
        {totalRefs > 0 && (
          <div className="mb-3 p-2 rounded border border-destructive/30 bg-destructive/5">
            <p className="text-xs text-destructive font-semibold mb-1">
              {t("trash.refsWillBreak", { total: String(totalRefs) })}
            </p>
            <ul className="text-xs text-foreground/70 space-y-1 max-h-40 overflow-y-auto">
              {refsBreakdown
                .filter((r) => r.referrers.length > 0)
                .map(({ note, referrers }) => (
                  <li key={note.noteId}>
                    <span className="font-medium">{note.title || t("nav.untitled")}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      ← {referrers.map((r) => r.title || t("nav.untitled")).join(", ")}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {t("nav.deleteConfirmCancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            {busy ? t("nav.deleting") : t("trash.permanentDeleteConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TrashView({
  rawNoteIndex,
  trashedNotes,
  onBack,
  onRestore,
  onPermanentDelete,
}: {
  rawNoteIndex: GraphiumIndex | null;
  trashedNotes: NoteIndexEntry[];
  onBack: () => void;
  onRestore: (noteIds: string[]) => Promise<void>;
  onPermanentDelete: (noteIds: string[]) => Promise<void>;
}) {
  const t = useT();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string[] | null>(null);

  // 参照数の事前計算（noteId → 参照元エントリ配列）
  const refMap = useMemo(() => {
    const map = new Map<string, NoteIndexEntry[]>();
    for (const note of trashedNotes) {
      map.set(note.noteId, findIncomingReferences(rawNoteIndex, note.noteId));
    }
    return map;
  }, [rawNoteIndex, trashedNotes]);

  // 削除日時の新しい順（trashed の deletedAt 降順）
  const sorted = useMemo(() => {
    return [...trashedNotes].sort((a, b) => {
      const ta = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
      const tb = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
      return tb - ta;
    });
  }, [trashedNotes]);

  const toggleAll = () => {
    if (selectedIds.size === sorted.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(sorted.map((n) => n.noteId)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRestoreClick = async () => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      await onRestore([...selectedIds]);
      setSelectedIds(new Set());
    } finally {
      setBusy(false);
    }
  };

  const requestPermanentDelete = (ids: string[]) => {
    if (ids.length === 0) return;
    setConfirmTarget(ids);
  };

  const handleConfirmDelete = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    try {
      await onPermanentDelete(confirmTarget);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of confirmTarget) next.delete(id);
        return next;
      });
      setConfirmTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const refsBreakdownForConfirm = useMemo(() => {
    if (!confirmTarget) return [];
    const set = new Set(confirmTarget);
    return sorted
      .filter((n) => set.has(n.noteId))
      .map((note) => ({ note, referrers: refMap.get(note.noteId) ?? [] }));
  }, [confirmTarget, sorted, refMap]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <Breadcrumb
          items={[
            { label: t("nav.home"), onClick: onBack },
            { label: t("nav.trash") },
          ]}
        />
      </div>
      <div className="px-6 py-3 border-b border-border flex items-center gap-2">
        <Trash2 size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          {t("nav.trash")}
        </h2>
        <span className="text-xs text-muted-foreground">
          {sorted.length > 0 ? `${sorted.length} ${t("trash.itemsCount")}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleRestoreClick}
            disabled={selectedIds.size === 0 || busy}
            className="px-2.5 py-1 text-xs rounded border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            <RotateCcw size={12} />
            {t("trash.restore")}
          </button>
          <button
            onClick={() => requestPermanentDelete([...selectedIds])}
            disabled={selectedIds.size === 0 || busy}
            className="px-2.5 py-1 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-40 flex items-center gap-1"
          >
            <Trash2 size={12} />
            {t("trash.permanentDelete")}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Trash2 size={32} className="opacity-30" />
            <p className="text-sm">{t("trash.empty")}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border">
              <tr className="text-xs text-muted-foreground">
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sorted.length && sorted.length > 0}
                    onChange={toggleAll}
                    aria-label={t("trash.selectAll")}
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">{t("trash.colTitle")}</th>
                <th className="px-3 py-2 text-left font-medium w-32">{t("trash.colDeletedAt")}</th>
                <th className="px-3 py-2 text-left font-medium w-24">{t("trash.colRefs")}</th>
                <th className="px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((note) => {
                const refs = refMap.get(note.noteId) ?? [];
                const isSelected = selectedIds.has(note.noteId);
                return (
                  <tr
                    key={note.noteId}
                    className={`border-b border-border/50 ${
                      isSelected ? "bg-muted/30" : "hover:bg-muted/20"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(note.noteId)}
                        aria-label={t("trash.selectRow")}
                      />
                    </td>
                    <td className="px-3 py-2 text-foreground truncate max-w-md">
                      {note.title || <span className="text-muted-foreground italic">{t("nav.untitled")}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDate(note.deletedAt)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {refs.length > 0 ? (
                        <span
                          title={refs.map((r) => r.title).join("\n")}
                          className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
                        >
                          <AlertTriangle size={10} />
                          {refs.length}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => requestPermanentDelete([note.noteId])}
                        disabled={busy}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                        title={t("trash.permanentDelete")}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {confirmTarget && (
        <PermanentDeleteDialog
          count={confirmTarget.length}
          refsBreakdown={refsBreakdownForConfirm}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmTarget(null)}
          busy={busy}
        />
      )}
    </div>
  );
}
