// ストレージプロバイダーの React Hook
// useGoogleAuth の代替として、プロバイダー非依存の認証状態管理を提供

import { useEffect, useState } from "react";
import { getActiveProvider, initProviders } from "./registry";
import type { StorageProvider } from "./types";

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
  const signOut = () => provider?.signOut();

  return { authenticated, loading, signIn, signOut, provider };
}
