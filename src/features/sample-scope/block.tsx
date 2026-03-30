// ──────────────────────────────────────────────
// sampleScope カスタムブロック
//
// 試料ごとに独立した Block[] を持つコンテナブロック。
// タブ切替でアクティブな試料を変更し、
// ネストされた BlockNote エディタで内容を編集する。
//
// ラベルは sampleLabels prop に試料別で保存する。
// グローバル labelStore は使わない（PROV 生成時に試料ごとに分離するため）。
// ──────────────────────────────────────────────

import {
  createReactBlockSpec,
  useCreateBlockNote,
  BlockNoteViewRaw,
  SuggestionMenuController,
} from "@blocknote/react";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSampleScope } from "./context";
import { buildSuggestionList } from "../context-label/hashtag-menu";

// ── 型定義 ──

/** props.samples をパースした型 */
export type SamplesMap = Record<string, any[]>;

/** props.skippedSamples をパースした型 */
export type SkippedSamplesMap = Record<string, string>;

/** props.sampleLabels をパースした型: sampleId → { blockId → label } */
export type SampleLabelsMap = Record<string, Record<string, string>>;

// ── ヘルパー ──

function parseSamples(json: string): SamplesMap {
  try { return JSON.parse(json) || {}; } catch { return {}; }
}

function parseSkipped(json: string): SkippedSamplesMap {
  try { return JSON.parse(json) || {}; } catch { return {}; }
}

function parseSampleLabels(json: string): SampleLabelsMap {
  try { return JSON.parse(json) || {}; } catch { return {}; }
}

// ── ラベルバッジ（タブ内に簡易表示） ──

const LABEL_COLORS: Record<string, string> = {
  "[手順]": "#2563eb",
  "[使用したもの]": "#059669",
  "[属性]": "#7c3aed",
  "[パターン]": "#d97706",
  "[結果]": "#dc2626",
};

function LabelBadge({ label }: { label: string }) {
  const color = LABEL_COLORS[label] ?? "#6b7280";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 600,
        color,
        background: `${color}14`,
        border: `1px solid ${color}40`,
        borderRadius: 3,
        padding: "0 4px",
        marginLeft: 6,
        verticalAlign: "middle",
        userSelect: "none",
      }}
    >
      {label}
    </span>
  );
}

// ── ネストされたエディタコンポーネント ──

function NestedEditor({
  blocks,
  onChange,
  onHashtagSelect,
  labels,
}: {
  blocks: any[];
  onChange: (newBlocks: any[]) => void;
  onHashtagSelect?: (blockId: string, label: string) => void;
  /** 現在のタブのラベル: blockId → label */
  labels: Record<string, string>;
}) {
  const schema = useMemo(
    () => BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs } as any }),
    [],
  );

  const editor = useCreateBlockNote({
    schema,
    initialContent: blocks.length > 0 ? (blocks as any) : undefined,
  });

  // ブロック変更時に親に通知
  const handleChange = useCallback(() => {
    const doc = editor.document;
    onChange(doc as any[]);
  }, [editor, onChange]);

  // # ラベルオートコンプリート
  const labelSuggestions = useMemo(() => buildSuggestionList(), []);
  const getHashtagItems = useCallback(
    async (query: string) => {
      const items = labelSuggestions.map((s) => ({
        title: s.displayName,
        group: s.group === "core" ? "コアラベル" : s.group === "alias" ? "エイリアス" : "フリーラベル",
        onItemClick: () => {
          const block = (editor as any).getTextCursorPosition?.()?.block;
          if (block && onHashtagSelect) {
            onHashtagSelect(block.id, s.label);
          }
        },
      }));
      return filterSuggestionItems(items as any, query) as any;
    },
    [editor, labelSuggestions, onHashtagSelect],
  );

  // ラベルバッジをオーバーレイ表示
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [badgePositions, setBadgePositions] = useState<{ blockId: string; label: string; top: number }[]>([]);

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container || Object.keys(labels).length === 0) {
      setBadgePositions([]);
      return;
    }

    // DOM が描画された後にバッジ位置を計算
    const timer = setTimeout(() => {
      const positions: { blockId: string; label: string; top: number }[] = [];
      const containerRect = container.getBoundingClientRect();

      for (const [blockId, label] of Object.entries(labels)) {
        // BlockNote は data-id 属性でブロック ID を持つ
        const el = container.querySelector(`[data-id="${blockId}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          positions.push({
            blockId,
            label,
            top: rect.top - containerRect.top,
          });
        }
      }
      setBadgePositions(positions);
    }, 100);

    return () => clearTimeout(timer);
  }, [labels, blocks]);

  return (
    <div ref={editorContainerRef} style={{ position: "relative" }}>
      {/* ラベルバッジオーバーレイ */}
      {badgePositions.map(({ blockId, label, top }) => (
        <div
          key={blockId}
          style={{
            position: "absolute",
            right: 4,
            top: top + 2,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <LabelBadge label={label} />
        </div>
      ))}

      <BlockNoteViewRaw
        editor={editor as any}
        theme="light"
        onChange={handleChange}
        sideMenu={false}
        formattingToolbar={false}
      >
        {onHashtagSelect && (
          <SuggestionMenuController
            triggerCharacter="#"
            getItems={getHashtagItems as any}
            {...({} as any)}
          />
        )}
      </BlockNoteViewRaw>
    </div>
  );
}

// ── sampleScope コンポーネント ──

function SampleScopeRender(props: any) {
  const block = props.block;
  const editor = props.editor;

  const { sampleIds } = useSampleScope();
  const samples = useMemo(() => parseSamples(block.props.samples), [block.props.samples]);
  const skipped = useMemo(() => parseSkipped(block.props.skippedSamples), [block.props.skippedSamples]);
  const sampleLabels = useMemo(() => parseSampleLabels(block.props.sampleLabels), [block.props.sampleLabels]);

  const activeSampleId = block.props.activeSampleId || sampleIds[0] || "";

  // 現在のタブのラベル
  const activeLabels = sampleLabels[activeSampleId] || {};

  // コンテキストメニュー制御
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sampleId: string } | null>(null);

  // ネストエディタの最新コンテンツを追跡（タブ切替時のフラッシュ用）
  const lastContentRef = useRef<any[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // タブ切替: 現在のコンテンツを即座に保存してから切替
  const switchTab = useCallback(
    (id: string) => {
      // デバウンス中のタイマーをキャンセル
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      // 現在タブのコンテンツを即座に保存 + タブ切替を同時に行う
      const currentSamples = parseSamples(block.props.samples);
      currentSamples[activeSampleId] = lastContentRef.current;
      editor.updateBlock(block.id, {
        props: {
          samples: JSON.stringify(currentSamples),
          activeSampleId: id,
        },
      });
    },
    [editor, block.id, block.props.samples, activeSampleId],
  );

  // タブ内容更新（デバウンス付き）
  const handleTabContentChange = useCallback(
    (newBlocks: any[]) => {
      lastContentRef.current = newBlocks;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const updated = { ...parseSamples(block.props.samples), [activeSampleId]: newBlocks };
        editor.updateBlock(block.id, {
          props: { samples: JSON.stringify(updated) },
        });
      }, 300);
    },
    [editor, block.id, block.props.samples, activeSampleId],
  );

  // ラベル設定（sampleLabels prop に試料別で保存）
  const handleHashtagSelect = useCallback(
    (blockId: string, label: string) => {
      const current = parseSampleLabels(block.props.sampleLabels);
      if (!current[activeSampleId]) current[activeSampleId] = {};
      current[activeSampleId][blockId] = label;
      editor.updateBlock(block.id, {
        props: { sampleLabels: JSON.stringify(current) },
      });
    },
    [editor, block.id, block.props.sampleLabels, activeSampleId],
  );

  // 右クリックでスキップ/スキップ解除
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, sampleId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, sampleId });
    },
    [],
  );

  const handleSkip = useCallback(
    (sampleId: string) => {
      const reason = window.prompt("スキップ理由（任意）") ?? "";
      const updated = { ...parseSkipped(block.props.skippedSamples), [sampleId]: reason };
      editor.updateBlock(block.id, {
        props: { skippedSamples: JSON.stringify(updated) },
      });
      setContextMenu(null);
    },
    [editor, block.id, block.props.skippedSamples],
  );

  const handleUnskip = useCallback(
    (sampleId: string) => {
      const current = parseSkipped(block.props.skippedSamples);
      delete current[sampleId];
      editor.updateBlock(block.id, {
        props: { skippedSamples: JSON.stringify(current) },
      });
      setContextMenu(null);
    },
    [editor, block.id, block.props.skippedSamples],
  );

  // コンテキストメニュー外クリックで閉じる
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  // 試料 ID がない場合のフォールバック
  if (sampleIds.length === 0) {
    return (
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 6,
          background: "#f8f9fa",
          border: "1px dashed #d0d5dd",
          color: "#667085",
          fontSize: 13,
        }}
        contentEditable={false}
      >
        試料テーブル（[パターン] ラベル）がノート内に見つかりません
      </div>
    );
  }

  const activeBlocks = samples[activeSampleId] || [];

  return (
    <div
      style={{
        borderRadius: 6,
        border: "1px solid #e0e7ef",
        background: "#f8fafc",
        margin: "4px 0",
        width: "100%",
      }}
      contentEditable={false}
    >
      {/* タブバー */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid #e0e7ef",
          padding: "0 4px",
          overflowX: "auto",
        }}
      >
        {sampleIds.map((id) => {
          const isActive = id === activeSampleId;
          const isSkipped = id in skipped;
          return (
            <button
              key={id}
              onClick={() => switchTab(id)}
              onContextMenu={(e) => handleContextMenu(e, id)}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#1a56db" : "#667085",
                background: isActive ? "#fff" : "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid #1a56db" : "2px solid transparent",
                cursor: "pointer",
                textDecoration: isSkipped ? "line-through" : "none",
                opacity: isSkipped ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {id}
              {isSkipped && (
                <span style={{ marginLeft: 4, fontSize: 11, color: "#dc2626" }}>
                  (skip)
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* コンテキストメニュー */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            background: "#fff",
            border: "1px solid #d0d5dd",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            zIndex: 9999,
            padding: "4px 0",
            minWidth: 140,
          }}
        >
          {contextMenu.sampleId in skipped ? (
            <button
              onClick={() => handleUnskip(contextMenu.sampleId)}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 12px",
                fontSize: 13,
                textAlign: "left",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              スキップ解除
            </button>
          ) : (
            <button
              onClick={() => handleSkip(contextMenu.sampleId)}
              style={{
                display: "block",
                width: "100%",
                padding: "6px 12px",
                fontSize: 13,
                textAlign: "left",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              スキップ
            </button>
          )}
        </div>
      )}

      {/* アクティブタブの内容 */}
      <div className="sample-scope-content" style={{ padding: "4px 8px", minHeight: 40 }}>
        {activeSampleId in skipped ? (
          <div style={{ color: "#dc2626", fontSize: 13, fontStyle: "italic", padding: "4px 8px" }}>
            スキップ: {skipped[activeSampleId] || "（理由なし）"}
          </div>
        ) : null}
        {/* ネストエディタのインデントを除去するスタイル */}
        <style>{`
          .sample-scope-content .bn-editor {
            padding-left: 0 !important;
          }
          .sample-scope-content .bn-block-group {
            padding-left: 0 !important;
            margin-left: 0 !important;
          }
          .sample-scope-content .bn-block-content {
            padding: 2px 0 !important;
          }
        `}</style>
        <NestedEditor
          key={activeSampleId}
          blocks={activeBlocks}
          onChange={handleTabContentChange}
          onHashtagSelect={handleHashtagSelect}
          labels={activeLabels}
        />
      </div>
    </div>
  );
}

// ── BlockNote カスタムブロック定義 ──

export const SampleScopeBlock = createReactBlockSpec(
  {
    type: "sampleScope" as const,
    propSchema: {
      // 試料ごとの Block[] を JSON 文字列で格納
      samples: { default: "{}" as string },
      // 現在アクティブな試料タブ
      activeSampleId: { default: "" as string },
      // スキップされた試料とその理由
      skippedSamples: { default: "{}" as string },
      // 試料ごとのラベル: { sampleId: { blockId: label } }
      sampleLabels: { default: "{}" as string },
    },
    content: "none" as const,
  },
  {
    render: SampleScopeRender,
  },
);

// ── CustomBlockEntry 形式でエクスポート ──

export const sampleScopeBlockEntry = {
  type: "sampleScope",
  spec: SampleScopeBlock,
};
