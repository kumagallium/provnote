// Graphium ドキュメントのドメイン型定義
// ストレージプロバイダーに依存しない、アプリケーション固有の型

import type { DocumentProvenance } from "../features/document-provenance/types";

// Graphium ファイルのメタデータ
export type GraphiumFile = {
  id: string;
  name: string;
  modifiedTime: string;
  createdTime: string;
};

// ノート間リンク（派生関係）
export type NoteLink = {
  /** リンク先ノートのファイル ID（プロバイダー固有） */
  targetNoteId: string;
  /** リンク元のブロック ID */
  sourceBlockId: string;
  /** リンクの種類 */
  type: "derived_from";
};

// AI チャットメッセージ
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

// スコープに紐づく AI チャット
export type ScopeChat = {
  id: string;
  scopeBlockId: string;
  scopeType: "heading" | "block" | "page";
  messages: ChatMessage[];
  generatedBy?: {
    agent: string;
    sessionId: string;
    model?: string;
    tokenUsage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  };
  createdAt: string;
  modifiedAt: string;
};

// Graphium ファイルの内容（エディタの完全な状態）
export type GraphiumDocument = {
  version: 1 | 2;
  title: string;
  pages: GraphiumPage[];
  /** ノート間リンク（派生先ノートへの参照） */
  noteLinks?: NoteLink[];
  /** このノートの派生元ノート ID */
  derivedFromNoteId?: string;
  /** このノートの派生元ブロック ID */
  derivedFromBlockId?: string;
  /** AI エージェントによる生成メタデータ */
  generatedBy?: {
    agent: string;
    sessionId: string;
    model?: string;
    tokenUsage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  };
  /** スコープ別 AI チャット履歴 */
  chats?: ScopeChat[];
  /** ドキュメント来歴（編集操作の PROV-DM 記録） */
  documentProvenance?: DocumentProvenance;
  createdAt: string;
  modifiedAt: string;
};

export type GraphiumPage = {
  id: string;
  title: string;
  blocks: any[];
  labels: Record<string, string>;
  /** PROV 層リンク（DAG 制約） */
  provLinks: any[];
  /** 知識層リンク（循環 OK） */
  knowledgeLinks: any[];
  /** @deprecated v1 互換: 旧 links フィールド。読み込み時に provLinks/knowledgeLinks に変換する */
  links?: any[];
  /** インデックステーブル: テーブルブロック ID → { サンプル名 → ノートファイル ID } */
  indexTables?: Record<string, Record<string, string>>;
  derivedFromPageId?: string;
  derivedFromBlockId?: string;
};
