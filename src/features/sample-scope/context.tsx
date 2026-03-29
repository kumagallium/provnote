// ──────────────────────────────────────────────
// SampleScope コンテキスト
//
// ノート内の [パターン]（[試料]）テーブルから
// 試料 ID 一覧を管理し、sampleScope ブロックに提供する。
// ──────────────────────────────────────────────

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

export type SampleScopeState = {
  /** 試料 ID 一覧（[パターン] テーブルの1列目） */
  sampleIds: string[];
  /** 試料 ID 一覧を更新 */
  setSampleIds: (ids: string[]) => void;
};

const SampleScopeContext = createContext<SampleScopeState | null>(null);

export function SampleScopeProvider({ children }: { children: ReactNode }) {
  const [sampleIds, setSampleIdsRaw] = useState<string[]>([]);

  const setSampleIds = useCallback((ids: string[]) => {
    setSampleIdsRaw(ids);
  }, []);

  return (
    <SampleScopeContext.Provider value={{ sampleIds, setSampleIds }}>
      {children}
    </SampleScopeContext.Provider>
  );
}

export function useSampleScope(): SampleScopeState {
  const ctx = useContext(SampleScopeContext);
  if (!ctx) throw new Error("SampleScopeProvider が見つかりません");
  return ctx;
}
