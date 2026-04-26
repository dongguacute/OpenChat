import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { isSupabaseConfigured, supabaseMiddleware, type HonoSupabase } from './db/config'

const app = new Hono<{ Variables: { supabase: HonoSupabase | null } }>()
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

export { app }
export type App = typeof app
