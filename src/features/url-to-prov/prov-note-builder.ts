// PROV Ingester 出力 → GraphiumDocument 組み立て
//
// LLM の階層ブロック出力を BlockNote のブロックツリーにマップし、
// LLM が出した依存関係（material.derivedFrom / procedure.dependsOn）から
// informed_by リンク（次手順→前手順）を組み立てる。
//
// 依存情報が一切無い場合は文書順の線形連鎖にフォールバック。
// （LLM が依存判定をサボっても最低限手順が繋がる保険）

import type { GraphiumDocument } from "../../lib/document-types";
import { normalizeLabel, CORE_LABELS, type CoreLabel } from "../context-label/labels";

export type ProvIngesterBlock = {
  text: string;
  role?: string;
  blockType?: "paragraph" | "heading" | "bulletListItem" | "numberedListItem";
  level?: 1 | 2 | 3;
  children?: ProvIngesterBlock[];
  stepId?: string;
  derivedFrom?: string;
  dependsOn?: string[];
};

export type BuildProvNoteParams = {
  title: string;
  blocks: ProvIngesterBlock[];
  sourceUrl: string;
  sourceTitle?: string;
  sourceFetchedAt: string;
  model?: string | null;
  tokenUsage?: { input_tokens: number; output_tokens: number; total_tokens: number };
};

// 内部中間表現: 変換中に追跡する手順情報
type ProcedureRecord = {
  blockId: string;
  stepId: string | null;
  /** 文書順のインデックス（fallback 連鎖に使う） */
  order: number;
};

// 変換中に蓄積する依存関係（source step ← target step）
type Dependency = {
  fromBlockId: string; // informed_by の「source」= 次手順
  toBlockId: string;   // informed_by の「target」= 前手順
};

/**
 * PROV Ingester 出力から GraphiumDocument を構築する
 */
export function buildProvNoteDocument(params: BuildProvNoteParams): GraphiumDocument {
  const now = new Date().toISOString();

  const labels: Record<string, string> = {};
  const procedures: ProcedureRecord[] = [];
  const dependencies: Dependency[] = [];
  const stepIdToBlockId = new Map<string, string>();

  // 変換時に「現在の手順 scope」を追跡する。material.derivedFrom を受け取ったら
  // 「（scope 手順）→ derivedFrom 手順」の informed_by として記録する。
  const ctx: BuildContext = {
    labels,
    procedures,
    dependencies,
    stepIdToBlockId,
    currentProcedureBlockId: null,
    pendingDerivedFrom: [],
    pendingDependsOn: [],
  };

  const noteBlocks: any[] = [buildSourceHeaderBlock(params)];
  for (const b of params.blocks) {
    const converted = convertBlock(b, ctx);
    if (converted) noteBlocks.push(converted);
  }

  // 第 2 パス: 蓄積した pending 依存情報を解決して dependencies に流し込む
  //   （LLM は derivedFrom / dependsOn に任意の stepId を書けるので、
  //    stepId → blockId マップが全て揃った後にリンクを解決する）
  resolvePendingDependencies(ctx);

  const provLinks = buildProvLinks(procedures, dependencies);

  return {
    version: 3,
    title: params.title,
    pages: [
      {
        id: "main",
        title: params.title,
        blocks: noteBlocks,
        labels,
        provLinks,
        knowledgeLinks: [],
      },
    ],
    sourceUrl: params.sourceUrl,
    sourceFetchedAt: params.sourceFetchedAt,
    sourceTitle: params.sourceTitle,
    generatedBy: {
      agent: "prov-ingester",
      sessionId: `url:${params.sourceUrl}`,
      model: params.model ?? undefined,
      tokenUsage: params.tokenUsage,
    },
    createdAt: now,
    modifiedAt: now,
  };
}

// ── 内部実装 ──

type PendingDep = {
  /** informed_by の source: この材料/手順を含む scope の procedure blockId */
  fromBlockId: string;
  /** informed_by の target stepId（後で blockId に解決する） */
  toStepId: string;
};

type BuildContext = {
  labels: Record<string, string>;
  procedures: ProcedureRecord[];
  dependencies: Dependency[];
  stepIdToBlockId: Map<string, string>;
  /** 現在の scope の procedure H2 の blockId（material が derivedFrom を持つとき参照） */
  currentProcedureBlockId: string | null;
  pendingDerivedFrom: PendingDep[];
  pendingDependsOn: PendingDep[];
};

function buildSourceHeaderBlock(params: BuildProvNoteParams): any {
  return {
    id: crypto.randomUUID(),
    type: "paragraph",
    props: {
      textColor: "default",
      backgroundColor: "default",
      textAlignment: "left",
    },
    content: [
      { type: "text", text: "Source: ", styles: { bold: true } },
      {
        type: "link",
        href: params.sourceUrl,
        content: [
          { type: "text", text: params.sourceTitle || params.sourceUrl, styles: {} },
        ],
      },
    ],
    children: [],
  };
}

/**
 * ingester の 1 ブロック → BlockNote ブロック（再帰）
 * ctx に副作用で labels / procedures / pending deps を蓄積する。
 */
function convertBlock(b: ProvIngesterBlock, ctx: BuildContext): any | null {
  const text = b.text?.trim();
  if (!text) return null;

  const id = crypto.randomUUID();
  const blockType = b.blockType ?? "paragraph";

  const props: Record<string, any> = {
    textColor: "default",
    backgroundColor: "default",
    textAlignment: "left",
  };
  if (blockType === "heading") {
    props.level = b.level ?? 2;
  }

  let coreLabel: CoreLabel | null = null;
  if (b.role) {
    const normalized = normalizeLabel(b.role);
    if ((CORE_LABELS as string[]).includes(normalized)) {
      coreLabel = normalized as CoreLabel;
    }
  }

  // procedure H2/H3 → scope を更新し、stepId → blockId マップに登録
  const isProcedureHeading =
    coreLabel === "procedure" &&
    blockType === "heading" &&
    (props.level === 2 || props.level === 3);

  // ── スコープ外の material/tool/result はラベルを剥がす ──
  // Graphium の prov-generator は H2 procedure スコープの外にある
  // material/tool/result を孤立 Entity として扱ってしまう（どの Activity にも
  // 繋がらない）。読者視点の「材料リスト」セクションにラベルを付けられると
  // グラフが汚れるので、スコープ内のみ core label を採用する。
  //
  // 例外: attribute は祖先探索で親 Entity に吸収されるため、スコープ外でも
  //      孤立しない（prov-generator が warning を出すのみ）。そのまま残す。
  const ENTITY_LIKE: CoreLabel[] = ["material", "tool", "result"];
  const isEntityLike = coreLabel !== null && ENTITY_LIKE.includes(coreLabel);
  const insideProcedureScope = ctx.currentProcedureBlockId !== null;

  if (isEntityLike && !insideProcedureScope) {
    // スコープ外 → PROV グラフから除外（テキストはそのまま残る）
    coreLabel = null;
  }

  if (coreLabel) ctx.labels[id] = coreLabel;

  if (isProcedureHeading) {
    ctx.currentProcedureBlockId = id;
    const record: ProcedureRecord = {
      blockId: id,
      stepId: b.stepId ?? null,
      order: ctx.procedures.length,
    };
    ctx.procedures.push(record);
    if (b.stepId) ctx.stepIdToBlockId.set(b.stepId, id);

    // この手順の dependsOn は 2nd パスで解決する
    if (b.dependsOn && b.dependsOn.length > 0) {
      for (const dep of b.dependsOn) {
        ctx.pendingDependsOn.push({ fromBlockId: id, toStepId: dep });
      }
    }
  }

  // material / tool の derivedFrom は 2nd パスで解決する
  //（現在の scope 手順から derivedFrom の手順へ informed_by）
  if (
    b.derivedFrom &&
    (coreLabel === "material" || coreLabel === "tool") &&
    ctx.currentProcedureBlockId
  ) {
    ctx.pendingDerivedFrom.push({
      fromBlockId: ctx.currentProcedureBlockId,
      toStepId: b.derivedFrom,
    });
  }

  const children: any[] = [];
  if (b.children && b.children.length > 0) {
    for (const c of b.children) {
      const childBlock = convertBlock(c, ctx);
      if (childBlock) children.push(childBlock);
    }
  }

  return {
    id,
    type: blockType,
    props,
    content: [{ type: "text", text, styles: {} }],
    children,
  };
}

/**
 * pending 依存（stepId 参照）を解決して最終的な Dependency (blockId ↔ blockId) に変換する。
 * 未解決・自己参照・重複は除外する。
 */
function resolvePendingDependencies(ctx: BuildContext): void {
  const seen = new Set<string>();
  const push = (fromBlockId: string, toStepId: string) => {
    const toBlockId = ctx.stepIdToBlockId.get(toStepId);
    if (!toBlockId) return; // 未定義 stepId
    if (toBlockId === fromBlockId) return; // 自己参照
    const key = `${fromBlockId} ${toBlockId}`;
    if (seen.has(key)) return;
    seen.add(key);
    ctx.dependencies.push({ fromBlockId, toBlockId });
  };
  for (const p of ctx.pendingDerivedFrom) push(p.fromBlockId, p.toStepId);
  for (const p of ctx.pendingDependsOn) push(p.fromBlockId, p.toStepId);
}

/**
 * 最終的な provLinks を組み立てる。
 *
 * - LLM が依存関係を出した場合: その DAG をそのまま informed_by リンクに変換
 * - LLM が一切依存を出さなかった場合: 文書順の線形連鎖にフォールバック
 *   （手順が完全に孤立するよりは隣接を繋いでおいた方がグラフが読みやすい）
 */
function buildProvLinks(
  procedures: ProcedureRecord[],
  dependencies: Dependency[],
): any[] {
  const edges =
    dependencies.length > 0
      ? dependencies
      : procedures.slice(1).map((p, i) => ({
          fromBlockId: p.blockId,
          toBlockId: procedures[i].blockId,
        }));

  return edges.map((e) => ({
    id: crypto.randomUUID(),
    sourceBlockId: e.fromBlockId,
    targetBlockId: e.toBlockId,
    type: "informed_by",
    layer: "prov",
    createdBy: "ai",
  }));
}
