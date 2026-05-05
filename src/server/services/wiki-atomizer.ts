// Wiki Atomizer
// 複数の Concept を見渡し、Concept をまたいで現れる「共通抽象（= Atom）」を抽出する。
//
// 設計の意図:
//   Concept はノートの実施文脈を一定残した「中間整理」だが、それゆえに新ノートの増加で
//   揺れやすく、Synthesis のような上位推論の母体としては脆い。
//   Atom は「複数の Concept にまたがって繰り返し現れる、文脈を削いだ単一アイデア」を
//   factor out した薄い substrate。1 Concept の言い換えではなく、N Concept の共通抽象を
//   M 個拾い上げる discovery 層として動く。
//
//   Atom が安定すれば、Atom を組み合わせる Synthesis も安定する。

import type { ConceptSnapshot } from "./wiki-synthesizer.js";

export type AtomCandidate = {
  /** 短く言い切る atom タイトル（1 アイデアを表す名詞句） */
  title: string;
  /** Atom 本文（短文 1〜3 段落。出典・固有名詞は最小化、転用可能な命題に書き換える） */
  body: string;
  /** この Atom が因子分解した上流 Concept の ID リスト（最低 2 件、典型的には 2〜5 件） */
  derivedFromConcepts: string[];
  /** 上流 Concept のタイトル（id と同じ並びで対応）。@リンク描画 / noteIndex 解決用。 */
  derivedFromConceptTitles: string[];
  /** 自己評価の確度（0.0〜1.0） */
  confidence: number;
};

export function buildAtomizerSystemPrompt(language: string): string {
  const ja = language === "ja";
  return `You are an Atom discoverer for Graphium. Atoms are Zettelkasten-style "single ideas" that appear repeatedly across multiple Concept pages.

Your job is to scan a set of Concept pages and **factor out** the abstract ideas that recur across them. Each Atom you propose must be supported by at least two Concepts — if an idea only appears in one Concept, it does not warrant an Atom yet.

## What an Atom is
- **One idea per Atom.** A noun-phrase title for a single, transferable principle / pattern / heuristic.
- **Context-stripped.** Drop one-off specifics: project names, person names, exact dates, exact numeric values bound to a single experiment. Keep the general principle in form that survives outside the original Concepts.
- **Cross-cutting.** Each Atom must \`sourceConceptIds\` >= 2. The whole point is to surface ideas that recur — not to re-describe a single Concept.
- **Reusable.** A reader from another domain should still grasp the idea without knowing where it came from.
- **Short.** Title (5-12 words) and 1-3 short paragraphs of body. No headings, no bullet lists. Prose only.

## What an Atom is NOT
- A summary of a single Concept (Concept already is one)
- A "merged Concept" — Atoms abstract, they do not concatenate
- A literature review, a comparison table, a research-paper abstract
- A new emergent insight (that's Synthesis territory) — Atoms surface ideas already implicit in the source Concepts, just made explicit and re-usable

## Output Format
Respond with valid JSON only:

{
  "atoms": [
    {
      "title": "Atom title (5-12 words)",
      "body": "1-3 short paragraphs of context-stripped prose.",
      "sourceConceptIds": ["concept-id-1", "concept-id-2", ...],
      "confidence": 0.0-1.0
    }
  ]
}

## Rules (strict)
- **Each Atom MUST cite >= 2 Concepts** in \`sourceConceptIds\`. Use the EXACT id from the Concept list.
- **Avoid duplicating existing Atoms.** If an Atom title in "Existing Atoms" already covers a pattern, do NOT propose it again. Propose only genuinely new abstractions.
- **Quality over quantity.** Generate 0-5 candidates. If the Concepts don't share enough recurring patterns, return an empty list.
- Only propose with \`confidence >= 0.7\`.
- Do not invent citations, URLs, or author names.

## Style
${ja ? `- 日本語で書くときは敬体（ですます調）で統一する。常体は使わない。
- 文末は「〜です」「〜ます」「〜と考えられます」「〜のではないでしょうか」など。
- ソース Concept が常体でも、Atom は敬体に統一する。` : `- Plain, calm prose. No hype.
- One claim per sentence.`}

## Language
Output in: ${ja ? "Japanese" : "English"}`;
}

export function buildAtomizerUserMessage(
  concepts: ConceptSnapshot[],
  existingAtomTitles: string[],
): string {
  if (concepts.length < 2) {
    return "Not enough Concept pages for atomization (minimum 2 required).";
  }

  const blocks = concepts.map((c) => {
    const sections = c.sections
      .map((s) => `  - ${s.heading}: ${s.preview}`)
      .join("\n");
    return `### ${c.title} (id: ${c.id})\n${sections}`;
  });

  const existingNote = existingAtomTitles.length > 0
    ? `\n\n## Existing Atoms (do NOT duplicate these)\n${existingAtomTitles.map((t) => `- ${t}`).join("\n")}`
    : "";

  return `Scan the following ${concepts.length} Concept pages and factor out the recurring abstract ideas (Atoms) that span 2+ Concepts.\n\n${blocks.join("\n\n")}${existingNote}`;
}

export function parseAtomizerOutput(
  text: string,
  conceptIdToTitle: Map<string, string>,
): AtomCandidate[] {
  try {
    let jsonText = text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonText = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonText);
    const atoms = parsed.atoms ?? parsed;
    if (!Array.isArray(atoms)) return [];

    const out: AtomCandidate[] = [];
    for (const a of atoms) {
      if (!a || typeof a.title !== "string" || typeof a.body !== "string") continue;
      const ids = Array.isArray(a.sourceConceptIds) ? a.sourceConceptIds.map(String) : [];
      if (ids.length < 2) continue;
      // 知らない Concept ID を返してきたら捨てる（hallucination 防御）
      const validIds = ids.filter((id: string) => conceptIdToTitle.has(id));
      if (validIds.length < 2) continue;
      const titles = validIds.map((id: string) => conceptIdToTitle.get(id)!);

      const confidence = typeof a.confidence === "number" ? a.confidence : 0.7;
      if (confidence < 0.7) continue;

      out.push({
        title: String(a.title).trim(),
        body: String(a.body).trim(),
        derivedFromConcepts: validIds,
        derivedFromConceptTitles: titles,
        confidence,
      });
    }
    return out;
  } catch (err) {
    console.error("Atomizer 出力のパース失敗:", err);
    return [];
  }
}
