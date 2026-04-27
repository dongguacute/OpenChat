import { useEffect, useState } from 'react'
import { getChatSupabase } from '@/lib/chat-supabase'
import { CHAT_IMAGES_BUCKET } from '@/lib/chat-constants'

type Props = { path: string; mine?: boolean }

/**
 * 使用当前用户 Supabase 会话为 `chat-images` 路径换签名 URL 并展示缩略图。
 */
export function ChatMessageImage({ path, mine = false }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await getChatSupabase()
      if (cancelled || !s) return
      const { data, error } = await s.storage
        .from(CHAT_IMAGES_BUCKET)
        .createSignedUrl(path, 3600)
      if (cancelled) return
      if (error || !data?.signedUrl) {
        setFailed(true)
        return
      }
      setUrl(data.signedUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [path])
  if (failed) {
    return (
      <p className="text-xs text-rose-300" role="status">
        无法加载图片
      </p>
    )
  }
  if (!url) {
    return (
      <p className="text-xs text-zinc-500" role="status">
        图片加载中…
      </p>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`mt-1.5 block max-w-full overflow-hidden rounded-md ring-1 ${
        mine ? 'ring-emerald-800/60' : 'ring-zinc-600/60'
      }`}
    >
      <img
        src={url}
        alt="聊天图片"
        loading="lazy"
        decoding="async"
        className="max-h-60 w-full object-contain"
      />
    </a>
  )
}
