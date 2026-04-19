// Wiki Worthy 判定
// AI チャットの応答が Wiki に保存する価値があるかをヒューリスティックで判定する
// LLM 追加呼び出し不要（コスト0）

import type { ChatMessage } from "../../lib/document-types";

export type WorthyResult = {
  worthy: boolean;
  confidence: number;
  reason: string;
};

// 最低限の応答長（短すぎる回答は知識として保存しない）
const MIN_RESPONSE_LENGTH = 200;
// 最低限の会話ターン数（1往復だけでは浅い）
const MIN_TURNS = 2;
// 知識的価値を示すキーワード（日本語・英語）
const KNOWLEDGE_INDICATORS = [
  // 構造的な記述
  "なぜなら", "理由は", "原因は", "メカニズム", "仕組み",
  "because", "mechanism", "principle", "fundamentally",
  // 比較・分析
  "一方で", "比較すると", "違いは", "共通点",
  "compared to", "in contrast", "difference between", "similarity",
  // 洞察・推論
  "つまり", "したがって", "このことから", "示唆", "意味する",
  "therefore", "implies", "suggests", "insight", "indicates",
  // 手順・方法
  "手順", "ステップ", "方法は", "アプローチ",
  "step", "approach", "method", "procedure", "how to",
  // 定義・概念
  "とは", "定義", "概念", "本質",
  "defined as", "concept", "essentially", "refers to",
];

// 一時的・文脈固有の応答を示すキーワード（Wiki に不向き）
const EPHEMERAL_INDICATORS = [
  // コード修正
  "このコードを", "修正しました", "バグ", "エラー", "fix",
  // ファイル操作
  "ファイルを", "保存しました", "created", "deleted",
  // UI/操作指示
  "クリック", "ボタンを", "設定を変更",
  // 直接的な回答のみ
  "はい", "いいえ", "yes", "no",
];

/**
 * チャット履歴から Wiki に保存する価値があるか判定する
 */
export function assessWikiWorthiness(messages: ChatMessage[]): WorthyResult {
  // ターン数チェック
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  if (assistantMessages.length < MIN_TURNS) {
    return { worthy: false, confidence: 0.9, reason: "Too few conversation turns" };
  }

  // 最新の応答を分析
  const latestResponse = assistantMessages[assistantMessages.length - 1];
  if (!latestResponse) {
    return { worthy: false, confidence: 1.0, reason: "No assistant response" };
  }

  const responseText = latestResponse.content;

  // 応答長チェック
  if (responseText.length < MIN_RESPONSE_LENGTH) {
    return { worthy: false, confidence: 0.8, reason: "Response too short" };
  }

  // 一時的な応答チェック
  const ephemeralCount = EPHEMERAL_INDICATORS.filter((k) =>
    responseText.toLowerCase().includes(k.toLowerCase()),
  ).length;
  if (ephemeralCount >= 3) {
    return { worthy: false, confidence: 0.7, reason: "Appears to be ephemeral/task-specific" };
  }

  // 知識的価値のスコアリング
  const knowledgeCount = KNOWLEDGE_INDICATORS.filter((k) =>
    responseText.toLowerCase().includes(k.toLowerCase()),
  ).length;

  // 全会話テキストの合計長
  const totalContent = messages.map((m) => m.content).join(" ");
  const totalLength = totalContent.length;

  // スコア計算
  let score = 0;

  // 知識指標の数（最大 0.4）
  score += Math.min(knowledgeCount * 0.08, 0.4);

  // 応答の長さ（最大 0.2）
  score += Math.min(responseText.length / 2000, 0.2);

  // 会話の深さ（ターン数、最大 0.2）
  score += Math.min(assistantMessages.length * 0.05, 0.2);

  // 全体のコンテンツ量（最大 0.2）
  score += Math.min(totalLength / 5000, 0.2);

  const worthy = score >= 0.5;

  return {
    worthy,
    confidence: Math.min(score + 0.3, 1.0),
    reason: worthy
      ? `Knowledge-rich conversation (score: ${score.toFixed(2)}, indicators: ${knowledgeCount})`
      : `Below threshold (score: ${score.toFixed(2)})`,
  };
}
