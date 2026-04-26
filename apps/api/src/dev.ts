import { config as loadEnv } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
loadEnv({ path: resolve(apiRoot, '.env') })
loadEnv({ path: resolve(apiRoot, '.env.local') })

const { ensureDemoSchema } = await import('./db/init')
await ensureDemoSchema()

const { serve } = await import('@hono/node-server')
const { app } = await import('./index')

const port = Number(process.env.PORT) || 8787

console.info(`[hono] http://127.0.0.1:${port}`)

serve({
  fetch: app.fetch,
  port,
})
