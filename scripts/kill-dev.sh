#!/bin/bash
# dev サーバー起動前の準備スクリプト（predev で自動実行）
#
# 1. 既存の dev サーバーを停止（デスクトップ sidecar は除外）
# 2. data/models.json を本体 worktree と共有（シンボリックリンク）

# ── 1. 既存 dev サーバーの停止 ──
killed=0

for port in 5174 3001; do
  pids=$(lsof -i :"$port" -t 2>/dev/null)
  for pid in $pids; do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null)
    # デスクトップアプリの sidecar は除外
    if echo "$cmd" | grep -q "Graphium.app"; then
      continue
    fi
    # node プロセスのみ対象
    if echo "$cmd" | grep -q "node"; then
      kill "$pid" 2>/dev/null && {
        echo "[kill-dev] Stopped PID $pid (port $port)"
        killed=$((killed + 1))
      }
    fi
  done
done

if [ "$killed" -eq 0 ]; then
  echo "[kill-dev] No existing dev servers found"
fi

# ── 2. data/models.json の共有 ──
# worktree の場合、本体の data/models.json をシンボリックリンクで共有する
# これにより AI モデル登録を全 worktree で共有できる

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/data"
MODELS_FILE="$DATA_DIR/models.json"

# worktree かどうか判定（.git がファイルなら worktree）
if [ -f "$PROJECT_DIR/.git" ]; then
  # サブモジュール worktree の場合、.git ファイルから本体を特定
  # gitdir: /path/to/.git/modules/provnote/worktrees/<name>
  GITDIR=$(sed 's/^gitdir: //' "$PROJECT_DIR/.git")
  # worktrees/<name> を含むなら、そこから本体を逆算
  if echo "$GITDIR" | grep -q "/worktrees/"; then
    # .git/modules/provnote/worktrees/<name> → .git/modules/provnote
    MODULE_GIT_DIR=$(echo "$GITDIR" | sed 's|/worktrees/.*||')
    # commondir ファイルがあれば本体の .git を指す
    if [ -f "$MODULE_GIT_DIR/commondir" ]; then
      MODULE_GIT_DIR="$(cd "$MODULE_GIT_DIR" && cd "$(cat commondir)" && pwd)"
    fi
    # 本体の worktree パスを取得
    MAIN_WORKTREE=$(git --git-dir="$MODULE_GIT_DIR" config core.worktree 2>/dev/null)
    # 相対パスなら絶対パスに変換
    if [ -n "$MAIN_WORKTREE" ] && [ "${MAIN_WORKTREE:0:1}" != "/" ]; then
      MAIN_WORKTREE="$(cd "$MODULE_GIT_DIR" && cd "$MAIN_WORKTREE" && pwd)"
    fi
    if [ -z "$MAIN_WORKTREE" ]; then
      # core.worktree が未設定の場合、git worktree list から取得
      MAIN_WORKTREE=$(git -C "$PROJECT_DIR" worktree list 2>/dev/null | head -1 | awk '{print $1}')
      # サブモジュールの場合 .git/modules/... が返されるので、実際のパスに変換
      if echo "$MAIN_WORKTREE" | grep -q "/.git/"; then
        # 親リポジトリの .git/modules/provnote → 親リポジトリ/provnote
        PARENT_REPO=$(echo "$MAIN_WORKTREE" | sed 's|/\.git/modules/.*||')
        MODULE_NAME=$(echo "$MAIN_WORKTREE" | sed 's|.*/\.git/modules/||')
        MAIN_WORKTREE="$PARENT_REPO/$MODULE_NAME"
      fi
    fi

    if [ -n "$MAIN_WORKTREE" ] && [ -d "$MAIN_WORKTREE/data" ]; then
      MAIN_MODELS="$MAIN_WORKTREE/data/models.json"
      if [ -f "$MAIN_MODELS" ] && [ ! -L "$MODELS_FILE" ]; then
        mkdir -p "$DATA_DIR"
        # 既存ファイルがあればバックアップ
        if [ -f "$MODELS_FILE" ]; then
          mv "$MODELS_FILE" "$MODELS_FILE.bak"
          echo "[kill-dev] Backed up existing models.json"
        fi
        ln -s "$MAIN_MODELS" "$MODELS_FILE"
        echo "[kill-dev] Linked models.json → $MAIN_MODELS"
      elif [ -L "$MODELS_FILE" ]; then
        echo "[kill-dev] models.json already linked"
      fi
    fi
  fi
fi
