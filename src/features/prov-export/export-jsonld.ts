// PROV-JSON-LD エクスポート機能
// ノート（ページ）単位で PROV-JSON-LD ファイルをダウンロードする

import type { ProvJsonLd } from "../prov-generator";

/**
 * W3C PROV 準拠の @context を付与した完全な JSON-LD ドキュメントを生成
 */
function buildFullJsonLd(provDoc: ProvJsonLd, title: string): object {
  return {
    "@context": {
      ...provDoc["@context"],
      foaf: "http://xmlns.com/foaf/0.1/",
      dcterms: "http://purl.org/dc/terms/",
    },
    "@id": `provnote:document/${encodeURIComponent(title)}`,
    "@type": "prov:Bundle",
    "dcterms:title": title,
    "dcterms:created": new Date().toISOString(),
    "@graph": provDoc["@graph"],
    ...(provDoc["provnote:warnings"] && provDoc["provnote:warnings"].length > 0
      ? { "provnote:warnings": provDoc["provnote:warnings"] }
      : {}),
    ...(provDoc["provnote:documentProvenance"]
      ? { "provnote:documentProvenance": provDoc["provnote:documentProvenance"] }
      : {}),
  };
}

/**
 * PROV-JSON-LD をファイルとしてダウンロード
 */
export function exportProvJsonLd(options: {
  title: string;
  provDoc: ProvJsonLd;
}): void {
  const { title, provDoc } = options;

  const jsonLd = buildFullJsonLd(provDoc, title);
  const jsonStr = JSON.stringify(jsonLd, null, 2);

  const blob = new Blob([jsonStr], { type: "application/ld+json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[/\\?%*:|"<>]/g, "_")}.jsonld`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
