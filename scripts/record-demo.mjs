/**
 * デモ録画スクリプト（本番 UI 対応）
 *
 * Google OAuth ログイン後にスクリーンショット撮影または GIF 録画を行う。
 *
 * 使い方:
 *   pnpm dev --port 5174 &
 *
 *   # 手動操作を録画（ログイン → 操作 → Enter で終了）
 *   node scripts/record-demo.mjs --name "my-demo"
 *
 *   # ログイン後にスクリーンショットだけ撮る
 *   node scripts/record-demo.mjs --mode screenshot
 *
 *   # ログイン後に Claude が自動操作して録画
 *   node scripts/record-demo.mjs --mode auto --name "label-prov"
 *
 * オプション:
 *   --mode <mode>     manual（デフォルト）/ screenshot / auto
 *   --name <name>     出力ファイル名（デフォルト: demo）
 *   --duration <sec>  最大録画時間（デフォルト: 60 秒）
 *   --port <port>     開発サーバーのポート（デフォルト: 5174）
 *   --no-gif          GIF 変換をスキップ（WebM のみ保存）
 *
 * 出力:
 *   docs/screenshots/<name>.png   — スクリーンショット
 *   docs/screenshots/<name>.gif   — GIF アニメーション
 */
import { chromium } from "playwright";
import { execSync } from "child_process";
import { mkdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as readline from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "../docs/screenshots");
mkdirSync(OUTPUT_DIR, { recursive: true });

function getArg(name, defaultVal) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1]
    ? process.argv[idx + 1]
    : defaultVal;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const mode = getArg("mode", "manual");
const name = getArg("name", "demo");
const maxDuration = parseInt(getArg("duration", "60"), 10);
const port = parseInt(getArg("port", "5174"), 10);
const skipGif = hasFlag("no-gif");

const BASE_URL = `http://localhost:${port}/Graphium/`;
const videoDir = resolve(OUTPUT_DIR, ".video-tmp");
mkdirSync(videoDir, { recursive: true });

function prompt(msg) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(msg, () => {
      rl.close();
      resolve();
    });
  });
}

console.log(`
┌───────────────────────────────────────┐
│   Graphium Demo Recorder              │
├───────────────────────────────────────┤
│  Mode:     ${mode}
│  URL:      ${BASE_URL}
│  Output:   ${name}
│  Max:      ${maxDuration}s
└───────────────────────────────────────┘
`);

// ブラウザ起動（ヘッド付き = 画面が見える）
const isRecording = mode === "manual" || mode === "auto";
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  ...(isRecording
    ? { recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } } }
    : {}),
});

const page = await context.newPage();

// ログインページを開く
await page.goto(BASE_URL, { waitUntil: "load", timeout: 15000 });

console.log("ブラウザが開きました。");
console.log("Google アカウントでログインしてください。");
await prompt("\nログインが完了したら Enter を押してください... ");

console.log("ログイン確認OK。");

// --- モード別処理 ---

if (mode === "screenshot") {
  // スクリーンショット撮影
  await page.waitForTimeout(1000);
  const path = `${OUTPUT_DIR}/${name}.png`;
  await page.screenshot({ path });
  console.log(`Screenshot saved: ${path}`);
  await browser.close();
  process.exit(0);
}

if (mode === "auto") {
  // Claude が自動操作するモード
  // ここに操作を追記する（Claude Code から実行時にスクリプトを編集）
  console.log("自動操作モード: 操作を開始します...");
  await page.waitForTimeout(2000);

  // 現在のページの状態をスクリーンショット
  await page.screenshot({
    path: `${OUTPUT_DIR}/${name}-before.png`,
  });
  console.log("  → before screenshot saved");

  // ここで Claude が追加の操作を行える
  // 例: ノート選択、ラベル操作、PROV生成 etc.

  await prompt("\n自動操作を終了するには Enter を押してください... ");
}

if (mode === "manual") {
  // 手動録画モード
  console.log("録画中です。操作してください。");

  const startTime = Date.now();
  const timer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    process.stdout.write(`\r  ${elapsed}s / ${maxDuration}s`);
    if (elapsed >= maxDuration) {
      console.log("\n最大録画時間に達しました。");
      clearInterval(timer);
    }
  }, 1000);

  await prompt("\n録画を終了するには Enter を押してください... ");
  clearInterval(timer);
}

// --- 録画保存 ---
if (isRecording) {
  const videoPath = await page.video().path();
  await page.close();
  await context.close();
  await browser.close();

  const webmOut = `${OUTPUT_DIR}/${name}.webm`;
  const gifOut = `${OUTPUT_DIR}/${name}.gif`;

  execSync(`mv "${videoPath}" "${webmOut}"`);
  console.log(`\nWebM saved: ${webmOut}`);

  if (!skipGif) {
    console.log("Converting to GIF...");
    try {
      execSync(
        `ffmpeg -y -i "${webmOut}" -vf "fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 "${gifOut}"`,
        { stdio: "pipe" },
      );
      const webmSize = (statSync(webmOut).size / 1024 / 1024).toFixed(1);
      const gifSize = (statSync(gifOut).size / 1024 / 1024).toFixed(1);
      console.log(`GIF saved: ${gifOut}`);
      console.log(`  WebM: ${webmSize} MB / GIF: ${gifSize} MB`);
    } catch (e) {
      console.error("ffmpeg failed:", e.message);
      console.log("WebM file is available at:", webmOut);
    }
  }

  execSync(`rm -rf "${videoDir}"`);
} else {
  await browser.close();
}

console.log("\nDone!");
