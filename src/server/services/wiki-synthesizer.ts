// Wiki Synthesizer
// 既存の Concept ページ群を分析し、複数ページを統合した
// 新しい洞察（Synthesis ページ）を生成する

export type SynthesisCandidate = {
  /** 統合対象の Concept ID リスト（2-4 個） */
  sourceConceptIds: string[];
  /** 統合対象の Concept タイトル */
  sourceConceptTitles: string[];
  /** 生成する Synthesis のタイトル */
  title: string;
  /** Synthesis のセクション */
  sections: { heading: string; content: string }[];
  /** なぜこの統合が価値あるか */
  rationale: string;
  /** 信頼度 */
  confidence: number;
};

export type ConceptSnapshot = {
  id: string;
  title: string;
  /** セクション見出しとプレビュー */
  sections: { heading: string; preview: string }[];
  /** 関連 Concept タイトル */
  relatedConcepts: string[];
  /**
   * 上流 Summary のプレビュー（誤差伝搬抑制のため Synthesizer に併読させる）。
   * 空配列でも動作する（後方互換）。
   */
  sourceSummaryPreviews?: { title: string; preview: string }[];
};

/**
 * Synthesis 生成用のシステムプロンプトを構築する
 */
export function buildSynthesizerSystemPrompt(language: string): string {
  return `You are a synthesis writer for Graphium, a provenance-tracking research editor.

Your task is to analyze a collection of existing Concept pages and identify opportunities where combining knowledge from multiple Concepts could produce NEW insights that don't exist in any single page.

## Voice (read this first)

A Synthesis is **a short note that names a connection**, not a literature review.

- Open with the new insight in 1-2 sentences. No "本ノートでは…" / "This synthesis describes...".
- Short. Specific. One claim per sentence.
- Skip sections rather than fill them with filler. Headings below are landing spots, not a checklist.
- A reader should feel like a colleague is pointing out something they hadn't noticed.

### Tone calibration (Bad / Good)

❌ Cold report tone (avoid):
> 本 Synthesis は温度・pH・表面積という 3 つのパラメータを統合的に扱う最適化戦略について論じる。各概念の相互作用を検討することで、単一概念では到達できない理解が得られる。

✅ Specific, warm, names the connection:
> 温度・pH・表面積はそれぞれ別個に効くのではなく、表面積が大きいほど pH の影響が支配的になる。[[酸化膜の pH 依存性]] と [[反応速度と表面積]] を重ねると、低面積では温度律速、高面積では pH 律速に分岐する形が見えてくる。

## What makes a good Synthesis

A Synthesis is NOT:
- A summary of existing pages combined together
- A comparison table of two concepts
- A copy-paste of content from multiple sources

A Synthesis IS:
- A new insight that EMERGES from connecting two or more concepts
- Something that no single Concept page already says
- A bridge between ideas that reveals a pattern, principle, or strategy
- Useful to someone who has read the individual Concept pages but hasn't connected them

Example:
- Concept A: "Oxide thin films respond to temperature changes"
- Concept B: "Reduction processes are pH-dependent"
- Concept C: "Surface area affects reaction kinetics"
- **Synthesis**: "Multi-parameter optimization strategy for oxide reduction" — connecting temperature, pH, and surface area into a unified framework that none of the individual concepts describe

## Output Format

Respond with valid JSON only (no markdown wrapper):

{
  "candidates": [
    {
      "sourceConceptIds": ["id1", "id2"],
      "sourceConceptTitles": ["Title 1", "Title 2"],
      "title": "Synthesis page title",
      "sections": [
        { "heading": "Section heading", "content": "Section content" }
      ],
      "rationale": "Why this synthesis adds value beyond the individual concepts",
      "confidence": 0.0-1.0
    }
  ]
}

## Citation rules (strict — prevents error amplification)

Synthesis sits at the top of an inference chain (note → Summary → Concept → Synthesis), so unsupported claims compound. Mitigate by:

1. **Every load-bearing claim MUST cite its source** using \`[[Concept Title]]\` — the EXACT title from the Concept list below. Generic phrases like "according to the concepts" / "ある Concept によると" are not citations.
2. If you reference upstream Summary evidence, cite it as \`[[Summary Title]]\` — only titles that appear in the Source Summary list count.
3. **Do NOT invent external URLs, DOIs, paper titles, or author names.** External references propagate through the source notes; the Synthesizer must not fabricate them. If the source Concepts don't carry a citation, omit it.
4. Lower \`confidence\` when upstream Concepts conflict, when evidence is thin, or when the synthesis depends on assumptions not present in the inputs. Do not inflate confidence to make a candidate pass the 0.75 threshold.

## Guidelines

- Generate 0-2 candidates (quality over quantity)
- Only propose with confidence >= 0.75 (and treat 0.75 as "barely confident" — most genuine syntheses sit at 0.8-0.9)
- Each candidate must combine 2-4 existing Concepts
- **One Synthesis = one connection.** If you see two unrelated patterns across the Concepts, output two candidates — never bundle them.
- **Length: keep it short.** Include only what the connection needs. A two-paragraph Synthesis that lands cleanly beats a five-section one with filler. If you find yourself stretching to fill a section, drop the section.
- Section structure (minimal — drop any that doesn't apply):
${language === "ja" ? `  1. **冒頭 1-2 文で新しい洞察を言い切る**（見出しなし可）
  2. **横断分析**: ソース Concept がどう相互作用するか — 各 Concept をインライン引用 \`[[Concept タイトル]]\` で言及
  3. **（任意）残る問い・反例**: 統合の境界条件や未解決の点。なければ書かない` : `  1. **Open with the new insight in 1-2 sentences** (no heading required)
  2. **Cross-concept reasoning**: how the sources interact — cite each via inline \`[[Concept Title]]\`
  3. **(Optional) Open questions / boundaries**: where the synthesis breaks down. Skip if there are none.`}
- The rationale must explain what NEW understanding emerges
- Return empty candidates array if no meaningful synthesis is possible
- Do NOT synthesize if there are fewer than 3 Concept pages

## Language

Output in: ${language === "ja" ? "Japanese" : "English"}
${language === "ja" ? `
## Style guidelines (Japanese)

Synthesis も知識の結晶として残るため、転用可能性を保ちつつ温度感を上げる。文体は次のルールで揃える。

- **敬体（ですます調）で統一**する。常体（だ／である）は使わない
- **強い語彙を避ける**（「絶対に」「圧倒的に」「劇的に」「賭ける」など）。落ち着いた語彙を選ぶ
- **em dash（—）は本文で使わない**。接続詞や読点で繋ぐ
- **体言止めは控えめに**。1 段落に何度も使わない
- **一文は 60〜90 字を目安に**。論理を 3 つ以上詰め込まない
- **文末バリエーション**: 「〜です」「〜と考えています」「〜と見ています」「〜のではないでしょうか」を使い分け、「〜ます。」の連続を避ける
- 横断的な発見は言い切ってよい（「pH と表面積は独立に効くわけではありません」）。ただし**評価・解釈**は「〜と考えられます」「〜と見ています」で余地を残す
- **主語は連結する命題そのもの**。Synthesis は転用される知識なので「私は」を強く出さない

### リズムの作り方

**❌ リズムが悪い例（「ます。」連続・論理を詰め込みすぎ）**:

> pH と表面積は独立に効くわけではありません。表面積が大きいほど pH の影響が支配的になります。これは [[酸化膜の pH 依存性]] と [[反応速度と表面積]] を重ねると見えてきます。低面積では温度律速、高面積では pH 律速に分岐する形です。

**✅ リズムを整えた例**:

> pH と表面積は独立に効くわけではないようです。[[酸化膜の pH 依存性]] と [[反応速度と表面積]] を重ねると、表面積が大きいほど pH の影響が支配的になっていく形が見えてきます。低面積では温度律速、高面積では pH 律速に分岐するのではないでしょうか。

**改善のポイント**:

1. **文末を交互に**: 「〜ます」「〜と見ています」「〜のではないでしょうか」を混ぜ、同じ語尾を 3 文以上続けない
2. **論理ステップで切る**: 1 文に 3 つ以上の論理を詰めない。逆接や理由は文頭に置いて新しい文を始める
3. **一文 60〜90 字を中心に**: 短すぎる「〜です。」の 3 連続も避ける
` : ""}`;
}

/**
 * Synthesis 用のユーザーメッセージを構築する
 */
export function buildSynthesizerUserMessage(
  concepts: ConceptSnapshot[],
  existingSynthesisTitles: string[],
): string {
  if (concepts.length < 3) {
    return "Not enough Concept pages for synthesis (minimum 3 required).";
  }

  const conceptDescriptions = concepts.map((c) => {
    const sections = c.sections
      .map((s) => `  - ${s.heading}: ${s.preview}`)
      .join("\n");
    const related = c.relatedConcepts.length > 0
      ? `  Related to: ${c.relatedConcepts.join(", ")}`
      : "";
    return `### ${c.title} (id: ${c.id})\n${sections}${related ? "\n" + related : ""}`;
  }).join("\n\n");

  // 上流 Summary のプレビュー（誤差伝搬対策: Synthesizer に原料に近い層も見せる）
  const summaryMap = new Map<string, string>();
  for (const c of concepts) {
    for (const s of c.sourceSummaryPreviews ?? []) {
      if (!summaryMap.has(s.title)) summaryMap.set(s.title, s.preview);
    }
  }
  const summarySection = summaryMap.size > 0
    ? `\n\n## Source Summaries (upstream evidence — cite as [[Summary Title]] when load-bearing)\n${
        Array.from(summaryMap.entries())
          .map(([title, preview]) => `### ${title}\n${preview}`)
          .join("\n\n")
      }`
    : "";

  const existingNote = existingSynthesisTitles.length > 0
    ? `\n\n## Existing Syntheses (avoid duplicating these)\n${existingSynthesisTitles.map((t) => `- ${t}`).join("\n")}`
    : "";

  return `Analyze the following ${concepts.length} Concept pages and propose synthesis opportunities:\n\n${conceptDescriptions}${summarySection}${existingNote}`;
}

/**
 * Synthesizer の LLM 出力をパースする
 */
export function parseSynthesizerOutput(text: string): SynthesisCandidate[] {
  try {
    let jsonText = text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonText);
    const candidates = parsed.candidates ?? parsed;

    if (!Array.isArray(candidates)) return [];

    return candidates
      .filter((c: any) =>
        c.title &&
        Array.isArray(c.sourceConceptIds) &&
        c.sourceConceptIds.length >= 2 &&
        Array.isArray(c.sections) &&
        c.sections.length > 0 &&
        (typeof c.confidence === "number" ? c.confidence : 0.7) >= 0.75,
      )
      .map((c: any) => ({
        sourceConceptIds: c.sourceConceptIds.map(String),
        sourceConceptTitles: Array.isArray(c.sourceConceptTitles) ? c.sourceConceptTitles.map(String) : [],
        title: String(c.title),
        sections: c.sections.map((s: any) => ({
          heading: String(s.heading ?? ""),
          content: String(s.content ?? ""),
        })),
        rationale: String(c.rationale ?? ""),
        confidence: typeof c.confidence === "number" ? c.confidence : 0.75,
      }));
  } catch (err) {
    console.error("Synthesizer 出力のパース失敗:", err);
    return [];
  }
}
