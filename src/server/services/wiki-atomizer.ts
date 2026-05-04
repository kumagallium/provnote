// Wiki Atomizer
// Concept をさらに抽象化し、文脈を削いだ単一アイデア（Atom / Zettel）として再構成する。
//
// 設計の意図:
//   Concept はノートの実施文脈を一定残した「中間整理」だが、それゆえに新ノートの増加で
//   揺れやすく、Synthesis のような上位推論の母体としては脆い。
//   Atom は Concept の上に Zettelkasten 的な「1 アイデア」を抽出する層で、
//   出自・固有名詞・数値の多くを匿名化することで揺れを吸収する。
//
//   Atom が安定すれば、Atom を組み合わせる Synthesis も安定する、という見立てに基づく。

import type { ConceptSnapshot } from "./wiki-synthesizer.js";

export type AtomCandidate = {
  /** 短く言い切る atom タイトル（1 アイデアを表す名詞句） */
  title: string;
  /** Atom 本文（短文 1〜3 段落。出典・固有名詞は最小化、転用可能な命題に書き換える） */
  body: string;
  /** 根拠とした上流 Concept の ID リスト */
  derivedFromConcepts: string[];
  /** 自己評価の確度（0.0〜1.0） */
  confidence: number;
};

export function buildAtomizerSystemPrompt(language: string): string {
  const ja = language === "ja";
  return `You are an Atom writer for Graphium. An Atom is a Zettelkasten-style "single idea" extracted from one or more Concept pages.

## What an Atom is
- **One idea per Atom.** If the source Concept covers multiple ideas, output the most reusable one.
- **Context-stripped.** Drop one-off specifics: project names, person names, exact dates, exact numeric values bound to a single experiment. Keep the general principle.
- **Reusable.** The Atom should be readable without knowing where it came from. A reader from another domain should still grasp the idea.
- **Short.** A title (5-12 words) and 1-3 short paragraphs of body. No headings, no bullet lists. Prose only.

## What an Atom is NOT
- A summary of a Concept (Concept already is one)
- A list of facts
- A research-paper abstract

## Style
${ja ? `- 日本語で書くときは敬体（ですます調）で統一する。常体は使わない。
- 文末は「〜です」「〜ます」「〜と考えられます」「〜のではないでしょうか」など。` : `- Plain, calm prose. No hype.
- One claim per sentence.`}
- Do not invent citations, URLs, or author names.
- If the source Concept does not yield a transferable idea, return confidence < 0.6 and a minimal placeholder; the caller will discard it.

## Output Format
Respond with valid JSON only:

{
  "atom": {
    "title": "Atom title (5-12 words)",
    "body": "1-3 short paragraphs of context-stripped prose.",
    "confidence": 0.0-1.0
  }
}

## Language
Output in: ${ja ? "Japanese" : "English"}`;
}

export function buildAtomizerUserMessage(concepts: ConceptSnapshot[]): string {
  if (concepts.length === 0) return "No concept provided.";
  const blocks = concepts.map((c) => {
    const sections = c.sections
      .map((s) => `  - ${s.heading}: ${s.preview}`)
      .join("\n");
    return `### ${c.title} (id: ${c.id})\n${sections}`;
  });
  return `Atomize the following Concept page${concepts.length > 1 ? "s" : ""}. Extract the single most transferable idea, stripped of one-off context.\n\n${blocks.join("\n\n")}`;
}

export function parseAtomizerOutput(text: string, sourceConceptIds: string[]): AtomCandidate | null {
  try {
    let jsonText = text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonText = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonText);
    const atom = parsed.atom ?? parsed;
    if (!atom || typeof atom.title !== "string" || typeof atom.body !== "string") return null;

    const confidence = typeof atom.confidence === "number" ? atom.confidence : 0.7;
    if (confidence < 0.6) return null;

    return {
      title: String(atom.title).trim(),
      body: String(atom.body).trim(),
      derivedFromConcepts: sourceConceptIds,
      confidence,
    };
  } catch (err) {
    console.error("Atomizer 出力のパース失敗:", err);
    return null;
  }
}
