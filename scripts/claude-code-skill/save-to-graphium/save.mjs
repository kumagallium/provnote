#!/usr/bin/env node
// Graphium のノートとして新規ファイルを書き込む軽量スクリプト。
// Claude Code Skill から呼ばれる想定。詳細は同ディレクトリの SKILL.md 参照。
//
// 入力: stdin に JSON { title: string, body: string, source?: string }
// 出力: stdout に JSON { noteId, filePath, title }
//
// 書き込み先は下記の優先順で解決する:
//   1. 環境変数 GRAPHIUM_NOTES_DIR
//   2. Graphium 本体の設定ファイル (<OS app config>/com.graphium.app/config.json)
//      → `graphiumRoot` が指定されていれば <graphiumRoot>/notes/
//   3. ~/Documents/Graphium/notes/ (Tauri アプリ既定)
//
// 依存なし (Node 20+ 標準ライブラリのみ)。

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** Graphium アプリの設定ディレクトリ（Tauri v2 の app_config_dir と一致させる） */
function graphiumAppConfigDir() {
  const id = "com.graphium.app";
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", id);
  }
  if (process.platform === "win32") {
    const appdata =
      process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appdata, id);
  }
  // Linux / その他: XDG_CONFIG_HOME があればそれ、なければ ~/.config
  const xdg = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(xdg, id);
}

/** Graphium 本体の config.json から graphiumRoot を読む（未設定なら null） */
function readConfiguredGraphiumRoot() {
  const configPath = join(graphiumAppConfigDir(), "config.json");
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, "utf8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const root = parsed?.graphiumRoot;
    if (typeof root === "string" && root.trim().length > 0) {
      return root.trim();
    }
    return null;
  } catch {
    // 壊れた config は無視してフォールバックへ
    return null;
  }
}

function resolveNotesDir() {
  if (process.env.GRAPHIUM_NOTES_DIR) {
    return process.env.GRAPHIUM_NOTES_DIR;
  }
  const configured = readConfiguredGraphiumRoot();
  if (configured) {
    return join(configured, "notes");
  }
  return join(homedir(), "Documents", "Graphium", "notes");
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// BlockNote のブロックひな形を作る共通部分
function makeProps(extra = {}) {
  return {
    textColor: "default",
    backgroundColor: "default",
    textAlignment: "left",
    ...extra,
  };
}

function makeTextContent(text) {
  return [{ type: "text", text, styles: {} }];
}

function headingBlock(level, text) {
  return {
    id: randomUUID(),
    type: "heading",
    props: makeProps({ level }),
    content: makeTextContent(text),
    children: [],
  };
}

function paragraphBlock(text) {
  return {
    id: randomUUID(),
    type: "paragraph",
    props: makeProps(),
    content: makeTextContent(text),
    children: [],
  };
}

function bulletListItemBlock(text) {
  return {
    id: randomUUID(),
    type: "bulletListItem",
    props: makeProps(),
    content: makeTextContent(text),
    children: [],
  };
}

function codeBlock(lang, code) {
  return {
    id: randomUUID(),
    type: "codeBlock",
    props: { language: lang || "text" },
    content: makeTextContent(code),
    children: [],
  };
}

// Markdown -> BlockNote ブロック配列の最小変換。
// 対応: h1-h3, 箇条書き (-,*), 番号なしと番号付きは区別せず bulletListItem として扱う,
//       フェンス付きコードブロック (```lang), 空行区切りのパラグラフ。
// それ以外はすべて paragraph として保持する。
function markdownToBlocks(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // コードブロック
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1] || "text";
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(codeBlock(lang, buf.join("\n")));
      continue;
    }

    // 見出し
    const heading = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (heading) {
      blocks.push(headingBlock(heading[1].length, heading[2]));
      i++;
      continue;
    }

    // 箇条書き (ネスト非対応: 先頭記号をそのまま除去)
    if (/^\s*[-*]\s+/.test(line)) {
      blocks.push(bulletListItemBlock(line.replace(/^\s*[-*]\s+/, "")));
      i++;
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      blocks.push(bulletListItemBlock(line.replace(/^\s*\d+\.\s+/, "")));
      i++;
      continue;
    }

    // 空行はスキップ
    if (line.trim() === "") {
      i++;
      continue;
    }

    // パラグラフ (空行または別種ブロックまで連結)
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push(paragraphBlock(buf.join(" ")));
  }

  if (blocks.length === 0) {
    blocks.push(paragraphBlock(""));
  }
  return blocks;
}

// 誰が保存したかを解決する。プライバシーに配慮し、
// - username は常に OS から取得 (識別性のための最小情報)
// - email は明示的な opt-in (env var または author.email) があった時のみ記録
function resolveAuthor(inputAuthor) {
  const user = { username: userInfo().username };
  const explicitEmail =
    (typeof inputAuthor === "object" && inputAuthor?.email) ||
    process.env.GRAPHIUM_USER_EMAIL ||
    null;
  if (explicitEmail) user.email = explicitEmail;
  return user;
}

function buildDocument({ title, body, source, author, model }) {
  const now = new Date().toISOString();
  const generatedBy = {
    agent: "claude-code",
    sessionId: source ?? "unknown",
    user: resolveAuthor(author),
  };
  if (typeof model === "string" && model.trim()) {
    generatedBy.model = model.trim();
  }
  return {
    version: 2,
    title,
    pages: [
      {
        id: "main",
        title,
        blocks: markdownToBlocks(body),
        labels: {},
        provLinks: [],
        knowledgeLinks: [],
      },
    ],
    generatedBy,
    source: "human",
    createdAt: now,
    modifiedAt: now,
  };
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    console.error("save.mjs: stdin is empty. expected JSON {title, body}.");
    process.exit(1);
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    console.error(`save.mjs: invalid JSON: ${e.message}`);
    process.exit(1);
  }
  if (!input.title || typeof input.title !== "string") {
    console.error("save.mjs: 'title' is required (string).");
    process.exit(1);
  }
  if (typeof input.body !== "string") {
    console.error("save.mjs: 'body' is required (string).");
    process.exit(1);
  }

  const notesDir = resolveNotesDir();
  mkdirSync(notesDir, { recursive: true });

  const noteId = randomUUID();
  const filePath = join(notesDir, `${noteId}.json`);
  const doc = buildDocument(input);
  writeFileSync(filePath, JSON.stringify(doc, null, 2), "utf8");

  process.stdout.write(
    JSON.stringify({
      noteId,
      filePath,
      title: input.title,
      author: doc.generatedBy.user,
    }) + "\n"
  );
}

main().catch((err) => {
  console.error(`save.mjs: ${err?.stack || err}`);
  process.exit(1);
});
