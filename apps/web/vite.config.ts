import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 解析 `apps/api/.env`，与 API 共用 Supabase 地址与 anon，避免再在 web 里抄一份。 */
function readApiDotEnv(): {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
} {
  const p = path.resolve(__dirname, '../api/.env')
  if (!existsSync(p)) {
    return {}
  }
  const out: Record<string, string> = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) {
      continue
    }
    const i = t.indexOf('=')
    if (i <= 0) {
      continue
    }
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

export default defineConfig(({ mode }) => {
  const webEnv = loadEnv(mode, __dirname, 'VITE_')
  const api = readApiDotEnv()
  const fromWebOrApi = {
    url: webEnv.VITE_SUPABASE_URL || api.SUPABASE_URL,
    anon: webEnv.VITE_SUPABASE_ANON_KEY || api.SUPABASE_ANON_KEY,
  }
  const apiTarget = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8787'
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    define:
      fromWebOrApi.url && fromWebOrApi.anon
        ? {
            'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(fromWebOrApi.url),
            'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
              fromWebOrApi.anon,
            ),
          }
        : ({} as Record<string, string>),
  }
})
