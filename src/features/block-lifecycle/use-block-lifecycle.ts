// ──────────────────────────────────────────────
// useBlockLifecycle
//
// ブロック ID と PROV メタ (labels / provLinks) の整合性を
// 保つための統合ファサード。
//
// 設計上の決定（docs/internal/design-registry.md L-001）:
// PROV メタはブロック props ではなく独立テーブル (LabelStore / LinkStore)
// で管理する。代わりに、ブロック ID が動くすべての局面
// （削除・コピペ・派生継承）は本ファサードを経由させ、
// 呼び出し側に同期責任を露出させない。
//
// label-auto.ts の onChange クリーンアップ（非同期）と併走するが、
// 両者とも idempotent なので二重実行しても副作用はない。
// 本ファサードは「呼び出し側から明示的に」同期を発火できる
// safety net として機能する。
//
// 実ロジックは cleanup-operations.ts に分離（ユニットテスト用）。
// ──────────────────────────────────────────────

import { useCallback } from "react";
import { useLabelStore } from "../context-label/store";
import { useLinkStore } from "../block-link/store";
import {
  cleanupBlockMetadata,
  copyLabelsByIdMap,
  copyLinksByIdMap,
} from "./cleanup-operations";

export type BlockLifecycle = {
  /**
   * ブロック群を削除する前に呼び出す。
   * 対応する labels / provLinks を同期的に除去する。
   */
  removeBlockMetadata: (blockIds: readonly string[]) => void;

  /**
   * 旧 ID → 新 ID のマップに従って labels / provLinks を複製する。
   * コピペ（Phase 3）・派生継承（Phase 4）で使う。
   */
  copyBlocksMetadata: (idMap: ReadonlyMap<string, string>) => void;
};

export function useBlockLifecycle(): BlockLifecycle {
  const labelStore = useLabelStore();
  const linkStore = useLinkStore();

  const removeBlockMetadata = useCallback(
    (blockIds: readonly string[]) => {
      cleanupBlockMetadata(blockIds, labelStore, linkStore);
    },
    [labelStore, linkStore],
  );

  const copyBlocksMetadata = useCallback(
    (idMap: ReadonlyMap<string, string>) => {
      copyLabelsByIdMap(idMap, labelStore);
      copyLinksByIdMap(idMap, linkStore);
    },
    [labelStore, linkStore],
  );

  return { removeBlockMetadata, copyBlocksMetadata };
}
