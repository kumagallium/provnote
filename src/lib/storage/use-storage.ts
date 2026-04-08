// ストレージプロバイダーの React Hook
// useGoogleAuth の代替として、プロバイダー非依存の認証状態管理を提供

import { useCallback, useEffect, useState } from "react";
import { getActiveProvider, setActiveProvider, initProviders } from "./registry";
import type { StorageProvider } from "./types";

const STORAGE_KEY = "provnote_storage_provider";

/** ストレージプロバイダーの認証状態を管理する Hook */
export function useStorage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<StorageProvider | null>(null);

  useEffect(() => {
    // プロバイダーを初期化
    initProviders();
    const p = getActiveProvider();
    setProvider(p);

    // 認証状態の初期値
    setAuthenticated(p.getAuthState().isSignedIn);

    // 認証状態変化のリスナー
    const unsubscribe = p.onAuthChange((state) => {
      setAuthenticated(state.isSignedIn);
    });

    // プロバイダーを初期化（サイレントリフレッシュ等）
    p.init().then(() => {
      setAuthenticated(p.getAuthState().isSignedIn);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = () => provider?.signIn();

  // サインアウト: プロバイダー設定をリセットしてログイン画面に戻す
  // last_file / recent-notes は残す（再ログイン時に自動復元するため）
  const signOut = useCallback(() => {
    provider?.signOut();
    // プロバイダー設定のみクリア（次回リロード時にログイン画面を表示）
    localStorage.removeItem(STORAGE_KEY);
  }, [provider]);

  // プロバイダーを切り替え（ページリロードで全状態をリセット）
  const switchProvider = useCallback((id: string) => {
    setActiveProvider(id);
    // 旧プロバイダーのキャッシュをクリア
    localStorage.removeItem("provnote_last_file");
    localStorage.removeItem("provnote-recent-notes");
    window.location.reload();
  }, []);

  return { authenticated, loading, signIn, signOut, provider, switchProvider };
}
