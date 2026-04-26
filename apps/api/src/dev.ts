import { serve } from '@hono/node-server'
import { app } from './index'

const port = Number(process.env.PORT) || 8787

console.info(`[hono] http://127.0.0.1:${port}`)

serve({
  fetch: app.fetch,
  port,
})
