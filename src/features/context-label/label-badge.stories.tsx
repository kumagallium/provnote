// ラベルバッジのストーリー
// デザイン議論用: 配置方式・サイズ・色のバリエーションを確認

import type { Meta, StoryObj } from "@storybook/react-vite";
import { CORE_LABELS } from "./labels";

// ラベルの色定義（ui.tsx と同じ）
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

// ── バッジコンポーネント（単体表示用） ──
function LabelBadge({
  label,
  size = "default",
  onClick,
}: {
  label: string;
  size?: "small" | "default" | "large";
  onClick?: () => void;
}) {
  const color = getLabelColor(label);
  const sizeStyles = {
    small: { fontSize: 10, padding: "0px 4px" },
    default: { fontSize: 11, padding: "1px 6px" },
    large: { fontSize: 13, padding: "2px 8px" },
  };

  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        borderRadius: 4,
        fontWeight: 600,
        backgroundColor: color + "18",
        color: color,
        border: `1px solid ${color}38`,
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        lineHeight: 1.6,
        whiteSpace: "nowrap",
        ...sizeStyles[size],
      }}
    >
      {label}
    </span>
  );
}

// ── ブロック内での配置シミュレーション ──
function BlockWithLabel({
  label,
  text,
  blockType = "heading",
  placement = "gutter",
}: {
  label: string;
  text: string;
  blockType?: "heading" | "paragraph" | "list";
  placement: "gutter" | "inline" | "above";
}) {
  const gutterWidth = 90;

  // ガター方式: ブロック左マージンにバッジ
  if (placement === "gutter") {
    return (
      <div style={{ position: "relative", paddingLeft: gutterWidth, minHeight: 32 }}>
        <div style={{ position: "absolute", left: 0, top: 2 }}>
          <LabelBadge label={label} />
        </div>
        <BlockContent type={blockType} text={text} />
      </div>
    );
  }

  // インライン方式: テキスト先頭にバッジ
  if (placement === "inline") {
    return (
      <div>
        <BlockContent type={blockType} text={text} badge={<LabelBadge label={label} />} />
      </div>
    );
  }

  // 上方配置: ブロック上部にバッジ
  return (
    <div>
      <div style={{ marginBottom: 2 }}>
        <LabelBadge label={label} size="small" />
      </div>
      <BlockContent type={blockType} text={text} />
    </div>
  );
}

function BlockContent({
  type,
  text,
  badge,
}: {
  type: "heading" | "paragraph" | "list";
  text: string;
  badge?: React.ReactNode;
}) {
  if (type === "heading") {
    return <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{badge}{text}</h3>;
  }
  if (type === "list") {
    return (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li>{badge}{text}</li>
      </ul>
    );
  }
  return <p style={{ margin: 0 }}>{badge}{text}</p>;
}

// ── ストーリー定義 ──

const meta: Meta = {
  title: "ContextLabel/LabelBadge",
  parameters: {
    layout: "padded",
  },
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

// サイズバリエーション
export const Sizes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <LabelBadge label="[手順]" size="small" />
      <LabelBadge label="[手順]" size="default" />
      <LabelBadge label="[手順]" size="large" />
    </div>
  ),
};

// 配置方式の比較（メインの議論ポイント）
export const PlacementComparison: StoryObj = {
  name: "配置方式の比較",
  render: () => (
    <div style={{ maxWidth: 700, fontFamily: "Inter, sans-serif" }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "#374151" }}>
        配置方式の比較
      </h2>

      {/* ガター方式 */}
      <section style={{ marginBottom: 32, padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", marginBottom: 12 }}>
          A. ガター方式（ブロックハンドル右側）
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <BlockWithLabel label="[手順]" text="2.1 切る" blockType="heading" placement="gutter" />
          <BlockWithLabel label="[使用したもの]" text="玉ねぎ 中 2個（400g）" blockType="paragraph" placement="gutter" />
          <BlockWithLabel label="[条件]" text="くし切り、縦半分に切る" blockType="paragraph" placement="gutter" />
        </div>
      </section>

      {/* インライン方式 */}
      <section style={{ marginBottom: 32, padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", marginBottom: 12 }}>
          B. インライン方式（テキスト先頭）
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <BlockWithLabel label="[手順]" text="2.1 切る" blockType="heading" placement="inline" />
          <BlockWithLabel label="[使用したもの]" text="玉ねぎ 中 2個（400g）" blockType="paragraph" placement="inline" />
          <BlockWithLabel label="[条件]" text="くし切り、縦半分に切る" blockType="paragraph" placement="inline" />
        </div>
      </section>

      {/* 上方配置 */}
      <section style={{ marginBottom: 32, padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", marginBottom: 12 }}>
          C. 上方配置（ブロック上部）
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <BlockWithLabel label="[手順]" text="2.1 切る" blockType="heading" placement="above" />
          <BlockWithLabel label="[使用したもの]" text="玉ねぎ 中 2個（400g）" blockType="paragraph" placement="above" />
          <BlockWithLabel label="[条件]" text="くし切り、縦半分に切る" blockType="paragraph" placement="above" />
        </div>
      </section>
    </div>
  ),
};

// C方式（上方配置）ノート風 — 基本パターン
export const AboveNote: StoryObj = {
  name: "C方式: ノート風（基本）",
  render: () => (
    <div style={{ maxWidth: 700, fontFamily: "Inter, sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>カレーの作り方</h1>
      <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 24 }}>
        作成日付: 2026-01-16&nbsp;&nbsp;最終編集日付: 2026-01-17&nbsp;&nbsp;タグ: 料理、カレー&nbsp;&nbsp;作成者: 熊谷 将也
      </p>

      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>1. 目的</h2>
      <p style={{ marginBottom: 20, color: "#374151" }}>
        当日に食べたカレーと1晩寝かしたカレーがどちらのほうが美味しいか
      </p>

      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>2. 作り方</h2>

      {/* 手順 2.1 */}
      <div style={{ marginBottom: 20 }}>
        <LabelBadge label="[手順]" size="small" />
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: "2px 0 8px" }}>2.1 切る</h3>

        <div style={{ marginLeft: 8, marginBottom: 8 }}>
          <LabelBadge label="[使用したもの]" size="small" />
          <ul style={{ margin: "2px 0 0 12px", lineHeight: 1.8 }}>
            <li>玉ねぎ
              <ul><li>中</li><li>2個（400g）</li></ul>
            </li>
            <li>じゃがいも
              <ul><li>中</li><li>1・1/2個（230g）</li></ul>
            </li>
            <li>にんじん
              <ul><li>中</li><li>1/2本（100g）</li></ul>
            </li>
          </ul>
        </div>

        <div style={{ marginLeft: 8 }}>
          <LabelBadge label="[条件]" size="small" />
          <ol style={{ margin: "2px 0 0 12px", lineHeight: 1.8 }}>
            <li>玉ねぎ — 縦半分に切り、放射線状のくし切りにする</li>
            <li>じゃがいも — 半分に切り、6〜8等分に切る</li>
            <li>にんじん — 乱切りにする</li>
          </ol>
        </div>
      </div>

      {/* 手順 2.2 */}
      <div style={{ marginBottom: 20 }}>
        <LabelBadge label="[手順]" size="small" />
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: "2px 0 8px" }}>2.2 炒める</h3>
        <div style={{ marginLeft: 8 }}>
          <LabelBadge label="[条件]" size="small" />
          <p style={{ margin: "2px 0", color: "#374151" }}>
            鍋にサラダ油を熱し、玉ねぎを中火で炒める。しんなりしたら肉を加え、色が変わるまで炒める。
          </p>
        </div>
      </div>

      {/* 手順 2.3 */}
      <div style={{ marginBottom: 20 }}>
        <LabelBadge label="[手順]" size="small" />
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: "2px 0 8px" }}>2.3 煮込む</h3>
        <div style={{ marginLeft: 8, marginBottom: 8 }}>
          <LabelBadge label="[条件]" size="small" />
          <p style={{ margin: "2px 0", color: "#374151" }}>
            水850mlを加え、沸騰したらアクを取り、弱火〜中火で約20分煮込む。
          </p>
        </div>
        <div style={{ marginLeft: 8 }}>
          <LabelBadge label="[結果]" size="small" />
          <p style={{ margin: "2px 0", color: "#374151" }}>
            じゃがいもに竹串がスッと通れば完成。
          </p>
        </div>
      </div>
    </div>
  ),
};

// C方式 — 箇条書きブロックにラベル
export const AboveWithBulletList: StoryObj = {
  name: "C方式: 箇条書きパターン",
  render: () => (
    <div style={{ maxWidth: 700, fontFamily: "Inter, sans-serif" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Cu粉末アニール実験</h2>

      <div style={{ marginBottom: 20 }}>
        <LabelBadge label="[手順]" size="small" />
        <h3 style={{ fontSize: 18, fontWeight: 600, margin: "2px 0 8px" }}>1. 封入する</h3>

        <div style={{ marginLeft: 8, marginBottom: 8 }}>
          <LabelBadge label="[使用したもの]" size="small" />
          <ul style={{ margin: "2px 0 0 12px", lineHeight: 1.8 }}>
            <li>Cu粉末 1g</li>
            <li>シリカ管（内径8mm）</li>
            <li>真空ポンプ</li>
          </ul>
        </div>

        <div style={{ marginLeft: 8 }}>
          <LabelBadge label="[条件]" size="small" />
          <ul style={{ margin: "2px 0 0 12px", lineHeight: 1.8 }}>
            <li>真空度: 10⁻³ Pa 以下</li>
            <li>封入時のバーナー温度: 約1200℃</li>
          </ul>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <LabelBadge label="[結果]" size="small" />
        <p style={{ margin: "2px 0", color: "#374151" }}>封入されたCu粉末（目視で管内に粉末が均一に分布していることを確認）</p>
      </div>
    </div>
  ),
};

// C方式 — テーブル（試料ラベル）パターン
export const AboveWithTable: StoryObj = {
  name: "C方式: テーブル（試料）パターン",
  render: () => {
    const thStyle: React.CSSProperties = {
      padding: "6px 12px",
      textAlign: "left",
      fontSize: 13,
      fontWeight: 600,
      borderBottom: "2px solid #d1d5db",
      color: "#374151",
    };
    const tdStyle: React.CSSProperties = {
      padding: "6px 12px",
      fontSize: 13,
      borderBottom: "1px solid #e5e7eb",
      color: "#374151",
    };

    return (
      <div style={{ maxWidth: 700, fontFamily: "Inter, sans-serif" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Cu粉末アニール実験</h2>

        <div style={{ marginBottom: 20 }}>
          <LabelBadge label="[手順]" size="small" />
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "2px 0 8px" }}>2. アニールする</h3>

          <div style={{ marginLeft: 8, marginBottom: 12 }}>
            <LabelBadge label="[試料]" size="small" />
            <table style={{ margin: "4px 0 0", borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={thStyle}>試料名</th>
                  <th style={thStyle}>温度</th>
                  <th style={thStyle}>時間</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={tdStyle}>sample_A</td><td style={tdStyle}>600℃</td><td style={tdStyle}>24h</td></tr>
                <tr><td style={tdStyle}>sample_B</td><td style={tdStyle}>700℃</td><td style={tdStyle}>24h</td></tr>
                <tr><td style={tdStyle}>sample_C</td><td style={tdStyle}>800℃</td><td style={tdStyle}>24h</td></tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginLeft: 8 }}>
            <LabelBadge label="[条件]" size="small" />
            <ul style={{ margin: "2px 0 0 12px", lineHeight: 1.8 }}>
              <li>昇温速度: 5℃/min</li>
              <li>雰囲気: 真空封入管内</li>
              <li>冷却: 炉冷</li>
            </ul>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <LabelBadge label="[手順]" size="small" />
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "2px 0 8px" }}>3. 評価する</h3>
          <div style={{ marginLeft: 8 }}>
            <LabelBadge label="[結果]" size="small" />
            <p style={{ margin: "2px 0", color: "#374151" }}>XRD測定により相同定を行う。</p>
          </div>
        </div>
      </div>
    );
  },
};

// C方式 — 全要素を含むフルノート
export const AboveFullNote: StoryObj = {
  name: "C方式: フルノート（全要素）",
  render: () => {
    const thStyle: React.CSSProperties = {
      padding: "6px 12px",
      textAlign: "left",
      fontSize: 13,
      fontWeight: 600,
      borderBottom: "2px solid #d1d5db",
      color: "#374151",
    };
    const tdStyle: React.CSSProperties = {
      padding: "6px 12px",
      fontSize: 13,
      borderBottom: "1px solid #e5e7eb",
      color: "#374151",
    };

    return (
      <div style={{ maxWidth: 700, fontFamily: "Inter, sans-serif" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Cu粉末アニール実験</h1>
        <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 24 }}>
          作成日付: 2026-03-20&nbsp;&nbsp;作成者: 熊谷 将也
        </p>

        {/* 手順 1 */}
        <div style={{ marginBottom: 24 }}>
          <LabelBadge label="[手順]" size="small" />
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "2px 0 8px" }}>1. 封入する</h3>

          <div style={{ marginLeft: 8, marginBottom: 8 }}>
            <LabelBadge label="[使用したもの]" size="small" />
            <ul style={{ margin: "2px 0 0 12px", lineHeight: 1.8 }}>
              <li>Cu粉末 1g</li>
              <li>シリカ管</li>
            </ul>
          </div>

          <div style={{ marginLeft: 8 }}>
            <LabelBadge label="[結果]" size="small" />
            <p style={{ margin: "2px 0", color: "#374151" }}>封入されたCu粉末</p>
          </div>
        </div>

        {/* 手順 2 */}
        <div style={{ marginBottom: 24 }}>
          <LabelBadge label="[手順]" size="small" />
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "2px 0 8px" }}>2. アニールする</h3>

          <div style={{ marginLeft: 8, marginBottom: 12 }}>
            <LabelBadge label="[試料]" size="small" />
            <table style={{ margin: "4px 0 0", borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={thStyle}>試料名</th>
                  <th style={thStyle}>温度</th>
                  <th style={thStyle}>時間</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={tdStyle}>sample_A</td><td style={tdStyle}>600℃</td><td style={tdStyle}>24h</td></tr>
                <tr><td style={tdStyle}>sample_B</td><td style={tdStyle}>700℃</td><td style={tdStyle}>24h</td></tr>
                <tr><td style={tdStyle}>sample_C</td><td style={tdStyle}>800℃</td><td style={tdStyle}>24h</td></tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginLeft: 8 }}>
            <LabelBadge label="[条件]" size="small" />
            <ul style={{ margin: "2px 0 0 12px", lineHeight: 1.8 }}>
              <li>昇温速度: 5℃/min</li>
              <li>冷却: 炉冷</li>
            </ul>
          </div>
        </div>

        {/* 手順 3 */}
        <div style={{ marginBottom: 24 }}>
          <LabelBadge label="[手順]" size="small" />
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: "2px 0 8px" }}>3. 評価する</h3>

          <div style={{ marginLeft: 8 }}>
            <LabelBadge label="[結果]" size="small" />
            <p style={{ margin: "2px 0", color: "#374151" }}>XRD測定により相同定を行う。</p>
          </div>
        </div>
      </div>
    );
  },
};
