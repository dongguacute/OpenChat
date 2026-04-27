#!/usr/bin/env bash
# 读取仓库根目录 apps/api/.env 中的 DATABASE_URL，对「本机 supabase start」的库执行 db push。
# 请先: pnpm db:start（或确保 127.0.0.1:54322 可连）
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_PKG="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/api/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo >&2 "找不到 $ENV_FILE，无法读取 DATABASE_URL。"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo >&2 "$ENV_FILE 中未设置 DATABASE_URL。"
  exit 1
fi

cd "$SUPABASE_PKG"
exec supabase db push --db-url "$DATABASE_URL" "$@"
