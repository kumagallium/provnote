// Google 認証の React Hook

import { useEffect, useState } from "react";
import {
  initGoogleAuth,
  signIn as gisSignIn,
  signOut as gisSignOut,
  isSignedIn,
  onAuthChange,
  isOAuthConfigured,
} from "./google-auth";
import { clearCache } from "./google-drive";

export function useGoogleAuth() {
  const oauthAvailable = isOAuthConfigured();
  const [authenticated, setAuthenticated] = useState(
    oauthAvailable ? isSignedIn() : true,
  );
  const [loading, setLoading] = useState(oauthAvailable);

  useEffect(() => {
    if (!oauthAvailable) return;
    initGoogleAuth().then(() => setLoading(false));
    const unsubscribe = onAuthChange((token) => {
      setAuthenticated(token !== null);
    });
    return unsubscribe;
  }, [oauthAvailable]);

  const signIn = () => gisSignIn();
  const signOut = () => {
    gisSignOut();
    clearCache();
  };

  return { authenticated, loading, signIn, signOut, oauthAvailable };
}
