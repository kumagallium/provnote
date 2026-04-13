// モバイル専用クイックキャプチャビュー
// データ一覧をカード形式で表示し、付箋テキストを素早く投稿できる

import { useCallback, useEffect, useMemo, useState } from "react";
import { StickyNote, Plus, Trash2 } from "lucide-react";
import {
  IndexFileNoteListSource,
  type NoteListEntry,
} from "../navigation/note-list-source";
import type { GraphiumIndex } from "../navigation/index-file";
import { formatRelativeTime } from "../navigation/recent-notes-store";
import { useT, getDisplayLabelName } from "../../i18n";
import { CaptureDialog } from "./CaptureDialog";

// ラベル色マッピング（NoteListView と同じ）
const LABEL_HEX: Record<string, string> = {
  "[手順]": "#5b8fb9",
  "[使用したもの]": "#4B7A52",
  "[結果]": "#c26356",
  "[属性]": "#c08b3e",
  "[条件]": "#c08b3e",
};

// ノートカード（1枚分）
function NoteCard({
  entry,
  onOpen,
  onDelete,
}: {
  entry: NoteListEntry;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div
      className="relative bg-card border border-border rounded-lg p-3 active:bg-muted/50 transition-colors cursor-pointer"
      onClick={onOpen}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowDelete((v) => !v);
      }}
    >
      {/* タイトル */}
      <h3 className="text-sm font-medium text-foreground line-clamp-2 mb-1.5">
        {entry.title}
      </h3>

      {/* ラベル */}
      {entry.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {entry.labels.map((label) => {
            const color = LABEL_HEX[label] ?? "#8fa394";
            return (
              <span
                key={label}
                className="inline-block text-[10px] font-semibold rounded-full whitespace-nowrap"
                style={{
                  padding: "0px 5px",
                  backgroundColor: color + "18",
                  color,
                  border: `1px solid ${color}38`,
                  lineHeight: 1.5,
                }}
              >
                {getDisplayLabelName(label)}
              </span>
            );
          })}
        </div>
      )}

      {/* 更新日時 */}
      <p className="text-[10px] text-muted-foreground">
        {formatRelativeTime(entry.modifiedAt)}
      </p>

      {/* 削除ボタン（長押しで表示） */}
      {showDelete && onDelete && (
        <button
          className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
            setShowDelete(false);
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export function MobileCaptureView({
  noteIndex,
  onOpenNote,
  onCreateCapture,
  onDeleteNotes,
  creating,
}: {
  noteIndex: GraphiumIndex | null;
  onOpenNote: (noteId: string) => void;
  onCreateCapture: (text: string) => Promise<void>;
  onDeleteNotes?: (noteIds: string[]) => Promise<void>;
  creating: boolean;
}) {
  const [entries, setEntries] = useState<NoteListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const t = useT();

  // インデックスからノート一覧を構築
  useEffect(() => {
    if (!noteIndex) {
      setLoading(true);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const source = new IndexFileNoteListSource(noteIndex);
      const result = await source.loadNoteList();
      if (!cancelled) {
        setEntries(result);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteIndex]);

  // 更新日時でソート（新しい順）
  const sorted = useMemo(() => {
    return [...entries].sort(
      (a, b) =>
        new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    );
  }, [entries]);

  // キャプチャ送信
  const handleSubmit = useCallback(
    async (text: string) => {
      await onCreateCapture(text);
      setShowCaptureDialog(false);
    },
    [onCreateCapture]
  );

  // 削除
  const handleDelete = useCallback(
    async (noteId: string) => {
      if (!onDeleteNotes) return;
      await onDeleteNotes([noteId]);
    },
    [onDeleteNotes]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-base font-semibold text-foreground">
          {t("capture.title")}
        </h1>
        <span className="text-xs text-muted-foreground">
          {loading
            ? t("nav.loadingNotes")
            : t("capture.count", { count: String(entries.length) })}
        </span>
      </div>

      {/* カード一覧 */}
      <div className="flex-1 overflow-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              {t("nav.loadingNotes")}
            </p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <StickyNote size={32} className="text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {t("capture.empty")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {sorted.map((entry) => (
              <NoteCard
                key={entry.noteId}
                entry={entry}
                onOpen={() => onOpenNote(entry.noteId)}
                onDelete={
                  onDeleteNotes ? () => handleDelete(entry.noteId) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* クイックキャプチャバー */}
      <div className="border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          onClick={() => setShowCaptureDialog(true)}
          disabled={creating}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm active:opacity-80 transition-opacity disabled:opacity-50"
        >
          <Plus size={18} />
          {creating ? t("capture.creating") : t("capture.newMemo")}
        </button>
      </div>

      {/* 付箋入力ダイアログ */}
      {showCaptureDialog && (
        <CaptureDialog
          onSubmit={handleSubmit}
          onClose={() => setShowCaptureDialog(false)}
          submitting={creating}
        />
      )}
    </div>
  );
}
