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
}

export type MeResponse = LoginResponse

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
