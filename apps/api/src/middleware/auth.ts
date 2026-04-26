import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ACCESS_COOKIE_NAME } from '../lib/auth-cookie'
import { verifyAccessToken, type JwtPayload } from '../lib/jwt'

function getBearerToken(header: string | undefined): string | undefined {
  const m = header?.match(/^Bearer\s+(\S+)/i)
  return m?.[1]
}

export type AppVariables = {
  supabase: SupabaseClient | null
  user?: JwtPayload
}

export const requireAuth = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const fromHeader = getBearerToken(c.req.header('Authorization'))
    const fromCookie = getCookie(c, ACCESS_COOKIE_NAME)
    const token = fromHeader ?? fromCookie
    if (!token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    try {
      const user = await verifyAccessToken(token)
      c.set('user', user)
    } catch {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  },
)

/** 有则解析 JWT 写入 `user`，无/无效也继续，供允许匿名 + 已登录 双式路由。 */
export const optionalAuth = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const fromHeader = getBearerToken(c.req.header('Authorization'))
    const fromCookie = getCookie(c, ACCESS_COOKIE_NAME)
    const token = fromHeader ?? fromCookie
    if (token) {
      try {
        const user = await verifyAccessToken(token)
        c.set('user', user)
      } catch {
        // ignore 无效 token，当作未登录
      }
    }
    await next()
  },
)

export const requireAdmin = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const user = c.get('user')
    if (!user || user.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  },
)
