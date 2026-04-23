---
name: save-to-graphium
description: 現在の会話の要約を Graphium のノートとして保存する。「この議論を Graphium に保存して」「いまの話を Graphium にまとめて」のように頼まれた場合に使う。Claude Code や VSCode 内の議論をプロジェクト外に残したいとき用。
---

# Save to Graphium

会話の流れを **1 枚のノート** に要約して、ローカルの Graphium ノート一覧（`~/Documents/Graphium/notes/`）に書き込むスキル。ユーザーが Graphium を再読み込みすれば通常のノートと同じように表示される。Inbox 等の staging は持たない。

## いつ使うか

- 「この議論を Graphium に保存して」「Graphium にまとめて」と指示されたとき
- 会話内の設計判断・調査結果・手順などをプロジェクト外に残したいとき
- ユーザーが明示的に `/save-to-graphium` を呼び出したとき

## やること

1. **直近の会話からノートを下書きする**
   - **タイトル**: 1 行・60 字以内・日本語可。会話の主題を具体的に表す短い名詞句にする（例: 「Graphium 保存 Skill の設計決定」）
   - **本文**: Markdown。構造は議論の流れに合わせて柔軟に。迷ったら以下のセクションから関係するものだけ選ぶ:
     - `## 背景 / 動機`
     - `## 検討した選択肢`
     - `## 決定`
     - `## 未解決・次のアクション`
     - `## 参考コード` (該当コード・ファイル名・行番号)
   - 会話で出た **キーワードや固有名詞は必ず残す**（後から検索でヒットするように）
   - 冒頭 1-2 行でノート全体の要約を書く（Graphium の一覧プレビュー用）

2. **スクリプトを呼び出して書き込む**

   このスキル自身のパス（例: `~/.claude/skills/save-to-graphium/save.mjs`）を `node` に渡し、JSON を stdin で流し込む:

   ```bash
   node ~/.claude/skills/save-to-graphium/save.mjs <<'EOF'
   {
     "title": "<タイトル>",
     "body": "<Markdown 本文>",
     "source": "<任意: Claude Code のセッションIDなど>",
     "model": "<自分のモデル ID。例: claude-opus-4-7>"
   }
   EOF
   ```

   - ヒアドキュメントの区切り (`EOF`) は本文と衝突しない文字列にすること
   - body の改行や `"` は JSON としてエスケープする
   - `model` には **自分（Claude）が知っている自分のモデル ID** を渡す。システムコンテキストの "The exact model ID is ..." を参照する
   - スクリプトは `noteId`、`filePath`、`author` を含む JSON を 1 行で返す
   - **会話コンテキストに含まれる userEmail を勝手に `author.email` に差し込まないこと**（プライバシー方針セクション参照）

3. **ユーザーに報告する**
   - 書き込んだファイルパスと noteId を伝える
   - 「Graphium を再起動（または再読み込み）するとノート一覧に表示されます」と添える
   - 本文の要約を 1-2 行で返し、望ましくなければ上書きできることを示す

## 誰が保存したかの記録（プライバシー方針）

`save.mjs` は `generatedBy.user` にノートの作成者情報を記録する。プライバシーを考慮し、以下の方針で動く:

| 項目 | 扱い |
| ---- | ---- |
| `username` (OS ユーザー名、例: `masayakumagai`) | **常に記録される** (`os.userInfo().username`)。Graphium 内でどの PC から保存されたか識別するための最小情報 |
| `email` | **opt-in のみ**。下記いずれかの場合に記録される |

email が記録されるのは以下いずれかの場合だけ:

1. 環境変数 `GRAPHIUM_USER_EMAIL` が設定されているとき
2. 呼び出し JSON に `author.email` を明示的に渡したとき（例: ユーザーが「自分のメールアドレスも記録して」と指示した場合のみ）

**Claude は会話コンテキストに `userEmail` があっても、ユーザーの明示的な同意なしに `author.email` として渡してはいけない**。Graphium のノートは将来 Knowledge Pack (`G-KPACK`) などで外部公開される可能性があるため、デフォルトで email を書き残すとプライバシーリスクがある。

ユーザーが「誰が保存したかを Graphium のログイン email で残したい」と明示したときだけ、以下のように渡す:

```json
{ "title": "...", "body": "...", "author": { "email": "user@example.com" } }
```

## 保存先のカスタマイズ

デフォルトは `~/Documents/Graphium/notes/`。別の場所に保存したい場合は環境変数:

```bash
GRAPHIUM_NOTES_DIR="/path/to/notes" node .../save.mjs <<EOF ...
```

将来 Graphium 本体に `G-SAVEDIR`（保存先 UI 設定）が入ったら、設定ファイルから自動で読む形に拡張予定。

## やらないこと

- **ファイルを自動で開く・ブラウザを起動する** — スキルは書き込みだけで完結する
- **Graphium のインデックスを直接書き換える** — 次回起動時に Graphium 側が差分更新する
- **複数ノートへの分割書き込み** — 1 スキル呼び出し = 1 ノート。別トピックなら改めて呼び直す
- **画像・添付ファイルの書き込み** — テキストのみ。メディアは Graphium 側で追加する

## 注意

- 対応する Markdown は「見出し h1-h3 / 箇条書き / コードブロック / パラグラフ」のみ。表やインライン装飾（太字・リンク）は本文テキストとしてそのまま残るが、BlockNote のリッチ表示にはならない。必要なら Graphium 側で追記編集する
- 書き込み後に Graphium アプリが起動中でも、アプリ内の一覧は自動更新されない。ユーザーに再読み込みを促すこと
