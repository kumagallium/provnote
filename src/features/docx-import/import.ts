// .docx を Graphium ノートに変換する。
// 流れ: docx → mammoth で HTML 抽出 → BlockNote の HTML パーサでブロック化 → GraphiumDocument を組み立てる。
// uploadImage コールバックを渡すと、Word 内の画像はメディア層に分離される（base64 埋め込みではなくなる）。

import mammoth from "mammoth";
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs, defaultStyleSpecs } from "@blocknote/core";
import type { GraphiumDocument } from "../../lib/document-types";

/** ブラウザで表示できる画像 MIME → 拡張子。リスト外は「非対応」として扱う */
const RENDERABLE_IMAGE_EXTS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
};

/** ブラウザで表示できる画像か（EMF/WMF/TIFF など `<img>` で映らない形式は false） */
function isRenderableImageMime(mime: string): boolean {
  return mime.toLowerCase() in RENDERABLE_IMAGE_EXTS;
}

export type DocxImportOptions = {
  /** 画像を Graphium のメディア層にアップロードする処理。返り値は ブロックに埋め込む URL */
  uploadImage?: (file: File) => Promise<string>;
  /** Word 内のハイパーリンクを URL ブックマークとして登録する処理（重複は受け側で吸収する想定） */
  addUrlBookmark?: (url: string, anchorText: string) => void;
};

/** docx ファイル 1 個を Graphium ノートに変換する */
export async function importDocxToGraphiumDoc(
  file: File,
  options: DocxImportOptions = {},
): Promise<GraphiumDocument> {
  const arrayBuffer = await file.arrayBuffer();

  // 画像処理: uploadImage が渡されていればメディア層にアップロード、無ければ mammoth デフォルト（base64）
  const baseTitle = file.name.replace(/\.docx$/i, "") || "Untitled";

  // 画像アップロードを直列化する。多数同時アップロードの取りこぼしを防ぐ
  let uploadChain: Promise<unknown> = Promise.resolve();
  let uploadIndex = 0;
  const stats = { attempted: 0, succeeded: 0, skipped: 0, failed: 0 };

  const mammothOptions = options.uploadImage
    ? {
        convertImage: mammoth.images.imgElement(async (image) => {
          const idx = uploadIndex++;
          stats.attempted++;
          // ブラウザで表示できない形式（EMF / WMF / 不明形式 など）はメディア層に保存しない。
          if (!isRenderableImageMime(image.contentType)) {
            stats.skipped++;
            console.warn(`[docx-import] #${idx} 非対応画像形式をスキップ:`, image.contentType);
            return { src: "" };
          }
          // 直列化: 前のアップロード完了を待つ
          const prev = uploadChain;
          let release: () => void;
          uploadChain = new Promise<void>((r) => { release = r; });
          await prev;
          try {
            const base64 = await image.readAsBase64String();
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const ext = RENDERABLE_IMAGE_EXTS[image.contentType.toLowerCase()];
            const blob = new Blob([bytes], { type: image.contentType });
            const imgFile = new File(
              [blob],
              `${baseTitle}-${crypto.randomUUID().slice(0, 8)}.${ext}`,
              { type: image.contentType },
            );
            console.debug(`[docx-import] #${idx} アップロード開始`, {
              mime: image.contentType,
              size: bytes.length,
            });
            const url = await options.uploadImage!(imgFile);
            stats.succeeded++;
            console.debug(`[docx-import] #${idx} アップロード成功`, { url });
            return { src: url };
          } catch (err) {
            stats.failed++;
            console.error(`[docx-import] #${idx} アップロード失敗、base64 にフォールバック:`, err);
            const base64 = await image.readAsBase64String();
            return { src: `data:${image.contentType};base64,${base64}` };
          } finally {
            release!();
          }
        }),
      }
    : undefined;

  const { value: html } = await mammoth.convertToHtml({ arrayBuffer }, mammothOptions);
  if (options.uploadImage) {
    await uploadChain; // 全アップロード完了を待つ
    console.info(`[docx-import] 画像処理完了`, stats);
  }

  // ハイパーリンク抽出: Word 内の外部 URL を URL ブックマークとして登録する
  if (options.addUrlBookmark) {
    const seen = new Set<string>();
    try {
      const parser = new DOMParser();
      const dom = parser.parseFromString(html, "text/html");
      dom.querySelectorAll("a[href]").forEach((a) => {
        const href = a.getAttribute("href") ?? "";
        if (!/^https?:\/\//i.test(href)) return; // 外部 URL のみ。アンカー (#) や mailto は除外
        if (seen.has(href)) return;
        seen.add(href);
        const text = (a.textContent ?? "").trim() || href;
        options.addUrlBookmark!(href, text);
      });
    } catch (err) {
      console.warn("[docx-import] URL ブックマーク抽出失敗:", err);
    }
  }

  // パース専用の headless エディタ。スキーマはデフォルト＋codeBlock 等を含めず最小構成
  // にする（Graphium のカスタムブロックは編集中に追加されるため、import 時は不要）。
  const schema = BlockNoteSchema.create({
    blockSpecs: defaultBlockSpecs,
    styleSpecs: defaultStyleSpecs,
  });
  const editor = BlockNoteEditor.create({ schema });
  const blocks = editor.tryParseHTMLToBlocks(html);

  const title = baseTitle;
  const now = new Date().toISOString();

  return {
    version: 5,
    title,
    pages: [{
      id: crypto.randomUUID(),
      title,
      blocks: blocks as unknown[] as any[],
      labels: {},
      provLinks: [],
      knowledgeLinks: [],
    }],
    createdAt: now,
    modifiedAt: now,
    source: "human",
  };
}

/** 拡張子から docx 判定 */
export function isDocxFile(file: File): boolean {
  return /\.docx$/i.test(file.name);
}
