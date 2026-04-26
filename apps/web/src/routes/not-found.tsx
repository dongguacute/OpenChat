import { Link } from 'react-router'

export function NotFound() {
  return (
    <div className="space-y-3 text-center">
      <p className="text-5xl font-semibold text-white">404</p>
      <p className="text-sm text-zinc-400">页面不存在</p>
      <Link
        to="/"
        className="inline-flex rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white"
      >
        回首页
      </Link>
    </div>
  )
}
