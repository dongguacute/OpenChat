import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { isSupabaseConfigured, supabaseMiddleware } from './db/config'
import type { AppVariables } from './middleware/auth'
import { requireAuth } from './middleware/auth'
import { clearAccessTokenCookie } from './lib/auth-cookie'
import { admin } from './routes/admin'
import { login } from './routes/login'

const app = new Hono<{ Variables: AppVariables }>()
  .basePath('/api')
  .use(
    '/*',
    cors({
      origin: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  )
  .use('/*', supabaseMiddleware)
  .get('/health', (c) =>
    c.json({
      ok: true,
      service: 'openchat-api',
      time: new Date().toISOString(),
      supabase: isSupabaseConfigured(),
    }),
  )
  .get('/version', (c) => c.json({ version: '0.1.0' }))
  .get('/me', requireAuth, (c) => {
    const user = c.get('user')
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return c.json({
      role: user.role,
      email: user.email ?? '',
    })
  })
  .post('/logout', (c) => {
    clearAccessTokenCookie(c)
    return c.json({ ok: true })
  })
  .route('/login', login)
  .route('/admin', admin)

export { app }
export type App = typeof app
