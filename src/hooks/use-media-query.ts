// レスポンシブ対応用メディアクエリフック

import { useEffect, useState } from "react";

/**
 * メディアクエリの一致を監視するフック
 * @param query - CSS メディアクエリ文字列 (例: "(min-width: 768px)")
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** md breakpoint (768px) 以上かどうか */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
