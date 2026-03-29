// ──────────────────────────────────────────────
// sampleScope カスタムブロック
//
// 試料ごとに独立した Block[] を持つコンテナブロック。
// タブ切替でアクティブな試料を変更し、
// ネストされた BlockNote エディタで内容を編集する。
// ──────────────────────────────────────────────

import { createReactBlockSpec } from "@blocknote/react";
import {
  useCreateBlockNote,
  BlockNoteViewRaw,
} from "@blocknote/react";
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSampleScope } from "./context";

// ── 型定義 ──

/** props.samples をパースした型 */
export type SamplesMap = Record<string, any[]>;

/** props.skippedSamples をパースした型 */
export type SkippedSamplesMap = Record<string, string>;

// ── ヘルパー ──

function parseSamples(json: string): SamplesMap {
  try {
    return JSON.parse(json) || {};
  } catch {
    return {};
  }
}

function parseSkipped(json: string): SkippedSamplesMap {
  try {
    return JSON.parse(json) || {};
  } catch {
    return {};
  }
}

// ── ネストされたエディタコンポーネント ──

function NestedEditor({
  blocks,
  onChange,
}: {
  blocks: any[];
  onChange: (newBlocks: any[]) => void;
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

  return (
    <BlockNoteViewRaw
      editor={editor as any}
      theme="light"
      onChange={handleChange}
      // ネストエディタではサイドメニュー・スラッシュメニューを省略
      sideMenu={false}
      formattingToolbar={false}
    />
  );
}

// ── sampleScope コンポーネント ──

function SampleScopeRender(props: any) {
  const block = props.block;
  const editor = props.editor;

  const { sampleIds } = useSampleScope();
  const samples = useMemo(() => parseSamples(block.props.samples), [block.props.samples]);
  const skipped = useMemo(() => parseSkipped(block.props.skippedSamples), [block.props.skippedSamples]);

  const activeSampleId = block.props.activeSampleId || sampleIds[0] || "";

  // コンテキストメニュー制御
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sampleId: string } | null>(null);

  // タブ切替
  const switchTab = useCallback(
    (id: string) => {
      editor.updateBlock(block.id, {
        props: { activeSampleId: id },
      });
    },
    [editor, block.id],
  );

  // タブ内容更新（デバウンス付き）
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTabContentChange = useCallback(
    (newBlocks: any[]) => {
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
      <div style={{ padding: "8px 12px", minHeight: 48 }}>
        {activeSampleId in skipped ? (
          <div style={{ color: "#dc2626", fontSize: 13, fontStyle: "italic" }}>
            スキップ: {skipped[activeSampleId] || "（理由なし）"}
          </div>
        ) : null}
        <NestedEditor
          key={activeSampleId}
          blocks={activeBlocks}
          onChange={handleTabContentChange}
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
