export type HealthResponse = {
  ok: boolean
  service: string
  time: string
  supabase: boolean
}

export type VersionResponse = { version: string }

/** Login sets HttpOnly cookie; body is non-secret session hints for UI. */
export type LoginResponse = {
  role: 'admin' | 'user'
  email: string
  id: string | null
}

export type MeResponse = {
  id: string | null
} & LoginResponse

export type AdminUserRow = {
  id: string
  email: string | undefined
  phone: string | undefined
  created_at: string | undefined
  last_sign_in_at: string | undefined
  email_confirmed_at: string | undefined
  user_metadata: Record<string, unknown> | undefined
  is_anonymous: boolean
}

export type AdminUsersResponse = {
  users: AdminUserRow[]
  page: number
  perPage: number
  total: number
  nextPage: number | null
  lastPage: number | null
}

export type CreateUserResponse = {
  id: string
  email: string
}

export type ChatSupabaseTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: 'bearer'
}

export type ChatOpenResponse = {
  room: { id: string; name: string }
  peer: { id: string; email: string; display_name: string | null }
}

export type ChatRoomListItem = {
  id: string
  name: string
  created_at: string
  peer: { email: string; display_name: string | null }
}

export type ChatRoomsResponse = { rooms: ChatRoomListItem[] }

export type ChatMessageRow = {
  id: string
  room_id: string
  user_id: string
  content: string
  /** Supabase Storage `chat-images` 桶内路径，首段为 room_id；有值时客户端用 JWT 换签名 URL */
  image_path?: string | null
  created_at: string
}

export type ChatMessagesResponse = { messages: ChatMessageRow[] }

export type ChatPostMessageResponse = { message: ChatMessageRow }
