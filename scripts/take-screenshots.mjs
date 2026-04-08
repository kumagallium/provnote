/**
 * スクリーンショット撮影スクリプト（本番 UI 対応）
 *
 * Google OAuth ログイン後にスクリーンショットを撮影する。
 * ユーザーがログイン → Claude が撮影、という分担が可能。
 *
 * 使い方:
 *   pnpm dev --port 5174 &
 *   node scripts/take-screenshots.mjs
 *   node scripts/take-screenshots.mjs --port 5174 --headless
 *
 * オプション:
 *   --port <port>     開発サーバーのポート（デフォルト: 5174）
 *   --headless        ヘッドレスモード（ログイン不要な画面のみ）
 *   --storybook       Storybook モード（ポート 6006）
 *
 * 出力先: docs/screenshots/
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as readline from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "../docs/screenshots");
mkdirSync(OUTPUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 5174;
const headless = args.includes("--headless");
const storybook = args.includes("--storybook");

const BASE_URL = `http://localhost:${port}/Graphium/`;

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

const browser = await chromium.launch({ headless });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});

async function capture(page, name) {
  const path = `${OUTPUT_DIR}/${name}.png`;
  await page.screenshot({ path });
  console.log(`  OK ${name}`);
}

if (storybook) {
  // Storybook モード（ログイン不要）
  const SB = `http://localhost:6006/iframe.html`;
  const stories = [
    ["organisms-editor--with-initial-content", "editor-content"],
    ["organisms-networkgraph--multi-hop", "graph"],
    ["organisms-provgenerator--with-samples", "prov-generator"],
    ["organisms-labelgalleryview--default", "label-gallery"],
    ["organisms-labelbadge--all-labels", "context-labels"],
    ["navigation-notelistview--default", "note-list"],
  ];
  console.log("Storybook screenshots:");
  for (const [id, name] of stories) {
    const page = await ctx.newPage();
    await page.goto(`${SB}?id=${id}&viewMode=story`, {
      waitUntil: "load",
      timeout: 15000,
    });
    await page.waitForTimeout(3000);
    await capture(page, name);
    await page.close();
  }
} else {
  // 本番 UI モード
  const page = await ctx.newPage();

  // ログインページ撮影（ログイン不要）
  await page.goto(BASE_URL, { waitUntil: "load", timeout: 15000 });
  await page.waitForTimeout(1500);
  await capture(page, "login");

  if (!headless) {
    // ログイン待ち
    console.log("\nブラウザが開きました。Google ログインしてください。");
    await prompt("ログイン完了後 Enter を押してください... ");

    // ログイン後のメイン画面を撮影
    await page.waitForTimeout(2000);
    await capture(page, "main");

    // ユーザーに画面操作を任せて追加撮影
    console.log("\n撮影したい画面に移動してください。");
    console.log("Enter を押すたびにスクリーンショットを撮ります。");
    console.log("'q' + Enter で終了。\n");

    let shotNum = 1;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    for await (const line of rl) {
      if (line.trim().toLowerCase() === "q") break;
      await capture(page, `shot-${String(shotNum).padStart(2, "0")}`);
      shotNum++;
    }
  }

  await page.close();
}

await browser.close();
console.log(`\nDone! Screenshots saved to docs/screenshots/`);
