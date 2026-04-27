import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { apiFetch } from '@/lib/api'
import type { ChatSupabaseTokenResponse } from '@/lib/api-types'

const URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

export function isChatConfigured(): boolean {
  return Boolean(
    URL &&
      ANON &&
      String(URL).length > 0 &&
      String(ANON).length > 0,
  )
}

let client: SupabaseClient | null = null

/**
 * 从 API 用 refresh cookie 换 access+refresh 并建 Supabase 客户端，供 Realtime 使用。
 */
export async function getChatSupabase(): Promise<SupabaseClient | null> {
  if (!isChatConfigured()) {
    return null
  }
  const t = await apiFetch<ChatSupabaseTokenResponse>('/api/chat/supabase-token', {
    method: 'GET',
  })
  if (!client) {
    client = createClient(String(URL), String(ANON), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }
  const { error } = await client.auth.setSession({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
  })
  if (error) {
    console.warn('[chat] setSession', error.message)
    return null
  }
  return client
}

export function subscribeChatMessages(
  supabase: SupabaseClient,
  roomId: string,
  onInsert: (row: {
    id: string
    room_id: string
    user_id: string
    content: string
    image_path: string | null
    created_at: string
  }) => void,
): RealtimeChannel {
  return supabase.channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      },
      (p) => {
        const n = p.new
        if (
          n &&
          typeof n === 'object' &&
          'id' in n &&
          'user_id' in n &&
          ('content' in n || 'image_path' in n)
        ) {
          const row = n as {
            id: string
            room_id: string
            user_id: string
            content: string
            image_path: string | null
            created_at: string
          }
          onInsert(row)
        }
      },
    )
    .subscribe()
}

export function removeChannel(supabase: SupabaseClient, ch: RealtimeChannel): void {
  void supabase.removeChannel(ch)
}
