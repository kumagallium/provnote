# Claude Code Skills for Graphium

Graphium をより滑らかに使うための [Claude Code Skill](https://docs.claude.com/en/docs/claude-code/skills) 群。どれも Graphium リポジトリと一緒にバージョン管理されている — Graphium のノートフォーマットに依存するためだ。

## Available skills

| Skill | What it does |
| ----- | ------------ |
| [`save-to-graphium`](./save-to-graphium/) | Save the current Claude Code conversation as a new Graphium note (`~/Documents/Graphium/notes/<uuid>.json`). |

## Install

Claude Code の [user-level skills](https://docs.claude.com/en/docs/claude-code/skills#install-a-skill) は `~/.claude/skills/` 配下の各ディレクトリに `SKILL.md` があるものを拾う。**シンボリックリンクで十分** なので、リポジトリを更新すればスキルも更新される。

```sh
# リポジトリルートで実行
mkdir -p ~/.claude/skills
ln -s "$(pwd)/scripts/claude-code-skill/save-to-graphium" ~/.claude/skills/save-to-graphium
```

Claude Code を再起動（または `/skills` で再読み込み）すると、`save-to-graphium` が一覧に現れる。

### Uninstall

```sh
rm ~/.claude/skills/save-to-graphium
```

## Requirements

- Node.js 20+ (標準ライブラリのみ使用)
- macOS / Linux (Windows は未検証。保存先パスが異なる)

## How to use

Claude Code セッション中に自然言語で:

```
この議論を Graphium に保存して
```

あるいは明示呼び出し:

```
/save-to-graphium
```

会話が要約されて `~/Documents/Graphium/notes/<uuid>.json` に書き出される。Graphium を再読み込みするとノート一覧に現れる。

保存先を変えたい場合は `GRAPHIUM_NOTES_DIR` を設定する:

```sh
export GRAPHIUM_NOTES_DIR=/custom/path
```
