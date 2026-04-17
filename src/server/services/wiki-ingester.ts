// Wiki Ingester
// ノートコンテンツを LLM に渡して Wiki ドキュメントの構造化データを生成する

import type { WikiKind } from "../../lib/document-types.js";

export type WikiSection = {
  heading: string;
  content: string;
};

export type IngesterOutput = {
  kind: WikiKind;
  title: string;
  sections: WikiSection[];
  suggestedAction: "create" | "merge";
  mergeTargetId?: string;
  confidence: number;
};

export type ExistingWikiInfo = {
  id: string;
  title: string;
  kind: WikiKind;
};

/**
 * Ingester 用のシステムプロンプトを構築する
 */
export function buildIngesterSystemPrompt(
  language: string,
  existingWikis: ExistingWikiInfo[],
): string {
  const wikiListText = existingWikis.length > 0
    ? existingWikis.map((w) => `- [${w.kind}] ${w.title} (id: ${w.id})`).join("\n")
    : "(none)";

  return `You are a knowledge extraction assistant for Graphium, a provenance-tracking research editor.

Your task is to extract reusable knowledge from the given research note and create structured Wiki documents.

## Output Format

You MUST respond with valid JSON only (no markdown, no explanation). The JSON should follow this structure:

\`\`\`json
{
  "wikis": [
    {
      "kind": "summary" | "concept",
      "title": "string",
      "sections": [
        { "heading": "string", "content": "string (max 300 chars)" }
      ],
      "suggestedAction": "create" | "merge",
      "mergeTargetId": "string (only if merge)",
      "confidence": 0.0-1.0
    }
  ]
}
\`\`\`

## Classification Rules

- **Summary**: A recap of a specific note, experiment, or external source. Title should reference the source.
- **Concept**: Cross-cutting knowledge about a topic, material, technique, or lesson. Title should be the concept name.

## Wiki Structure Rules

- Each section should have a clear H2-level heading
- Section content should be concise (max 300 characters)
- Include practical, reusable knowledge (not just a copy of the note)
- Context labels in the source (e.g., [手順], [材料], [結果]) are hints about the content structure

## Merge vs Create

Check existing wikis below. If the note's main concepts strongly overlap with an existing wiki, suggest "merge" with the target ID. Otherwise, suggest "create".

## Existing Wikis

${wikiListText}

## Language

Output in: ${language === "ja" ? "Japanese" : "English"}

## Important

- Generate 1-3 wikis per note (don't over-generate)
- Focus on knowledge that would be useful when referenced from other notes
- Set confidence based on how clearly the knowledge can be extracted (0.5-1.0)
- If the note is too short or unclear, return an empty wikis array`;
}

/**
 * LLM の出力をパースして IngesterOutput 配列に変換する
 */
export function parseIngesterOutput(text: string): IngesterOutput[] {
  try {
    // JSON ブロックの抽出（```json ... ``` でラップされている場合にも対応）
    let jsonText = text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonText);
    const wikis = parsed.wikis ?? parsed;

    if (!Array.isArray(wikis)) return [];

    return wikis
      .filter((w: any) => w.title && w.sections && Array.isArray(w.sections))
      .map((w: any) => ({
        kind: (w.kind === "summary" || w.kind === "concept") ? w.kind : "concept" as WikiKind,
        title: String(w.title),
        sections: w.sections.map((s: any) => ({
          heading: String(s.heading ?? ""),
          content: String(s.content ?? ""),
        })),
        suggestedAction: w.suggestedAction === "merge" ? "merge" as const : "create" as const,
        mergeTargetId: w.mergeTargetId ? String(w.mergeTargetId) : undefined,
        confidence: typeof w.confidence === "number" ? w.confidence : 0.7,
      }));
  } catch (err) {
    console.error("Ingester 出力のパース失敗:", err);
    return [];
  }
}

/**
 * BlockNote ブロック配列からプレーンテキストを抽出する
 */
export function extractPlainText(blocks: any[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    const text = extractBlockContent(block);
    if (text) lines.push(text);

    if (block.children?.length) {
      const childText = extractPlainText(block.children);
      if (childText) lines.push(childText);
    }
  }

  return lines.join("\n");
}

function extractBlockContent(block: any): string {
  // インラインコンテンツ
  if (block.content) {
    if (typeof block.content === "string") return block.content;
    if (Array.isArray(block.content)) {
      const text = block.content.map((c: any) => c.text ?? c.content ?? "").join("");
      if (text) return text;
    }
    // テーブル
    if (block.content.type === "tableContent" && Array.isArray(block.content.rows)) {
      return block.content.rows
        .map((row: any) =>
          (row.cells ?? [])
            .map((cell: any) => {
              if (Array.isArray(cell)) {
                return cell.map((c: any) => {
                  if (Array.isArray(c.content)) {
                    return c.content.map((ic: any) => ic.text ?? "").join("");
                  }
                  return c.text ?? "";
                }).join("");
              }
              return "";
            })
            .join(" | ")
        )
        .join("\n");
    }
  }

  // props.text
  if (block.props?.text) return block.props.text;

  return "";
}
