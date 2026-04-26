import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { isSupabaseConfigured, supabaseMiddleware } from './db/config'
import type { AppVariables } from './middleware/auth'
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
  .route('/login', login)
  .route('/admin', admin)

export { app }
export type App = typeof app
