import { motion } from 'motion/react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { apiFetch, ApiError } from '@/lib/api'
import type {
  AdminUserRow,
  AdminUsersResponse,
  CreateUserResponse,
} from '@/lib/api-types'

function formatTime(iso: string | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

function displayName(meta: Record<string, unknown> | undefined): string {
  if (!meta) return '—'
  const d = meta.display_name
  return typeof d === 'string' && d.length > 0 ? d : '—'
}

export function AdminUsersPage() {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [data, setData] = useState<AdminUsersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [cEmail, setCEmail] = useState('')
  const [cPassword, setCPassword] = useState('')
  const [cDisplayName, setCDisplayName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createOk, setCreateOk] = useState<string | null>(null)

  const load = useCallback(async () => {
    setListError(null)
    setLoading(true)
    try {
      const q = new URLSearchParams({ page: String(page), perPage: String(perPage) })
      const res = await apiFetch<AdminUsersResponse>(`/api/admin/users?${q}`)
      setData(res)
    } catch (e: unknown) {
      setData(null)
      setListError(e instanceof ApiError ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, perPage])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreateOk(null)
    setCreateBusy(true)
    try {
      const body: { email: string; password: string; display_name?: string } = {
        email: cEmail.trim(),
        password: cPassword,
      }
      const dn = cDisplayName.trim()
      if (dn) body.display_name = dn
      const res = await apiFetch<CreateUserResponse>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setCreateOk(`已创建：${res.email}（${res.id}）`)
      setCEmail('')
      setCPassword('')
      setCDisplayName('')
      setShowCreate(false)
      await load()
    } catch (err: unknown) {
      setCreateError(err instanceof ApiError ? err.message : '创建失败')
    } finally {
      setCreateBusy(false)
    }
  }

  async function onDelete(id: string, email: string | undefined) {
    const label = email ?? id
    if (!window.confirm(`确定删除用户「${label}」？此操作不可撤销。`)) return
    try {
      await apiFetch<{ ok: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' })
      await load()
    } catch (e: unknown) {
      window.alert(e instanceof ApiError ? e.message : '删除失败')
    }
  }

  const totalPages =
    data && data.perPage > 0 ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-white">用户管理</h1>
          <p className="text-sm text-zinc-400">
            调用 <code className="font-mono text-xs text-zinc-300">GET /api/admin/users</code> 等接口，
            需管理员 JWT。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            {showCreate ? '关闭创建' : '创建用户'}
          </button>
          <Link
            to="/"
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
          >
            返回首页
          </Link>
        </div>
      </div>

      {showCreate && (
        <motion.form
          layout
          onSubmit={onCreate}
          className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4"
        >
          <p className="text-sm font-medium text-zinc-200">新建用户</p>
          {createError && (
            <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-sm text-rose-200">{createError}</p>
          )}
          {createOk && (
            <p className="rounded-lg bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
              {createOk}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-zinc-400">邮箱</span>
              <input
                required
                type="email"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-zinc-600"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-400">密码（至少 8 位）</span>
              <input
                required
                type="password"
                minLength={8}
                value={cPassword}
                onChange={(e) => setCPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-zinc-600"
              />
            </label>
            <label className="col-span-full block space-y-1 sm:col-span-2">
              <span className="text-xs text-zinc-400">显示名（可选）</span>
              <input
                type="text"
                value={cDisplayName}
                onChange={(e) => setCDisplayName(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-zinc-600"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={createBusy}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-60"
          >
            {createBusy ? '提交中…' : '创建'}
          </button>
        </motion.form>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
        <span>
          每页
          <select
            value={perPage}
            onChange={(e) => {
              setPage(1)
              setPerPage(Number(e.target.value))
            }}
            className="mx-2 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          条
        </span>
        {data && (
          <span>
            共 {data.total} 人 · 第 {data.page} / {totalPages} 页
          </span>
        )}
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-900"
        >
          刷新
        </button>
      </div>

      {listError && (
        <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-sm text-rose-200">{listError}</p>
      )}
      {loading && !data && <p className="text-sm text-zinc-400">加载中…</p>}

      {data && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
          <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">邮箱</th>
                <th className="px-3 py-2 font-medium">显示名</th>
                <th className="px-3 py-2 font-medium">注册</th>
                <th className="px-3 py-2 font-medium">上次登录</th>
                <th className="px-3 py-2 font-medium w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 bg-zinc-950/40">
              {data.users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                    暂无用户
                  </td>
                </tr>
              ) : (
                data.users.map((u: AdminUserRow) => (
                  <tr key={u.id} className="text-zinc-200">
                    <td className="px-3 py-2 font-mono text-xs">{u.email ?? u.id}</td>
                    <td className="px-3 py-2 text-zinc-400">{displayName(u.user_metadata)}</td>
                    <td className="px-3 py-2 text-zinc-500">{formatTime(u.created_at)}</td>
                    <td className="px-3 py-2 text-zinc-500">{formatTime(u.last_sign_in_at)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void onDelete(u.id, u.email)}
                        className="text-rose-400 hover:text-rose-300"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && data.users.length > 0 && (
        <div className="flex justify-between gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-40 hover:bg-zinc-900"
          >
            上一页
          </button>
          <button
            type="button"
            disabled={data.nextPage == null}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-40 hover:bg-zinc-900"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}
