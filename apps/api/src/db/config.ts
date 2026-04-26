import { createMiddleware } from 'hono/factory'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Pool } from 'pg'

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim()

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export type HonoSupabase = SupabaseClient

export const supabaseMiddleware = createMiddleware<{
  Variables: { supabase: HonoSupabase | null }
}>(async (c, next) => {
  if (!isSupabaseConfigured()) {
    c.set('supabase', null)
  } else {
    c.set('supabase', createClient(supabaseUrl!, supabaseAnonKey!))
  }
  await next()
})

/** 与 DDL 中一致为 `chat_rooms`（非单数 chat_room） */
export const CHAT_ROOMS_TABLE = 'chat_rooms'
export const CHAT_MESSAGES_TABLE = 'chat_messages'

export function poolForDirectDb(): Pool | null {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) return null
  return new Pool({
    connectionString,
    max: 1,
    ssl:
      /supabase\.co|pooler\./.test(connectionString) ||
      process.env.DATABASE_SSL === '1'
        ? { rejectUnauthorized: false }
        : undefined,
  })
}

export async function publicTableExists(
  pool: Pool,
  tableName: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    [tableName],
  )
  return Boolean(rows[0]?.exists)
}

/**
 * 启动时：若已同时存在 `chat_rooms` 与 `chat_messages`，则略过建表；否则由 init 中逻辑创建。
 */
export async function shouldSkipChatTableBootstrap(
  pool: Pool,
): Promise<boolean> {
  const [hasRooms, hasMessages] = await Promise.all([
    publicTableExists(pool, CHAT_ROOMS_TABLE),
    publicTableExists(pool, CHAT_MESSAGES_TABLE),
  ])
  return hasRooms && hasMessages
}
