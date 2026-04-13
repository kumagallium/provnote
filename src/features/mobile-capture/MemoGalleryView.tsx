// PC 向けメモギャラリービュー
// サイドバーの「メモ」クリックで表示。カード一覧 + エディタへの挿入 + ネットワーク図

import { useCallback, useEffect, useRef, useState } from "react";
import { StickyNote, Trash2, ClipboardCopy, Network } from "lucide-react";
import cytoscape from "cytoscape";
import { ensureCytoscapePlugins } from "../../lib/cytoscape-setup";
import type { CaptureIndex, CaptureEntry } from "./capture-store";
import { formatRelativeTime } from "../navigation/recent-notes-store";
import { useT } from "../../i18n";
import { Modal, ModalHeader, ModalBody } from "../../ui/modal";

// fcose レイアウト登録
ensureCytoscapePlugins();

// ── ネットワーク図 ──

const GRAPH_BG = "#fafdf7";
const MEMO_COLOR = "#c08b3e";
const NOTE_COLOR = "#5b8fb9";
const EDGE_COLOR = "#d4c9a8";

const networkStyle: cytoscape.StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-wrap": "wrap",
      "text-max-width": "120px",
      "font-size": "11px",
      "font-family": "Inter, system-ui, sans-serif",
      "text-valign": "bottom",
      "text-margin-y": 6,
      "background-color": "data(color)",
      width: "data(size)",
      height: "data(size)",
      "border-width": 2,
      "border-color": "data(borderColor)",
      color: "#6b7f6e",
      "transition-property": "background-color, border-color, opacity, width, height" as any,
      "transition-duration": 200,
    },
  },
  {
    selector: "node.hover",
    style: { "border-width": 3, "overlay-opacity": 0.06, "overlay-color": "#000" },
  },
  {
    selector: "node.faded",
    style: { opacity: 0.15 },
  },
  {
    selector: "edge",
    style: {
      width: 1.5,
      "line-color": EDGE_COLOR,
      "curve-style": "unbundled-bezier" as any,
      "control-point-distances": 30,
      "control-point-weights": 0.5,
      opacity: 1,
      "transition-property": "opacity, width, line-color" as any,
      "transition-duration": 200,
    },
  },
  {
    selector: "edge.hover-connected",
    style: { width: 2.5, "line-color": MEMO_COLOR, "z-index": 10 },
  },
  {
    selector: "edge.faded",
    style: { opacity: 0.08 },
  },
];

function MemoNetworkModal({
  open,
  onClose,
  captures,
}: {
  open: boolean;
  onClose: () => void;
  captures: CaptureEntry[];
}) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!open || !containerRef.current) return;

    const timer = setTimeout(() => {
      if (!containerRef.current) return;

      const elements: cytoscape.ElementDefinition[] = [];
      const noteIds = new Set<string>();

      // メモノードと、接続先のノートノード
      for (const cap of captures) {
        if (!cap.usedIn || cap.usedIn.length === 0) continue;
        // メモノード（先頭 20 文字）
        const memoLabel = cap.text.length > 20 ? cap.text.slice(0, 20) + "…" : cap.text;
        elements.push({
          data: {
            id: cap.id,
            label: memoLabel,
            color: MEMO_COLOR,
            borderColor: "#a67832",
            size: 34,
            isCenter: true,
          },
        });
        for (const usage of cap.usedIn) {
          if (!noteIds.has(usage.noteId)) {
            noteIds.add(usage.noteId);
            elements.push({
              data: {
                id: usage.noteId,
                label: usage.noteTitle,
                color: NOTE_COLOR,
                borderColor: "#4a7da6",
                size: 30,
                isCenter: false,
              },
            });
          }
          elements.push({
            data: {
              id: `${cap.id}->${usage.noteId}`,
              source: cap.id,
              target: usage.noteId,
            },
          });
        }
      }

      if (elements.length === 0) return;

      if (cyRef.current) cyRef.current.destroy();

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: networkStyle,
        layout: { name: "preset" },
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: false,
        wheelSensitivity: 0.3,
        minZoom: 0.3,
        maxZoom: 3,
      });

      const layout = cy.layout({
        name: "fcose",
        animate: true,
        animationDuration: 600,
        animationEasing: "ease-out-cubic" as any,
        quality: "default",
        randomize: true,
        nodeRepulsion: 5000,
        idealEdgeLength: 100,
        edgeElasticity: 0.45,
        gravity: 0.3,
        nodeSeparation: 60,
        padding: 30,
      } as any);
      layout.on("layoutstop", () => cy.fit(undefined, 20));
      layout.run();

      // ホバーエフェクト
      cy.on("mouseover", "node", (evt) => {
        const node = evt.target;
        const neighborhood = node.neighborhood();
        cy.elements().addClass("faded");
        node.removeClass("faded").addClass("hover");
        neighborhood.removeClass("faded");
        neighborhood.edges().addClass("hover-connected");
      });
      cy.on("mouseout", "node", () => {
        cy.elements().removeClass("faded hover hover-connected");
      });

      cyRef.current = cy;
    }, 50);

    return () => {
      clearTimeout(timer);
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [open, captures]);

  // usedIn のあるメモが1つもない場合
  const hasUsage = captures.some((c) => c.usedIn && c.usedIn.length > 0);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-[600px]">
        <ModalHeader onClose={onClose}>{t("memo.networkTitle")}</ModalHeader>
        <ModalBody className="p-0">
          {/* 凡例 */}
          <div className="px-4 py-2 border-b border-border flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MEMO_COLOR }} />
              {t("memo.title")}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: NOTE_COLOR }} />
              {t("nav.noteColumn")}
            </span>
          </div>
          {/* グラフ */}
          {hasUsage ? (
            <div ref={containerRef} className="w-full" style={{ height: 360, background: GRAPH_BG }} />
          ) : (
            <div className="flex items-center justify-center py-16" style={{ background: GRAPH_BG }}>
              <p className="text-xs text-muted-foreground">{t("memo.networkEmpty")}</p>
            </div>
          )}
        </ModalBody>
      </div>
    </Modal>
  );
}

// ── メモカード ──

function MemoCard({
  entry,
  onInsert,
  onDelete,
  insertDisabled,
}: {
  entry: CaptureEntry;
  onInsert?: () => void;
  onDelete?: () => void;
  insertDisabled?: boolean;
}) {
  const t = useT();
  const usedCount = entry.usedIn?.length ?? 0;

  return (
    <div className="bg-card border border-border rounded-lg p-4 group hover:border-primary/30 transition-colors">
      <p className="text-sm text-foreground whitespace-pre-wrap mb-2">
        {entry.text}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(entry.createdAt)}
          </span>
          {usedCount > 0 && (
            <span className="text-[10px] text-muted-foreground/60">
              {t("memo.usedCount", { count: String(usedCount) })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onInsert && (
            <button
              onClick={onInsert}
              disabled={insertDisabled}
              className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              title={t("memo.insert")}
            >
              <ClipboardCopy size={14} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title={t("common.delete")}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 挿入確認ダイアログ ──

function InsertConfirmDialog({
  onInsertAndKeep,
  onInsertAndDelete,
  onCancel,
}: {
  onInsertAndKeep: () => void;
  onInsertAndDelete: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-popover border border-border rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {t("memo.insertConfirmTitle")}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("memo.insertConfirmMessage")}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onInsertAndKeep}
            className="w-full px-3 py-2 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            {t("memo.insertAndKeep")}
          </button>
          <button
            onClick={onInsertAndDelete}
            className="w-full px-3 py-2 text-xs rounded border border-border text-foreground hover:bg-muted transition-colors"
          >
            {t("memo.insertAndDelete")}
          </button>
          <button
            onClick={onCancel}
            className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── メインコンポーネント ──

export function MemoGalleryView({
  captureIndex,
  loading,
  onBack,
  onInsertMemo,
  onDeleteMemo,
  insertDisabled,
}: {
  captureIndex: CaptureIndex | null;
  loading: boolean;
  onBack: () => void;
  onInsertMemo?: (captureId: string, text: string, deleteAfter: boolean) => void;
  onDeleteMemo?: (captureId: string) => void;
  insertDisabled?: boolean;
}) {
  const t = useT();
  const captures = captureIndex?.captures ?? [];
  const [pendingInsert, setPendingInsert] = useState<{ id: string; text: string } | null>(null);
  const [showNetwork, setShowNetwork] = useState(false);

  const hasUsage = captures.some((c) => c.usedIn && c.usedIn.length > 0);

  const handleInsertAndKeep = useCallback(() => {
    if (!pendingInsert || !onInsertMemo) return;
    onInsertMemo(pendingInsert.id, pendingInsert.text, false);
    setPendingInsert(null);
  }, [pendingInsert, onInsertMemo]);

  const handleInsertAndDelete = useCallback(() => {
    if (!pendingInsert || !onInsertMemo) return;
    onInsertMemo(pendingInsert.id, pendingInsert.text, true);
    setPendingInsert(null);
  }, [pendingInsert, onInsertMemo]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("common.back")}
        </button>
        <h1 className="text-base font-semibold text-foreground">{t("memo.title")}</h1>
        <span className="text-xs text-muted-foreground">
          {loading ? t("common.loading") : t("memo.count", { count: String(captures.length) })}
        </span>
        {/* ネットワーク図ボタン */}
        {hasUsage && (
          <button
            onClick={() => setShowNetwork(true)}
            className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={t("memo.networkTitle")}
          >
            <Network size={16} />
          </button>
        )}
      </div>

      {/* 挿入先のヒント */}
      {insertDisabled && captures.length > 0 && (
        <div className="px-6 py-2 bg-muted/50 border-b border-border">
          <p className="text-xs text-muted-foreground">{t("memo.insertHint")}</p>
        </div>
      )}

      {/* カード一覧 */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          </div>
        ) : captures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <StickyNote size={32} className="text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t("memo.emptyDesktop")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl">
            {captures.map((entry) => (
              <MemoCard
                key={entry.id}
                entry={entry}
                onInsert={onInsertMemo ? () => setPendingInsert({ id: entry.id, text: entry.text }) : undefined}
                onDelete={onDeleteMemo ? () => onDeleteMemo(entry.id) : undefined}
                insertDisabled={insertDisabled}
              />
            ))}
          </div>
        )}
      </div>

      {/* 挿入確認ダイアログ */}
      {pendingInsert && (
        <InsertConfirmDialog
          onInsertAndKeep={handleInsertAndKeep}
          onInsertAndDelete={handleInsertAndDelete}
          onCancel={() => setPendingInsert(null)}
        />
      )}

      {/* ネットワーク図モーダル */}
      <MemoNetworkModal
        open={showNetwork}
        onClose={() => setShowNetwork(false)}
        captures={captures}
      />
    </div>
  );
}
