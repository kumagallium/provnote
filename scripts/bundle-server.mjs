// Hono サーバーを単一ファイルにバンドルするスクリプト
// Tauri sidecar として同梱するために使用
import { build } from "esbuild";

await build({
  entryPoints: ["src/server/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "src-tauri/sidecar/server.mjs",
  // Node.js 組み込みモジュールは外部化
  external: ["node:*"],
  // バナーで import.meta.url 対応
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  minify: true,
  sourcemap: false,
});

console.log("Server bundled to src-tauri/sidecar/server.mjs");
