// ──────────────────────────────────────────────
// mediaInlineLabelStore: メディアブロック (image / video / audio / file / pdf)
// 専用のインラインラベル・サイドストア（Phase D-3-β, 2026-04-30）
//
// テキストには BlockNote の inline style を使えるが、メディアブロックは
// content="none" のためそれが使えない。同じ UX（フローティングメニュー）で
// ラベル付与できる経路として、blockId → {label, entityId} の Map を独立に持つ。
//
// 詳細は docs/internal/provenance-layer-design.md §8.6 を参照。
// ──────────────────────────────────────────────

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
/** メディアブロックに付与可能なインラインラベル（Phase D-3-β）。 */
export type MediaInlineLabelType = "material" | "tool" | "attribute" | "output";

export type MediaLabelEntry = {
  label: MediaInlineLabelType;
  entityId: string;
};

export type MediaInlineLabelStore = {
  /** blockId → ラベルエントリ */
  labels: Map<string, MediaLabelEntry>;
  setLabel: (blockId: string, entry: MediaLabelEntry | null) => void;
  getLabel: (blockId: string) => MediaLabelEntry | undefined;
  /** スナップショット（保存用） */
  getSnapshot: () => Record<string, MediaLabelEntry>;
  /** 復元（ロード用） */
  restoreSnapshot: (snapshot: Record<string, MediaLabelEntry> | undefined) => void;
};

const Ctx = createContext<MediaInlineLabelStore | null>(null);

export function MediaInlineLabelProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<Map<string, MediaLabelEntry>>(new Map());

  const setLabel = useCallback(
    (blockId: string, entry: MediaLabelEntry | null) => {
      setLabels((prev) => {
        const next = new Map(prev);
        if (entry === null) {
          next.delete(blockId);
        } else {
          next.set(blockId, entry);
        }
        return next;
      });
    },
    [],
  );

  const getLabel = useCallback(
    (blockId: string) => labels.get(blockId),
    [labels],
  );

  const getSnapshot = useCallback((): Record<string, MediaLabelEntry> => {
    const obj: Record<string, MediaLabelEntry> = {};
    for (const [k, v] of labels) obj[k] = v;
    return obj;
  }, [labels]);

  const restoreSnapshot = useCallback(
    (snapshot: Record<string, MediaLabelEntry> | undefined) => {
      const m = new Map<string, MediaLabelEntry>();
      if (snapshot) {
        for (const [k, v] of Object.entries(snapshot)) m.set(k, v);
      }
      setLabels(m);
    },
    [],
  );

  return (
    <Ctx.Provider
      value={{ labels, setLabel, getLabel, getSnapshot, restoreSnapshot }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useMediaInlineLabelStore(): MediaInlineLabelStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("MediaInlineLabelProvider が見つかりません");
  return ctx;
}

/**
 * 非必須コンテキスト用フック。Provider が無い場合は null を返す。
 * Storybook や Wiki ドキュメントなど、メディアラベル機能が不要な場面で使う。
 */
export function useMediaInlineLabelStoreOptional(): MediaInlineLabelStore | null {
  return useContext(Ctx);
}

/** ランダムな entityId を生成（後で同 referent を別の同 id ハイライトに揃える想定） */
export function makeMediaEntityId(label: MediaInlineLabelType): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ent_${label}_${rand}`;
}
