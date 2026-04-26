import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { useAuth } from '@/context/auth-context'
import { ApiError } from '@/lib/api'

export function LoginPage() {
  const { authReady, login, isAuthenticated, role } = useAuth()
  const location = useLocation()
  const redirectTarget = (location.state as { from?: string } | null)?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (authReady && isAuthenticated) {
    if (role === 'admin' && redirectTarget?.startsWith('/admin')) {
      return <Navigate to={redirectTarget} replace />
    }
    return <Navigate to="/" replace />
  }

  if (!authReady) {
    return (
      <p className="text-center text-sm text-zinc-400" aria-live="polite">
        加载中…
      </p>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : '登录失败'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-white">登录</h1>
        <p className="text-sm text-zinc-400">
          使用管理员账号或 Supabase 用户登录；访问令牌存放在 HttpOnly Cookie，前端脚本无法读取。
        </p>
      </div>
      <motion.form
        layout
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-6"
      >
        {error && (
          <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-sm text-rose-200">{error}</p>
        )}
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-400">邮箱</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none ring-zinc-600 focus:ring-2"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-400">密码</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none ring-zinc-600 focus:ring-2"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-60"
        >
          {submitting ? '登录中…' : '登录'}
        </button>
        <p className="text-center text-xs text-zinc-500">
          <Link to="/" className="text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
            返回首页
          </Link>
        </p>
      </motion.form>
    </div>
  )
}
