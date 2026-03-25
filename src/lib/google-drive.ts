// Google Drive API v3 操作
// ProvNote 専用フォルダ内にノートファイルを保存・読み込み

import { getAccessToken } from "./google-auth";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_NAME = "ProvNote";
const UPLOAD_FILES_FOLDER = "uploadFiles";
const MIME_FOLDER = "application/vnd.google-apps.folder";
const MIME_JSON = "application/json";

// ProvNote ファイルのメタデータ
export type ProvNoteFile = {
  id: string;
  name: string;
  modifiedTime: string;
  createdTime: string;
};

// ノート間リンク（派生関係）
export type NoteLink = {
  /** リンク先ノートの Google Drive ファイル ID */
  targetNoteId: string;
  /** リンク元のブロック ID */
  sourceBlockId: string;
  /** リンクの種類 */
  type: "derived_from";
};

// ProvNote ファイルの内容（エディタの完全な状態）
export type ProvNoteDocument = {
  version: 1;
  title: string;
  pages: ProvNotePage[];
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
  createdAt: string;
  modifiedAt: string;
};

export type ProvNotePage = {
  id: string;
  title: string;
  blocks: any[];
  labels: Record<string, string>;
  links: any[];
  derivedFromPageId?: string;
  derivedFromBlockId?: string;
};

// 認証付き fetch
async function authedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAccessToken();
  if (!token) throw new Error("未認証です。サインインしてください。");

  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive API エラー (${res.status}): ${body}`);
  }
  return res;
}

// フォルダ ID のキャッシュ
let cachedFolderId: string | null = null;
let cachedUploadFolderId: string | null = null;

// ProvNote 専用フォルダを取得 or 作成
export async function getOrCreateFolder(): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  // 既存フォルダを検索
  const query = `name='${FOLDER_NAME}' and mimeType='${MIME_FOLDER}' and trashed=false`;
  const res = await authedFetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`
  );
  const data = await res.json();

  if (data.files && data.files.length > 0) {
    cachedFolderId = data.files[0].id;
    return cachedFolderId!;
  }

  // フォルダが無ければ作成
  const createRes = await authedFetch(`${DRIVE_API}/files`, {
    method: "POST",
    headers: { "Content-Type": MIME_JSON },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: MIME_FOLDER,
    }),
  });
  const folder = await createRes.json();
  cachedFolderId = folder.id;
  return cachedFolderId!;
}

// ProvNote フォルダ内のファイル一覧を取得
export async function listFiles(): Promise<ProvNoteFile[]> {
  const folderId = await getOrCreateFolder();
  const query = `'${folderId}' in parents and trashed=false`;
  const fields = "files(id,name,modifiedTime,createdTime)";

  const res = await authedFetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=${fields}&orderBy=modifiedTime desc&spaces=drive`
  );
  const data = await res.json();
  return data.files || [];
}

// ファイルの内容を読み込み
export async function loadFile(fileId: string): Promise<ProvNoteDocument> {
  const res = await authedFetch(
    `${DRIVE_API}/files/${fileId}?alt=media`
  );
  return res.json();
}

// 新規ファイルを作成
export async function createFile(
  title: string,
  content: ProvNoteDocument
): Promise<string> {
  const folderId = await getOrCreateFolder();
  const fileName = `${title}.provnote.json`;

  // multipart upload（メタデータ + ファイル内容を一度に送信）
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: MIME_JSON,
  };

  const boundary = "provnote_boundary";
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    JSON.stringify(content),
    `--${boundary}--`,
  ].join("\r\n");

  const res = await authedFetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  const data = await res.json();
  return data.id;
}

// 既存ファイルを上書き保存（タイトル変更時はファイル名も更新）
export async function saveFile(
  fileId: string,
  content: ProvNoteDocument
): Promise<void> {
  // 1. メタデータ更新（ファイル名）
  const fileName = `${content.title}.provnote.json`;
  await authedFetch(
    `${DRIVE_API}/files/${fileId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": MIME_JSON },
      body: JSON.stringify({ name: fileName }),
    }
  );

  // 2. コンテンツ更新
  await authedFetch(
    `${UPLOAD_API}/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: { "Content-Type": MIME_JSON },
      body: JSON.stringify(content),
    }
  );
}

// ファイルを削除（ゴミ箱に移動）
export async function deleteFile(fileId: string): Promise<void> {
  await authedFetch(`${DRIVE_API}/files/${fileId}`, {
    method: "PATCH",
    headers: { "Content-Type": MIME_JSON },
    body: JSON.stringify({ trashed: true }),
  });
}

// ProvNote/uploadFiles サブフォルダを取得 or 作成
async function getOrCreateUploadFolder(): Promise<string> {
  if (cachedUploadFolderId) return cachedUploadFolderId;

  const parentId = await getOrCreateFolder();

  // 既存サブフォルダを検索
  const query = `name='${UPLOAD_FILES_FOLDER}' and mimeType='${MIME_FOLDER}' and '${parentId}' in parents and trashed=false`;
  const res = await authedFetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`
  );
  const data = await res.json();

  if (data.files && data.files.length > 0) {
    cachedUploadFolderId = data.files[0].id;
    return cachedUploadFolderId!;
  }

  // フォルダが無ければ作成
  const createRes = await authedFetch(`${DRIVE_API}/files`, {
    method: "POST",
    headers: { "Content-Type": MIME_JSON },
    body: JSON.stringify({
      name: UPLOAD_FILES_FOLDER,
      parents: [parentId],
      mimeType: MIME_FOLDER,
    }),
  });
  const folder = await createRes.json();
  cachedUploadFolderId = folder.id;
  return cachedUploadFolderId!;
}

// ファイルを data URL に変換
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

// メディアファイルを Google Drive にアップロードし、表示用 data URL を返す
export async function uploadMediaFile(file: File): Promise<string> {
  // 表示用の data URL を先に生成（アップロード完了を待たずに表示可能にする）
  const dataUrl = await fileToDataUrl(file);

  // Google Drive へのアップロードはバックグラウンドで実行
  uploadToDriveBackground(file).catch((err) => {
    console.error("Drive へのバックアップに失敗:", err);
  });

  return dataUrl;
}

// Google Drive へのアップロード（バックグラウンド）
async function uploadToDriveBackground(file: File): Promise<void> {
  const uploadFolderId = await getOrCreateUploadFolder();

  // ファイル名にタイムスタンプを付与して一意にする
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const baseName = file.name.includes(".")
    ? file.name.slice(0, file.name.lastIndexOf("."))
    : file.name;
  const uniqueName = `${baseName}_${Date.now()}${ext}`;

  const metadata = {
    name: uniqueName,
    parents: [uploadFolderId],
  };

  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: MIME_JSON })
  );
  form.append("file", file);

  const token = getAccessToken();
  if (!token) throw new Error("未認証です。サインインしてください。");

  const res = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`メディアアップロードエラー (${res.status}): ${body}`);
  }
}

// フォルダIDキャッシュをクリア（サインアウト時に呼ぶ）
export function clearCache(): void {
  cachedFolderId = null;
  cachedUploadFolderId = null;
}
