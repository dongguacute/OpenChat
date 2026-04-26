import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'
import type { AppVariables } from '../middleware/auth'
import {
  setAccessTokenCookie,
  setSupabaseRefreshCookie,
} from '../lib/auth-cookie'
import { createServiceSupabase } from '../lib/supabase-service'
import { signAccessToken } from '../lib/jwt'

export interface LoginRequest {
  email: string
  password: string
}

/** Body only (JWT is Set-Cookie HttpOnly). */
export interface LoginResponse {
  role: 'admin' | 'user'
  email: string
  /** 普通用户为 Supabase `user.id`；管理账号为 `null`。 */
  id: string | null
}

function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) {
    return false
  }
  return timingSafeEqual(ba, bb)
}

function matchesEnvAdmin(email: string, password: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminEmail || adminPassword === undefined || adminPassword === '') {
    return false
  }
  const normEmail = email.trim().toLowerCase()
  if (normEmail !== adminEmail) {
    return false
  }
  return safeEqualString(password, adminPassword)
}

const login = new Hono<{ Variables: AppVariables }>()

login.post('/', async (c) => {
  let body: LoginRequest
  try {
    body = await c.req.json<LoginRequest>()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const email = typeof body.email === 'string' ? body.email : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    return c.json({ error: 'email and password required' }, 400)
  }

  if (matchesEnvAdmin(email, password)) {
    const normEmail = email.trim().toLowerCase()
    const token = await signAccessToken({
      sub: 'admin',
      role: 'admin',
      email: normEmail,
    })
    setAccessTokenCookie(c, token)
    return c.json({
      role: 'admin' satisfies LoginResponse['role'],
      email: normEmail,
      id: null,
    })
  }

  const supabase = c.get('supabase')
  if (!supabase) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error || !data.user) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  const userEmail = data.user.email ?? email.trim().toLowerCase()
  const token = await signAccessToken({
    sub: data.user.id,
    role: 'user',
    email: userEmail,
  })
  setAccessTokenCookie(c, token)
  if (data.session?.refresh_token) {
    setSupabaseRefreshCookie(c, data.session.refresh_token)
  }
  const service = createServiceSupabase()
  if (service) {
    const { error: pErr } = await service.from('profiles').upsert(
      {
        id: data.user.id,
        email: userEmail,
        display_name: null,
      },
      { onConflict: 'id' },
    )
    if (pErr) {
      console.warn('[login] profile upsert:', pErr.message)
    }
  }
  return c.json({
    role: 'user' satisfies LoginResponse['role'],
    email: userEmail,
    id: data.user.id,
  })
})

export { login }
