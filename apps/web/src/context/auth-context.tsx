import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch } from '@/lib/api'
import type { LoginResponse, MeResponse } from '@/lib/api-types'

export type StoredRole = 'admin' | 'user'

type Session = {
  role: StoredRole
  email: string
  userId: string | null
}

type AuthContextValue = {
  authReady: boolean
  isAuthenticated: boolean
  role: StoredRole | null
  email: string | undefined
  /** Supabase 用户 id（`role === 'user'` 时与 JWT `sub` 一致） */
  userId: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Bumps when login/logout runs so stale `/api/me` results are ignored. */
function useAuthGeneration() {
  const ref = useRef(0)
  const bump = useCallback(() => {
    ref.current += 1
    return ref.current
  }, [])
  const current = useCallback(() => ref.current, [])
  return { bump, current }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const { bump, current } = useAuthGeneration()

  useEffect(() => {
    try {
      localStorage.removeItem('openchat_token')
      localStorage.removeItem('openchat_role')
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const genAtStart = current()
    let cancelled = false

    void (async () => {
      try {
        const me = await apiFetch<MeResponse>('/api/me')
        if (cancelled || current() !== genAtStart) return
        setSession({ role: me.role, email: me.email, userId: me.id })
      } catch {
        if (cancelled || current() !== genAtStart) return
        setSession(null)
      } finally {
        if (!cancelled && current() === genAtStart) {
          setAuthReady(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [current])

  const login = useCallback(
    async (emailIn: string, password: string) => {
      bump()
      try {
        const res = await apiFetch<LoginResponse>('/api/login', {
          method: 'POST',
          body: JSON.stringify({ email: emailIn, password }),
        })
        setSession({
          role: res.role,
          email: res.email,
          userId: res.role === 'user' && res.id ? res.id : null,
        })
      } finally {
        setAuthReady(true)
      }
    },
    [bump],
  )

  const logout = useCallback(async () => {
    bump()
    try {
      await apiFetch<{ ok: boolean }>('/api/logout', { method: 'POST' })
    } catch {
      /* still clear local UI session */
    }
    setSession(null)
    setAuthReady(true)
  }, [bump])

  const value = useMemo<AuthContextValue>(
    () => ({
      authReady,
      isAuthenticated: Boolean(session),
      role: session?.role ?? null,
      email: session?.email,
      userId: session?.userId ?? null,
      login,
      logout,
    }),
    [authReady, session, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
