/**
 * デモ GIF 録画スクリプト
 *
 * ブラウザを開き、手動操作を録画して GIF に変換する。
 *
 * 使い方:
 *   pnpm dev --port 5174 &                      # 開発サーバー起動
 *   node scripts/record-demo.mjs                 # デフォルト: サンドボックスモード
 *   node scripts/record-demo.mjs --url "http://localhost:5174/Graphium/?sandbox"
 *   node scripts/record-demo.mjs --name "label-demo" --duration 30
 *
 * オプション:
 *   --url <url>       録画対象 URL（デフォルト: http://localhost:5174/Graphium/?sandbox）
 *   --name <name>     出力ファイル名（デフォルト: demo）
 *   --duration <sec>  最大録画時間（デフォルト: 60 秒）
 *   --width <px>      ビューポート幅（デフォルト: 1280）
 *   --height <px>     ビューポート高さ（デフォルト: 800）
 *   --fps <n>         GIF フレームレート（デフォルト: 12）
 *   --scale <px>      GIF 出力幅（デフォルト: 800）
 *
 * 出力:
 *   docs/screenshots/<name>.webm  — 元動画
 *   docs/screenshots/<name>.gif   — 変換後 GIF
 */
import { chromium } from "playwright";
import { execSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as readline from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "../docs/screenshots");
mkdirSync(OUTPUT_DIR, { recursive: true });

// 引数パース
function getArg(name, defaultVal) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 && process.argv[idx + 1]
    ? process.argv[idx + 1]
    : defaultVal;
}

const url = getArg(
  "url",
  "http://localhost:5174/Graphium/?sandbox",
);
const name = getArg("name", "demo");
const maxDuration = parseInt(getArg("duration", "60"), 10);
const width = parseInt(getArg("width", "1280"), 10);
const height = parseInt(getArg("height", "800"), 10);
const fps = parseInt(getArg("fps", "12"), 10);
const scale = parseInt(getArg("scale", "800"), 10);

const videoDir = resolve(OUTPUT_DIR, ".video-tmp");
mkdirSync(videoDir, { recursive: true });

console.log(`
┌─────────────────────────────────────┐
│   Graphium Demo Recorder            │
├─────────────────────────────────────┤
│  URL:      ${url}
│  Output:   ${name}.gif
│  Max:      ${maxDuration}s
│  Size:     ${width}x${height} → ${scale}px GIF
│  FPS:      ${fps}
└─────────────────────────────────────┘

ブラウザが開きます。操作してください。
録画を終了するには、ターミナルで Enter を押してください。
`);

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width, height },
  recordVideo: {
    dir: videoDir,
    size: { width, height },
  },
});

const page = await context.newPage();
await page.goto(url, { waitUntil: "load", timeout: 15000 });
await page.waitForTimeout(1000);

console.log("Recording... (Enter で終了)");

// タイマー設定
const startTime = Date.now();
const timer = setInterval(() => {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  process.stdout.write(`\r  ${elapsed}s / ${maxDuration}s`);
  if (elapsed >= maxDuration) {
    console.log("\n最大録画時間に達しました。");
    clearInterval(timer);
    finish();
  }
}, 1000);

// Enter 待ち
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function finish() {
  rl.close();
  clearInterval(timer);
  (async () => {
    // ページを閉じて動画を保存
    const videoPath = await page.video().path();
    await page.close();
    await context.close();
    await browser.close();

    const webmOut = `${OUTPUT_DIR}/${name}.webm`;
    const gifOut = `${OUTPUT_DIR}/${name}.gif`;

    // 動画ファイルを移動
    execSync(`mv "${videoPath}" "${webmOut}"`);
    console.log(`\n\nWebM saved: ${webmOut}`);

    // ffmpeg で GIF 変換
    console.log("Converting to GIF...");
    try {
      execSync(
        `ffmpeg -y -i "${webmOut}" -vf "fps=${fps},scale=${scale}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 "${gifOut}"`,
        { stdio: "pipe" },
      );
      console.log(`GIF saved: ${gifOut}`);

      // ファイルサイズ表示
      const { statSync } = await import("fs");
      const webmSize = (statSync(webmOut).size / 1024 / 1024).toFixed(1);
      const gifSize = (statSync(gifOut).size / 1024 / 1024).toFixed(1);
      console.log(`  WebM: ${webmSize} MB`);
      console.log(`  GIF:  ${gifSize} MB`);
    } catch (e) {
      console.error("ffmpeg conversion failed:", e.message);
      console.log("WebM file is still available at:", webmOut);
    }

    // 一時ディレクトリ削除
    execSync(`rm -rf "${videoDir}"`);
    console.log("\nDone!");
    process.exit(0);
  })();
}

rl.on("line", () => {
  finish();
});
