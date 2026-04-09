// provnote → graphium マイグレーションユーティリティ
// 既存ユーザーの localStorage / IndexedDB データを新しいキー名に移行する
// アプリ起動時に一度だけ実行する

const MIGRATION_DONE_KEY = "graphium_migration_v1";

/** localStorage キーのマッピング（旧 → 新） */
const LS_KEY_MAP: [string, string][] = [
  ["provnote_locale", "graphium_locale"],
  ["provnote_auth", "graphium_auth"],
  ["provnote_has_consented", "graphium_has_consented"],
  ["provnote_storage_provider", "graphium_storage_provider"],
  ["provnote_last_file", "graphium_last_file"],
  ["provnote-settings", "graphium-settings"],
  ["provnote-recent-notes", "graphium-recent-notes"],
];

/** IndexedDB 名のマッピング */
const OLD_DB_NAME = "provnote-local";
const NEW_DB_NAME = "graphium-local";

/**
 * アプリ起動時に呼ぶマイグレーション関数
 * - localStorage の旧キーを新キーにコピー（旧キーは削除）
 * - IndexedDB の旧 DB を新 DB にコピー（旧 DB は削除）
 * - 一度実行済みならスキップ
 */
export async function migrateFromProvnote(): Promise<void> {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return;

  // 1. localStorage キーの移行
  for (const [oldKey, newKey] of LS_KEY_MAP) {
    const value = localStorage.getItem(oldKey);
    if (value !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, value);
    }
    localStorage.removeItem(oldKey);
  }

  // 2. IndexedDB の移行
  await migrateIndexedDB();

  // 完了フラグ
  localStorage.setItem(MIGRATION_DONE_KEY, "1");
}

/** IndexedDB の旧 DB → 新 DB にデータをコピー */
async function migrateIndexedDB(): Promise<void> {
  // 旧 DB が存在するかチェック
  const databases = await indexedDB.databases?.().catch(() => []);
  if (!databases?.some((db) => db.name === OLD_DB_NAME)) return;

  try {
    // 旧 DB を開く
    const oldDb = await openDb(OLD_DB_NAME, 1);
    const storeNames = Array.from(oldDb.objectStoreNames);
    if (storeNames.length === 0) {
      oldDb.close();
      return;
    }

    // 旧 DB からすべてのデータを読み出す
    const data = new Map<string, any[]>();
    for (const storeName of storeNames) {
      const tx = oldDb.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const records: any[] = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      data.set(storeName, records);
    }
    oldDb.close();

    // 新 DB を作成してデータを移行
    const newDb = await openDb(NEW_DB_NAME, 1, (db) => {
      for (const storeName of storeNames) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      }
    });

    for (const [storeName, records] of data) {
      if (!newDb.objectStoreNames.contains(storeName)) continue;
      const tx = newDb.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (const record of records) {
        store.put(record);
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    newDb.close();

    // 旧 DB を削除
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(OLD_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("IndexedDB マイグレーション失敗（スキップ）:", err);
  }
}

function openDb(
  name: string,
  version: number,
  onUpgrade?: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    if (onUpgrade) {
      req.onupgradeneeded = () => onUpgrade(req.result);
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
