// ストレージプロバイダーのインターフェース定義
// 各プロバイダー（Google Drive, OneDrive, Dropbox, S3 等）がこれを実装する

import type { ProvNoteDocument, ProvNoteFile } from "../document-types";

/** メディアアップロード結果 */
export type MediaUploadResult = {
  fileId: string;
  url: string;
  name: string;
  mimeType: string;
};

/** 認証状態 */
export type AuthState = {
  isSignedIn: boolean;
  userEmail: string | null;
};

/** ストレージプロバイダーのインターフェース */
export interface StorageProvider {
  /** プロバイダー識別子（設定保存・切り替え用） */
  readonly id: string;
  /** 表示名 */
  readonly displayName: string;

  // --- 認証 ---
  init(): Promise<void>;
  signIn(): void;
  signOut(): void;
  getAuthState(): AuthState;
  onAuthChange(fn: (state: AuthState) => void): () => void;

  // --- ファイル CRUD ---
  listFiles(): Promise<ProvNoteFile[]>;
  loadFile(fileId: string): Promise<ProvNoteDocument>;
  createFile(title: string, content: ProvNoteDocument): Promise<string>;
  saveFile(fileId: string, content: ProvNoteDocument): Promise<void>;
  deleteFile(fileId: string): Promise<void>;

  // --- メディア ---
  uploadMedia(file: File): Promise<MediaUploadResult>;
  /** メディアファイルの表示用 URL を取得（動画・音声は Blob URL を返す場合あり） */
  getMediaBlobUrl(fileId: string): Promise<string>;
  /** URL からプロバイダー固有のファイル ID を抽出 */
  extractFileId(url: string): string | null;

  // --- メタデータ ---
  getUserEmail(): Promise<string | null>;
  getRevisionId?(fileId: string): Promise<string | null>;

  // --- 認証付き fetch（インデックス管理等で使用） ---
  authedFetch(url: string, options?: RequestInit): Promise<Response>;

  // --- キャッシュクリア ---
  clearCache(): void;
}
