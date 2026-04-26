import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

type Health = { ok: boolean; service: string; time: string }

export function HomePage() {
  const [data, setData] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then((j: Health) => {
        if (active) {
          setData(j)
        }
      })
      .catch((e: unknown) => {
        if (!active) return
        const message = e instanceof Error ? e.message : String(e)
        setError(message)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">欢迎使用 OpenChat</h1>
        <p className="text-pretty text-sm leading-6 text-zinc-300">
          前端为 Vite + React Router 7 + Tailwind v4 + Motion，接口由 <code className="mx-1 font-mono text-xs text-zinc-200">apps/api</code>{' '}
          的 Hono 提供。本地请运行 <code className="mx-1 font-mono text-xs text-zinc-200">pnpm dev</code>，Vite 会把{' '}
          <code className="mx-1 text-xs text-amber-200/90">/api</code> 代理到 8787。
        </p>
      </div>
      <motion.div
        layout
        className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4"
      >
        <p className="text-sm font-medium text-zinc-200">/api/health</p>
        {error && (
          <p className="mt-2 text-sm text-rose-300">
            请求失败：{error}。请确认 <code className="font-mono">pnpm dev</code> 已同时起前端与
            <code className="mx-1 font-mono">apps/api</code>，且 5173 的代理把 <code className="font-mono">/api</code> 指到
            8787。
          </p>
        )}
        {!error && !data && (
          <p className="mt-2 text-sm text-zinc-400">加载中…</p>
        )}
        {data && (
          <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-zinc-950/80 p-3 text-xs text-zinc-200">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </motion.div>
    </div>
  )
}
