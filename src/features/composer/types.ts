// Composer（Cmd+K）の型定義
// UI スケルトン段階。AI 実行配線は後続 PR。

export const COMPOSER_MODES = ["ask", "compose", "insert-prov", "insert-media"] as const;
export type ComposerMode = (typeof COMPOSER_MODES)[number];

/** 中段の発見カード — 直近の文脈から自動生成される提案 */
export type DiscoveryCard = {
  id: string;
  title: string;
  hint?: string;
  /** クリック時の挙動を呼び出し側に伝えるためのタグ。ボタンが何をするかは呼び出し側で解決する。 */
  action:
    | { kind: "continue-writing" }
    | { kind: "summarize-note" }
    | { kind: "visualize-prov" }
    | { kind: "make-concept-wiki" }
    | { kind: "custom"; key: string };
};

export type ComposerSubmission = {
  mode: ComposerMode;
  prompt: string;
};
