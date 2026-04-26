import { Link, NavLink, Outlet } from 'react-router'
import { motion } from 'motion/react'
import { useAuth } from '@/context/auth-context'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm transition ${isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'}`

export function AppLayout() {
  const { authReady, isAuthenticated, role } = useAuth()

  return (
    <div className="min-h-dvh">
      <header className="border-b border-zinc-800/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/" className="font-semibold tracking-tight text-white">
            OpenChat
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              首页
            </NavLink>
            {authReady && !isAuthenticated && (
              <NavLink to="/login" className={linkClass}>
                登录
              </NavLink>
            )}
            {authReady && isAuthenticated && role === 'user' && (
              <NavLink to="/chat" className={linkClass}>
                私聊
              </NavLink>
            )}
            {authReady && isAuthenticated && role === 'admin' && (
              <NavLink to="/admin" className={linkClass}>
                管理
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <motion.div
          className="origin-top"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  )
}
