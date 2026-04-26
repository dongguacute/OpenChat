import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/context/auth-context'
import type { HealthResponse, VersionResponse } from '@/lib/api-types'

export function HomePage() {
  const { authReady, isAuthenticated, role, email, logout } = useAuth()
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [version, setVersion] = useState<VersionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const init = { credentials: 'include' as RequestCredentials }
    Promise.all([
      fetch('/api/health', init).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(r.statusText)),
      ),
      fetch('/api/version', init).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(r.statusText)),
      ),
    ])
      .then(([h, v]) => {
        if (!active) return
        setHealth(h as HealthResponse)
        setVersion(v as VersionResponse)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!active) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">OpenChat</h1>
        <p className="text-pretty text-sm leading-6 text-zinc-300">
          控制台对接 <code className="mx-1 font-mono text-xs text-zinc-200">apps/api</code>（Hono）：
          健康检查、版本、登录与管理员用户管理。本地开发请运行根目录{' '}
          <code className="mx-1 font-mono text-xs text-zinc-200">pnpm dev</code>，Vite 将{' '}
          <code className="text-xs text-amber-200/90">/api</code> 代理到 API 端口。
        </p>
      </div>

      <motion.section
        layout
        className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4"
      >
        <p className="text-sm font-medium text-zinc-200">会话</p>
        {!authReady ? (
          <p className="mt-3 text-sm text-zinc-400">正在检查登录状态…</p>
        ) : isAuthenticated ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-zinc-400">
              已登录 · 角色 <span className="text-zinc-100">{role}</span>
              {email ? (
                <>
                  {' '}
                  · <span className="text-zinc-100">{email}</span>
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
              {role === 'admin' && (
                <Link
                  to="/admin"
                  className="inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  管理后台
                </Link>
              )}
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                退出
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/login"
              className="inline-flex rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
            >
              登录
            </Link>
          </div>
        )}
      </motion.section>

      <div className="grid gap-4 sm:grid-cols-2">
        <motion.div
          layout
          className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4"
        >
          <p className="text-sm font-medium text-zinc-200">GET /api/health</p>
          {error && (
            <p className="mt-2 text-sm text-rose-300">
              请求失败：{error}。请确认 API 已启动且代理正确。
            </p>
          )}
          {!error && !health && <p className="mt-2 text-sm text-zinc-400">加载中…</p>}
          {health && (
            <pre className="mt-3 max-h-52 overflow-auto rounded-lg bg-zinc-950/80 p-3 text-xs text-zinc-200">
              {JSON.stringify(health, null, 2)}
            </pre>
          )}
        </motion.div>
        <motion.div
          layout
          className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4"
        >
          <p className="text-sm font-medium text-zinc-200">GET /api/version</p>
          {!error && !version && <p className="mt-2 text-sm text-zinc-400">加载中…</p>}
          {version && (
            <pre className="mt-3 max-h-52 overflow-auto rounded-lg bg-zinc-950/80 p-3 text-xs text-zinc-200">
              {JSON.stringify(version, null, 2)}
            </pre>
          )}
        </motion.div>
      </div>
    </div>
  )
}
