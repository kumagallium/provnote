// AuthorIdentity store のテスト
// localStorage は node 環境で利用不可のため、最小限のインメモリ shim を用意する。

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadAuthorIdentity,
  saveAuthorIdentity,
  clearAuthorIdentity,
  hasAuthorIdentity,
  validateAuthorIdentity,
} from "./store";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

beforeEach(() => {
  // 各テストの前に localStorage をリセット
  (globalThis as any).localStorage = new MemoryStorage();
});

describe("validateAuthorIdentity", () => {
  it("name と email が揃っていれば ok", () => {
    expect(validateAuthorIdentity({ name: "Ada", email: "a@b.co" })).toEqual({ ok: true });
  });

  it("name が空なら field=name で失敗", () => {
    const r = validateAuthorIdentity({ name: "  ", email: "a@b.co" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("name");
  });

  it("@ を含まない email は失敗", () => {
    const r = validateAuthorIdentity({ name: "Ada", email: "not-an-email" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("email");
  });

  it("@ の前後が空の email は失敗", () => {
    expect(validateAuthorIdentity({ name: "Ada", email: "@b.co" }).ok).toBe(false);
    expect(validateAuthorIdentity({ name: "Ada", email: "a@" }).ok).toBe(false);
  });

  it("空白を含む email は失敗", () => {
    expect(validateAuthorIdentity({ name: "Ada", email: "a @b.co" }).ok).toBe(false);
  });
});

describe("save / load AuthorIdentity", () => {
  it("未登録時は null を返す", () => {
    expect(loadAuthorIdentity()).toBeNull();
    expect(hasAuthorIdentity()).toBe(false);
  });

  it("save した値を load で取り出せる（trim される）", () => {
    saveAuthorIdentity({ name: "  Ada  ", email: " a@b.co " });
    const loaded = loadAuthorIdentity();
    expect(loaded).toEqual({ name: "Ada", email: "a@b.co" });
    expect(hasAuthorIdentity()).toBe(true);
  });

  it("v1.5+ の任意フィールドを保持する", () => {
    saveAuthorIdentity({
      name: "Ada",
      email: "a@b.co",
      public_key: "pk",
      verified_by: "eureco",
      subject: "sub-1",
    });
    expect(loadAuthorIdentity()).toMatchObject({
      name: "Ada",
      email: "a@b.co",
      public_key: "pk",
      verified_by: "eureco",
      subject: "sub-1",
    });
  });

  it("不正な値を save しようとすると例外", () => {
    expect(() => saveAuthorIdentity({ name: "", email: "a@b.co" })).toThrow();
    expect(() => saveAuthorIdentity({ name: "Ada", email: "bad" })).toThrow();
  });

  it("壊れた JSON / バリデーション不正な保存値は null を返す", () => {
    localStorage.setItem("graphium-author-identity", "not-json");
    expect(loadAuthorIdentity()).toBeNull();

    localStorage.setItem(
      "graphium-author-identity",
      JSON.stringify({ name: "", email: "a@b.co" }),
    );
    expect(loadAuthorIdentity()).toBeNull();
  });

  it("clear で削除できる", () => {
    saveAuthorIdentity({ name: "Ada", email: "a@b.co" });
    expect(hasAuthorIdentity()).toBe(true);
    clearAuthorIdentity();
    expect(hasAuthorIdentity()).toBe(false);
  });
});
