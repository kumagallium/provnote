// LocalFolderSharedProvider / LocalFolderBlobProvider のテスト。
// Tauri の invoke をモックしてインメモリ FS をシミュレートする。

import { describe, it, expect, beforeEach, vi } from "vitest";

// invoke モック（vi.hoisted で先に評価し、@tauri-apps/api/core の mock 内から参照する）
const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  LocalFolderSharedProvider,
  LocalFolderBlobProvider,
} from "./local-folder";
import type { SharedEntry } from "./types";
import { newSharedId } from "./id";
import { computeSharedEntryHash, computeBlobHash } from "./hash";

const author = { name: "Ada", email: "a@b.co" };

/** インメモリ FS シミュレーション。各 invoke 呼び出しをハンドルする。 */
class FakeFs {
  /** key = `${entryType}/${id}` → JSON 文字列 */
  entries = new Map<string, string>();
  /** key = hash → base64 */
  blobs = new Map<string, string>();
  /** key = id → JSON 文字列 */
  tombstones = new Map<string, string>();

  install() {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string, args: any) => {
      switch (cmd) {
        case "shared_list": {
          const prefix = `${args.entryType}/`;
          const out: string[] = [];
          for (const [k, v] of this.entries) {
            if (k.startsWith(prefix)) out.push(v);
          }
          return out;
        }
        case "shared_read": {
          const key = `${args.entryType}/${args.id}`;
          const v = this.entries.get(key);
          if (!v) throw new Error(`not found: ${key}`);
          return v;
        }
        case "shared_write": {
          this.entries.set(`${args.entryType}/${args.id}`, args.content);
          return null;
        }
        case "shared_delete": {
          this.entries.delete(`${args.entryType}/${args.id}`);
          this.tombstones.set(args.id, args.tombstoneContent);
          return null;
        }
        case "shared_blob_read": {
          const v = this.blobs.get(args.hash);
          if (!v) throw new Error(`blob not found: ${args.hash}`);
          return v;
        }
        case "shared_blob_write": {
          this.blobs.set(args.hash, args.contentBase64);
          return null;
        }
        case "shared_blob_exists": {
          return this.blobs.has(args.hash);
        }
        default:
          throw new Error(`unmocked invoke: ${cmd}`);
      }
    });
  }
}

let fs: FakeFs;

beforeEach(() => {
  fs = new FakeFs();
  fs.install();
});

function makeEntry(overrides: Partial<SharedEntry> = {}): SharedEntry {
  return {
    id: newSharedId(),
    type: "note",
    author,
    created_at: "2026-05-04T00:00:00Z",
    updated_at: "2026-05-04T00:00:00Z",
    hash: "",
    prov: { derived_from: [] },
    ...overrides,
  };
}

describe("LocalFolderSharedProvider — write / read", () => {
  it("write した entry を read で取り戻せる、hash は自動計算される", async () => {
    const provider = new LocalFolderSharedProvider("/tmp/shared");
    const entry = makeEntry();
    const body = new TextEncoder().encode("hello");

    await provider.write(entry, body);
    const got = await provider.read(entry.id);

    expect(got.entry.id).toBe(entry.id);
    expect(got.entry.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(new TextDecoder().decode(got.body)).toBe("hello");
  });

  it("write 時に呼び出し側の hash 値は無視され、再計算される", async () => {
    const provider = new LocalFolderSharedProvider("/tmp/shared");
    const entry = makeEntry({ hash: "sha256:fake" });
    const body = new TextEncoder().encode("payload");

    await provider.write(entry, body);
    const got = await provider.read(entry.id);
    const expected = await computeSharedEntryHash(
      { ...entry, hash: expect.anything() as unknown as string },
      body,
    );
    // entry.hash は再計算後の値、 "sha256:fake" ではない
    expect(got.entry.hash).not.toBe("sha256:fake");
    expect(got.entry.hash).toBe(expected);
  });

  it("verifyHash は書き込み時に成功する", async () => {
    const provider = new LocalFolderSharedProvider("/tmp/shared");
    const entry = makeEntry();
    await provider.write(entry, new TextEncoder().encode("body"));
    expect(await provider.verifyHash(entry.id)).toBe(true);
  });

  it("verifyHash は本体改ざん時に失敗する", async () => {
    const provider = new LocalFolderSharedProvider("/tmp/shared");
    const entry = makeEntry();
    await provider.write(entry, new TextEncoder().encode("body"));
    // ファイル本体を不正に書き換え（hash は元のまま、body だけ変える）
    const key = `notes/${entry.id}`;
    const stored = JSON.parse(fs.entries.get(key)!);
    stored.body_base64 = btoa("tampered");
    fs.entries.set(key, JSON.stringify(stored));

    expect(await provider.verifyHash(entry.id)).toBe(false);
  });

  it("不正な id は弾く", async () => {
    const provider = new LocalFolderSharedProvider("/tmp/shared");
    await expect(provider.read("not-a-uuid")).rejects.toThrow(/Invalid shared id/);
  });
});

describe("LocalFolderSharedProvider — list", () => {
  it("type ごとに分離して列挙する", async () => {
    const provider = new LocalFolderSharedProvider("/tmp/shared");
    const note = makeEntry({ type: "note" });
    const ref = makeEntry({ type: "reference" });
    await provider.write(note, new TextEncoder().encode("n"));
    await provider.write(ref, new TextEncoder().encode("r"));

    const notes = await provider.list("note");
    const refs = await provider.list("reference");
    expect(notes.map((e) => e.id)).toEqual([note.id]);
    expect(refs.map((e) => e.id)).toEqual([ref.id]);
  });

  it("status='unshared' (tombstone) は list から除外される", async () => {
    const provider = new LocalFolderSharedProvider("/tmp/shared");
    const a = makeEntry();
    const b = makeEntry();
    await provider.write(a, new TextEncoder().encode("a"));
    await provider.write(b, new TextEncoder().encode("b"));
    await provider.delete(a.id);

    const listed = await provider.list("note");
    expect(listed.map((e) => e.id)).toEqual([b.id]);
  });
});

describe("LocalFolderSharedProvider — delete (tombstone)", () => {
  it("delete で本体は消え、tombstone が作られる", async () => {
    const provider = new LocalFolderSharedProvider("/tmp/shared");
    const entry = makeEntry();
    await provider.write(entry, new TextEncoder().encode("x"));
    await provider.delete(entry.id);

    expect(fs.entries.has(`notes/${entry.id}`)).toBe(false);
    expect(fs.tombstones.has(entry.id)).toBe(true);
    const tomb = JSON.parse(fs.tombstones.get(entry.id)!);
    expect(tomb.entry.status).toBe("unshared");
    expect(tomb.entry.unshared_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(tomb.body_base64).toBe("");
  });
});

describe("constructor validation", () => {
  it("空 root は弾く", () => {
    expect(() => new LocalFolderSharedProvider("")).toThrow();
    expect(() => new LocalFolderSharedProvider("   ")).toThrow();
    expect(() => new LocalFolderBlobProvider("")).toThrow();
  });
});

describe("LocalFolderBlobProvider", () => {
  it("put → get で同一 bytes を返す", async () => {
    const blobProv = new LocalFolderBlobProvider("/tmp/blobs");
    const bytes = new TextEncoder().encode("blob payload");
    const ref = await blobProv.put(bytes, { filename: "x.txt" });

    expect(ref.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(ref.filename).toBe("x.txt");
    expect(ref.size).toBe(bytes.length);
    expect(ref.uri).toBe(`local-folder://${ref.hash}`);

    const got = await blobProv.get(ref);
    expect(new TextDecoder().decode(got)).toBe("blob payload");
  });

  it("verifyHash は成功する", async () => {
    const blobProv = new LocalFolderBlobProvider("/tmp/blobs");
    const ref = await blobProv.put(new TextEncoder().encode("x"));
    expect(await blobProv.verifyHash(ref)).toBe(true);
  });

  it("verifyHash は改ざんを検知する", async () => {
    const blobProv = new LocalFolderBlobProvider("/tmp/blobs");
    const ref = await blobProv.put(new TextEncoder().encode("original"));
    // 同じ hash key で別 base64 を上書き（実環境ではコンテンツアドレッシングで起きないが防御確認）
    fs.blobs.set(ref.hash, btoa("tampered"));
    expect(await blobProv.verifyHash(ref)).toBe(false);
  });

  it("exists は put 後に true", async () => {
    const blobProv = new LocalFolderBlobProvider("/tmp/blobs");
    const bytes = new TextEncoder().encode("y");
    const hash = await computeBlobHash(bytes);
    expect(await blobProv.exists(hash)).toBe(false);
    await blobProv.put(bytes);
    expect(await blobProv.exists(hash)).toBe(true);
  });
});
