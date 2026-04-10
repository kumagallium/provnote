// 登録済みモデルの永続化（JSON ファイル）
// data/models.json に保存する

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

export type ModelConfig = {
  id: string;
  /** 表示名 */
  name: string;
  /** プロバイダー識別子 (anthropic, openai, google, openai-compatible) */
  provider: string;
  /** プロバイダーのモデル ID (claude-sonnet-4-20250514 等) */
  modelId: string;
  /** API キー */
  apiKey: string;
  /** カスタム API ベース URL（OpenAI 互換用） */
  apiBase: string | null;
  createdAt: string;
};

let dataDir = join(process.cwd(), "data");

/** データディレクトリを設定する（テスト・Docker 用） */
export function setDataDir(dir: string): void {
  dataDir = dir;
}

function modelsPath(): string {
  return join(dataDir, "models.json");
}

function ensureDataDir(): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function readModels(): ModelConfig[] {
  try {
    const raw = readFileSync(modelsPath(), "utf-8");
    return JSON.parse(raw) as ModelConfig[];
  } catch {
    return [];
  }
}

function writeModels(models: ModelConfig[]): void {
  ensureDataDir();
  writeFileSync(modelsPath(), JSON.stringify(models, null, 2), "utf-8");
}

export function listModels(): ModelConfig[] {
  return readModels();
}

export function getModel(id: string): ModelConfig | undefined {
  return readModels().find((m) => m.id === id);
}

export function getDefaultModel(): ModelConfig | undefined {
  const models = readModels();
  return models[0];
}

export function addModel(
  input: Omit<ModelConfig, "id" | "createdAt">,
): ModelConfig {
  const models = readModels();
  const model: ModelConfig = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  models.push(model);
  writeModels(models);
  return model;
}

export function updateModel(
  id: string,
  input: Partial<Omit<ModelConfig, "id" | "createdAt">>,
): ModelConfig | undefined {
  const models = readModels();
  const idx = models.findIndex((m) => m.id === id);
  if (idx < 0) return undefined;
  const updated = { ...models[idx], ...input };
  // apiKey が空なら既存のキーを維持（表示名のみ更新のケース）
  if (!input.apiKey) updated.apiKey = models[idx].apiKey;
  models[idx] = updated;
  writeModels(models);
  return updated;
}

export function removeModel(id: string): boolean {
  const models = readModels();
  const filtered = models.filter((m) => m.id !== id);
  if (filtered.length === models.length) return false;
  writeModels(filtered);
  return true;
}
