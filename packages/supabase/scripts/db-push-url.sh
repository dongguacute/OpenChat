#!/usr/bin/env sh
# 在 packages/supabase 下执行: pnpm run push:url
# 需先设置: export SUPABASE_DB_URL='postgresql://...'（与 CLI 要求一致，含密码的 URI 需做百分号编码）
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo >&2 "未设置 SUPABASE_DB_URL。请在当前 shell 中执行，例如："
  echo >&2 "  export SUPABASE_DB_URL='postgresql://postgres:...@db.xxxxx.supabase.co:5432/postgres'"
  echo >&2 "连接串可在 Supabase Dashboard → Project Settings → Database 获取（直连 / Session）。"
  exit 1
fi
exec supabase db push --db-url "$SUPABASE_DB_URL" "$@"
