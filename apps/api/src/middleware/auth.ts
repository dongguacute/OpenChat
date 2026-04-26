import { createMiddleware } from 'hono/factory'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyAccessToken, type JwtPayload } from '../lib/jwt'

export type AppVariables = {
  supabase: SupabaseClient | null
  user?: JwtPayload
}

export const requireAuth = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const raw = c.req.header('Authorization')
    const m = raw?.match(/^Bearer\s+(\S+)/i)
    const token = m?.[1]
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

export const requireAdmin = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const user = c.get('user')
    if (!user || user.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  },
)
