// ラベルバッジのストーリー
// A方式: SideMenu 内（+ の左側）にラベルバッジを配置
// 制約: SideMenu の x 座標はネストに関わらずエディタ左端で固定（BlockNote の仕様）

import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CORE_LABELS } from "./labels";

// ── 色定義 ──
const LABEL_COLORS: Record<string, string> = {
  "[手順]": "#3b82f6",
  "[使用したもの]": "#10b981",
  "[条件]": "#f59e0b",
  "[試料]": "#8b5cf6",
  "[結果]": "#ef4444",
};

function getLabelColor(label: string): string {
  return LABEL_COLORS[label] ?? "#6b7280";
}

// ── バッジコンポーネント ──
function LabelBadge({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  const color = getLabelColor(label);
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0px 5px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        backgroundColor: color + "18",
        color: color,
        border: `1px solid ${color}38`,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        lineHeight: 1.6,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ── SideMenu ボタン ──
const btnBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  borderRadius: 4,
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "#9ca3af",
  padding: 0,
};

function LabelButton() {
  return <button title="ラベルを付ける" style={{ ...btnBase, border: "1px dashed #d1d5db", fontSize: 12 }}>#</button>;
}
function LinkButton() {
  return <button title="リンク" style={{ ...btnBase, border: "1px dashed #bfdbfe", color: "#93c5fd", fontSize: 11 }}>🔗</button>;
}
function AddButton() {
  return <button style={{ ...btnBase, fontSize: 16 }}>+</button>;
}
function DragHandle() {
  return <button style={{ ...btnBase, cursor: "grab", fontSize: 10, letterSpacing: 1 }}>⠿</button>;
}

// SideMenu: [バッジ or #] [🔗] [+] [⠿]
function SideMenu({ label }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {label ? <LabelBadge label={label} /> : <LabelButton />}
      <LinkButton />
      <AddButton />
      <DragHandle />
    </div>
  );
}

// ── エディタ模擬: SideMenu は常にエディタ左端に固定 ──
// BlockNote の実際の挙動:
//   - SideMenu はエディタの左端に float（x 座標固定）
//   - ネストされたブロック（リスト項目）でも SideMenu の左位置は変わらない
//   - コンテンツのインデントのみブロックタイプに応じて変わる

const EDITOR_LEFT_MARGIN = 56; // BlockNote エディタの左マージン

function EditorBlock({
  label,
  children,
  indent = 0,
  visible = true,
}: {
  label?: string;
  children: React.ReactNode;
  indent?: number;
  visible?: boolean;
}) {
  return (
    <div style={{ position: "relative", minHeight: 28 }}>
      {/* SideMenu: エディタ左端に固定（indent に関係なく同じ位置） */}
      <div style={{
        position: "absolute",
        left: 0,
        top: 2,
        visibility: visible ? "visible" : "hidden",
      }}>
        <SideMenu label={label} />
      </div>
      {/* コンテンツ: インデントはコンテンツ側のみ */}
      <div style={{ marginLeft: EDITOR_LEFT_MARGIN + indent }}>
        {children}
      </div>
    </div>
  );
}

// ── ホバー対応版 ──
function HoverBlock({
  id,
  label,
  children,
  indent = 0,
  hoveredId,
  setHoveredId,
}: {
  id: string;
  label?: string;
  children: React.ReactNode;
  indent?: number;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
}) {
  const isHovered = hoveredId === id;
  return (
    <div
      onMouseEnter={() => setHoveredId(id)}
      onMouseLeave={() => setHoveredId(null)}
      style={{
        position: "relative",
        minHeight: 28,
        borderRadius: 4,
        background: isHovered ? "#f9fafb" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{
        position: "absolute",
        left: 0,
        top: 2,
        visibility: isHovered ? "visible" : "hidden",
      }}>
        <SideMenu label={label} />
      </div>
      <div style={{ marginLeft: EDITOR_LEFT_MARGIN + indent }}>
        {children}
      </div>
    </div>
  );
}

// テーブルスタイル
const thStyle: React.CSSProperties = {
  padding: "6px 12px", textAlign: "left", fontSize: 13, fontWeight: 600,
  borderBottom: "2px solid #d1d5db", color: "#374151",
};
const tdStyle: React.CSSProperties = {
  padding: "6px 12px", fontSize: 13, borderBottom: "1px solid #e5e7eb", color: "#374151",
};

// ── Meta ──
const meta: Meta = {
  title: "ContextLabel/LabelBadge",
  parameters: { layout: "padded" },
};
export default meta;

// 全ラベル一覧
export const AllLabels: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {CORE_LABELS.map((label) => (
        <LabelBadge key={label} label={label} onClick={() => alert(label)} />
      ))}
    </div>
  ),
};

// SideMenu のバリエーション
export const SideMenuVariants: StoryObj = {
  name: "SideMenu 表示パターン",
  render: () => (
    <div style={{ fontFamily: "Inter, sans-serif", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>ラベル未設定:</p>
        <SideMenu />
      </div>
      {CORE_LABELS.map((label) => (
        <div key={label}>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{label} 設定済み:</p>
          <SideMenu label={label} />
        </div>
      ))}
    </div>
  ),
};

// 静的表示 — SideMenu はネストに関わらず左端固定
export const NoteStatic: StoryObj = {
  name: "ノート風（静的表示）",
  render: () => (
    <div style={{ maxWidth: 800, fontFamily: "Inter, sans-serif" }}>
      <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 12, background: "#f3f4f6", padding: "8px 12px", borderRadius: 6 }}>
        SideMenu はネストされたブロックでもエディタ左端に固定（BlockNote の仕様）
      </p>

      <EditorBlock><h1 style={{ fontSize: 28, fontWeight: 700 }}>Cu粉末アニール実験</h1></EditorBlock>

      <EditorBlock label="[手順]">
        <h3 style={{ fontSize: 18, fontWeight: 600 }}>1. 封入する</h3>
      </EditorBlock>
      <EditorBlock label="[使用したもの]" indent={24}>
        <p>Cu粉末 1g</p>
      </EditorBlock>
      <EditorBlock label="[使用したもの]" indent={24}>
        <p>シリカ管</p>
      </EditorBlock>
      <EditorBlock label="[結果]" indent={24}>
        <p>封入されたCu粉末</p>
      </EditorBlock>

      <EditorBlock label="[手順]">
        <h3 style={{ fontSize: 18, fontWeight: 600 }}>2. アニールする</h3>
      </EditorBlock>
      <EditorBlock label="[試料]" indent={24}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th style={thStyle}>試料名</th><th style={thStyle}>温度</th><th style={thStyle}>時間</th></tr></thead>
          <tbody>
            <tr><td style={tdStyle}>sample_A</td><td style={tdStyle}>600℃</td><td style={tdStyle}>24h</td></tr>
            <tr><td style={tdStyle}>sample_B</td><td style={tdStyle}>700℃</td><td style={tdStyle}>24h</td></tr>
            <tr><td style={tdStyle}>sample_C</td><td style={tdStyle}>800℃</td><td style={tdStyle}>24h</td></tr>
          </tbody>
        </table>
      </EditorBlock>
      <EditorBlock label="[条件]" indent={24}>
        <p>昇温速度: 5℃/min</p>
      </EditorBlock>
      <EditorBlock label="[条件]" indent={24}>
        <p>冷却: 炉冷</p>
      </EditorBlock>

      <EditorBlock label="[手順]">
        <h3 style={{ fontSize: 18, fontWeight: 600 }}>3. 評価する</h3>
      </EditorBlock>
      <EditorBlock label="[結果]" indent={24}>
        <p>XRD測定により相同定を行う。</p>
      </EditorBlock>
    </div>
  ),
};

// ホバー操作デモ
export const NoteHoverDemo: StoryObj = {
  name: "ノート風（ホバー操作デモ）",
  render: () => {
    function Demo() {
      const [hovered, setHovered] = useState<string | null>(null);

      return (
        <div style={{ maxWidth: 800, fontFamily: "Inter, sans-serif" }}>
          <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 12, background: "#f3f4f6", padding: "8px 12px", borderRadius: 6 }}>
            ホバーで SideMenu 表示。ラベル未設定ブロック（4行目）は # ボタン。<br />
            SideMenu の左位置はインデントに関わらず固定。
          </p>

          <HoverBlock id="t" hoveredId={hovered} setHoveredId={setHovered}>
            <h1 style={{ fontSize: 28, fontWeight: 700 }}>Cu粉末アニール実験</h1>
          </HoverBlock>

          <HoverBlock id="s1" label="[手順]" hoveredId={hovered} setHoveredId={setHovered}>
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>1. 封入する</h3>
          </HoverBlock>
          <HoverBlock id="u1" label="[使用したもの]" indent={24} hoveredId={hovered} setHoveredId={setHovered}>
            <p>Cu粉末 1g</p>
          </HoverBlock>
          <HoverBlock id="u2" label="[使用したもの]" indent={24} hoveredId={hovered} setHoveredId={setHovered}>
            <p>シリカ管</p>
          </HoverBlock>
          <HoverBlock id="p1" indent={24} hoveredId={hovered} setHoveredId={setHovered}>
            <p style={{ color: "#6b7280" }}>真空封入管内で封入する。（ラベルなし）</p>
          </HoverBlock>
          <HoverBlock id="r1" label="[結果]" indent={24} hoveredId={hovered} setHoveredId={setHovered}>
            <p>封入されたCu粉末</p>
          </HoverBlock>

          <HoverBlock id="s2" label="[手順]" hoveredId={hovered} setHoveredId={setHovered}>
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>2. アニールする</h3>
          </HoverBlock>
          <HoverBlock id="st" label="[試料]" indent={24} hoveredId={hovered} setHoveredId={setHovered}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={thStyle}>試料名</th><th style={thStyle}>温度</th><th style={thStyle}>時間</th></tr></thead>
              <tbody>
                <tr><td style={tdStyle}>sample_A</td><td style={tdStyle}>600℃</td><td style={tdStyle}>24h</td></tr>
                <tr><td style={tdStyle}>sample_B</td><td style={tdStyle}>700℃</td><td style={tdStyle}>24h</td></tr>
                <tr><td style={tdStyle}>sample_C</td><td style={tdStyle}>800℃</td><td style={tdStyle}>24h</td></tr>
              </tbody>
            </table>
          </HoverBlock>
          <HoverBlock id="c1" label="[条件]" indent={24} hoveredId={hovered} setHoveredId={setHovered}>
            <p>昇温速度: 5℃/min</p>
          </HoverBlock>
          <HoverBlock id="c2" label="[条件]" indent={24} hoveredId={hovered} setHoveredId={setHovered}>
            <p>冷却: 炉冷</p>
          </HoverBlock>

          <HoverBlock id="s3" label="[手順]" hoveredId={hovered} setHoveredId={setHovered}>
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>3. 評価する</h3>
          </HoverBlock>
          <HoverBlock id="r2" label="[結果]" indent={24} hoveredId={hovered} setHoveredId={setHovered}>
            <p>XRD測定により相同定を行う。</p>
          </HoverBlock>
        </div>
      );
    }
    return <Demo />;
  },
};
