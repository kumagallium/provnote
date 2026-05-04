import { describe, it, expect } from "vitest";
import { newSharedId, isValidSharedId } from "./id";

describe("newSharedId", () => {
  it("uuidv7 形式の文字列を返す", () => {
    const id = newSharedId();
    expect(isValidSharedId(id)).toBe(true);
  });

  it("連続生成すると時系列順でソート可能", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(newSharedId());
      // uuidv7 は同一ミリ秒内で単調増加する monotonic counter を持つので
      // 通常は sleep 不要だが、念のため微小遅延を入れる
      await new Promise((r) => setTimeout(r, 1));
    }
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  it("生成 ID は重複しない", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(newSharedId());
    expect(set.size).toBe(1000);
  });
});

describe("isValidSharedId", () => {
  it("uuidv7 形式を受理する", () => {
    expect(isValidSharedId("0192f7a8-1234-7abc-89ab-0123456789ab")).toBe(true);
  });

  it("v4 (version nibble = 4) は弾く", () => {
    expect(isValidSharedId("0192f7a8-1234-4abc-89ab-0123456789ab")).toBe(false);
  });

  it("variant が無効なものは弾く", () => {
    expect(isValidSharedId("0192f7a8-1234-7abc-09ab-0123456789ab")).toBe(false);
  });

  it("長さや区切りが違うものは弾く", () => {
    expect(isValidSharedId("not-a-uuid")).toBe(false);
    expect(isValidSharedId("")).toBe(false);
    expect(isValidSharedId("0192f7a812347abc89ab0123456789ab")).toBe(false);
  });

  it("string でない値は弾く", () => {
    expect(isValidSharedId(undefined as unknown as string)).toBe(false);
    expect(isValidSharedId(null as unknown as string)).toBe(false);
    expect(isValidSharedId(123 as unknown as string)).toBe(false);
  });
});
