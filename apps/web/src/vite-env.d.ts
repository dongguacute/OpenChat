/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** 与 API `OPENCHAT_GUEST_PUBLIC_ROOM_ID` 一致，未登录时进入访客公开房 */
  readonly VITE_GUEST_PUBLIC_ROOM_ID?: string
  /** 与 API `OPENCHAT_GUEST_PUBLIC_USER_ID` 一致，用于消息气泡「我/对方」侧展示 */
  readonly VITE_GUEST_PUBLIC_USER_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
