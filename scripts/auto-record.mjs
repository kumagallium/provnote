/**
 * 自動デモ GIF 録画スクリプト
 *
 * Playwright で操作シナリオを自動実行し、GIF に変換する。
 * headless で動作するため CI や Claude Code から実行可能。
 *
 * 使い方:
 *   pnpm dev --port 5174 &
 *   node scripts/auto-record.mjs --scenario sandbox-tour
 *   node scripts/auto-record.mjs --scenario label-prov
 *
 * シナリオ:
 *   sandbox-tour  — サンドボックスを開いてサイドバー操作
 *   label-prov    — ラベル追加 → PROV グラフ表示
 */
import { chromium } from "playwright";
import { execSync } from "child_process";
import { mkdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "../docs/screenshots");
const VIDEO_DIR = resolve(OUTPUT_DIR, ".video-tmp");
mkdirSync(VIDEO_DIR, { recursive: true });

const scenario = process.argv.includes("--scenario")
  ? process.argv[process.argv.indexOf("--scenario") + 1]
  : "sandbox-tour";

const BASE = "http://localhost:5174/Graphium/";

console.log(`Recording scenario: ${scenario}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
});

const page = await context.newPage();

// --- シナリオ定義 ---

async function sandboxTour() {
  await page.goto(`${BASE}?sandbox`, { waitUntil: "load" });
  await page.waitForTimeout(2000);

  // サイドバーのデモを順番にクリック
  const demos = [
    "ベースエディタ",
    "Hello Block",
    "コンテキストラベル",
  ];
  for (const name of demos) {
    const btn = page.getByText(name, { exact: false }).first();
    if ((await btn.count()) > 0) {
      await btn.click();
      await page.waitForTimeout(2000);
    }
  }
  await page.waitForTimeout(1000);
}

async function labelProv() {
  await page.goto(`${BASE}?sandbox`, { waitUntil: "load" });
  await page.waitForTimeout(2000);

  // 「コンテキストラベル + リンク」デモを開く
  const labelBtn = page.getByText("コンテキストラベル", { exact: false }).first();
  if ((await labelBtn.count()) > 0) {
    await labelBtn.click();
    await page.waitForTimeout(2000);
  }

  // エディタ内をスクロールして内容を見せる
  const editor = page.locator("[class*=editor], [class*=Editor], main").first();
  if ((await editor.count()) > 0) {
    await editor.evaluate((el) => el.scrollTo(0, 200));
    await page.waitForTimeout(1500);
    await editor.evaluate((el) => el.scrollTo(0, 0));
    await page.waitForTimeout(1000);
  }

  // 「生成」ボタンをクリックして PROV グラフを表示
  const provBtn = page.getByRole("button", { name: "生成" });
  if ((await provBtn.count()) > 0) {
    await provBtn.click();
    await page.waitForTimeout(4000);
  }

  await page.waitForTimeout(1000);
}

// --- シナリオ実行 ---
const scenarios = {
  "sandbox-tour": sandboxTour,
  "label-prov": labelProv,
};

const scenarioFn = scenarios[scenario];
if (!scenarioFn) {
  console.error(`Unknown scenario: ${scenario}`);
  console.log(`Available: ${Object.keys(scenarios).join(", ")}`);
  process.exit(1);
}

await scenarioFn();

// 録画保存
const videoPath = await page.video().path();
await page.close();
await context.close();
await browser.close();

const webmOut = `${OUTPUT_DIR}/${scenario}.webm`;
const gifOut = `${OUTPUT_DIR}/${scenario}.gif`;

execSync(`mv "${videoPath}" "${webmOut}"`);
console.log(`WebM: ${webmOut}`);

// GIF 変換
console.log("Converting to GIF...");
try {
  execSync(
    `ffmpeg -y -i "${webmOut}" -vf "fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 "${gifOut}"`,
    { stdio: "pipe" },
  );
  const webmSize = (statSync(webmOut).size / 1024 / 1024).toFixed(1);
  const gifSize = (statSync(gifOut).size / 1024 / 1024).toFixed(1);
  console.log(`GIF: ${gifOut} (${gifSize} MB, WebM: ${webmSize} MB)`);
} catch (e) {
  console.error("ffmpeg failed:", e.message);
}

execSync(`rm -rf "${VIDEO_DIR}"`);
console.log("Done!");
