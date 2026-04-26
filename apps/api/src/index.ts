import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()
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
  .get('/health', (c) =>
    c.json({ ok: true, service: 'openchat-api', time: new Date().toISOString() }),
  )
  .get('/version', (c) => c.json({ version: '0.1.0' }))

export { app }
export type App = typeof app
