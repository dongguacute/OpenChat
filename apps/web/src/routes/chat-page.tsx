import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/context/auth-context'
import { apiFetch, ApiError } from '@/lib/api'
import type {
  ChatMessageRow,
  ChatMessagesResponse,
  ChatOpenResponse,
  ChatPostMessageResponse,
  ChatRoomsResponse,
} from '@/lib/api-types'
import {
  getChatSupabase,
  isChatConfigured,
  removeChannel,
  subscribeChatMessages,
} from '@/lib/chat-supabase'
import {
  CHAT_IMAGE_ACCEPT,
  CHAT_IMAGE_MAX_BYTES,
  isChatImageFile,
} from '@/lib/chat-constants'
import { ChatMessageImage } from '@/components/chat-message-image'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readGuestConfig(): { roomId: string; userId: string } | null {
  const room = import.meta.env.VITE_GUEST_PUBLIC_ROOM_ID?.trim()
  const user = import.meta.env.VITE_GUEST_PUBLIC_USER_ID?.trim()
  if (room && user && UUID_RE.test(room) && UUID_RE.test(user)) {
    return { roomId: room, userId: user }
  }
  return null
}

function lastMsgIdKey(rid: string) {
  return `openchat:syncLastMsgId:${rid}`
}
function lastSyncAtKey(rid: string) {
  return `openchat:syncLastAt:${rid}`
}

function mergeById(
  a: ChatMessageRow[],
  incoming: ChatMessageRow[],
): ChatMessageRow[] {
  const map = new Map<string, ChatMessageRow>()
  for (const m of a) {
    map.set(m.id, m)
  }
  for (const m of incoming) {
    map.set(m.id, m)
  }
  return [...map.values()].sort(
    (x, y) =>
      new Date(x.created_at).getTime() - new Date(y.created_at).getTime(),
  )
}

function persistSyncCursor(
  roomId: string,
  lastMsgId: string | null,
) {
  try {
    if (lastMsgId) {
      sessionStorage.setItem(lastMsgIdKey(roomId), lastMsgId)
    }
    sessionStorage.setItem(lastSyncAtKey(roomId), new Date().toISOString())
  } catch {
    /* 浏览器禁用 storage 时忽略 */
  }
}

export function ChatPage() {
  const { authReady, isAuthenticated, role, userId, email } = useAuth()
  const guestCfg = useMemo(() => readGuestConfig(), [])
  const isGuest = Boolean(!isAuthenticated && guestCfg)
  const [rooms, setRooms] = useState<ChatRoomsResponse['rooms']>([])
  const [roomsError, setRoomsError] = useState<string | null>(null)
  const [peerEmail, setPeerEmail] = useState('')
  const [openBusy, setOpenBusy] = useState(false)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageRow[]>([])
  const [msgText, setMsgText] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [myGuestMsgIds, setMyGuestMsgIds] = useState(() => new Set<string>())
  const supabaseRef = useRef<SupabaseClient | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastIdRef = useRef<string | null>(null)
  const [peerLabel, setPeerLabel] = useState('')
  const myId = isGuest && guestCfg ? guestCfg.userId : (userId ?? '')

  useEffect(() => {
    if (!authReady || !isGuest || !guestCfg) return
    setRoomId(guestCfg.roomId)
    setPeerLabel('公开访客区')
  }, [authReady, isGuest, guestCfg])

  useEffect(() => {
    if (roomId) {
      setMyGuestMsgIds(new Set())
    }
  }, [roomId])

  const loadRooms = useCallback(async () => {
    try {
      const r = await apiFetch<ChatRoomsResponse>('/api/chat/rooms')
      setRooms(r.rooms)
      setRoomsError(null)
    } catch (e) {
      setRoomsError(e instanceof ApiError ? e.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    if (!authReady || !isAuthenticated || role !== 'user' || !userId) {
      return
    }
    void loadRooms()
  }, [authReady, isAuthenticated, role, userId, loadRooms])

  const refreshMessages = useCallback(
    async (rid: string, since?: string) => {
      const path =
        since && since.length > 0
          ? `/api/chat/rooms/${encodeURIComponent(rid)}/messages?since=${encodeURIComponent(since)}`
          : `/api/chat/rooms/${encodeURIComponent(rid)}/messages`
      const d = await apiFetch<ChatMessagesResponse>(path)
      return d.messages.map((m) => ({
        ...m,
        image_path: m.image_path ?? null,
      }))
    },
    [],
  )

  const isMessageMine = useCallback(
    (m: ChatMessageRow) => {
      if (isGuest && guestCfg) {
        return m.user_id === guestCfg.userId && myGuestMsgIds.has(m.id)
      }
      return m.user_id === (userId ?? '')
    },
    [isGuest, guestCfg, myGuestMsgIds, userId],
  )

  const catchUp = useCallback(async () => {
    if (!roomId) return
    const since = lastIdRef.current
    if (!since) return
    try {
      const more = await refreshMessages(roomId, since)
      if (more.length === 0) return
      setMessages((prev) => {
        const merged = mergeById(prev, more)
        const last = merged[merged.length - 1]
        if (last) {
          lastIdRef.current = last.id
          persistSyncCursor(roomId, last.id)
        }
        return merged
      })
      for (const m of more) {
        if (isMessageMine(m)) continue
        if (
          'Notification' in globalThis &&
          Notification.permission === 'granted' &&
          document.hidden
        ) {
          new Notification('OpenChat 新消息', {
            body: m.image_path
              ? (m.content.trim() ? m.content : '[图片]')
              : m.content,
            tag: m.id,
          })
        }
      }
    } catch {
      /* 补拉失败不阻断 */
    }
  }, [roomId, refreshMessages, isMessageMine])

  useEffect(() => {
    if (!roomId) {
      if (channelRef.current && supabaseRef.current) {
        removeChannel(supabaseRef.current, channelRef.current)
        channelRef.current = null
      }
      return
    }
    let cancelled = false
    setMessages([])
    lastIdRef.current = null
    const canRealtime =
      isAuthenticated && role === 'user' && Boolean(userId) && isChatConfigured()
    const boot = async () => {
      if (!isGuest && !isChatConfigured()) {
        return
      }
      const first = await refreshMessages(roomId)
      if (cancelled) return
      if (first.length) {
        const lastM = first[first.length - 1]!
        lastIdRef.current = lastM.id
        persistSyncCursor(roomId, lastM.id)
      }
      setMessages(first)
      if (!canRealtime) {
        return
      }
      const supabase = await getChatSupabase()
      if (cancelled || !supabase) return
      supabaseRef.current = supabase
      const ch = subscribeChatMessages(
        supabase,
        roomId,
        (row) => {
          setMessages((prev) => {
            if (lastIdRef.current && row.id === lastIdRef.current) {
              return prev
            }
            if (row.created_at) {
              lastIdRef.current = row.id
              persistSyncCursor(roomId, row.id)
            }
            return mergeById(prev, [
              {
                ...(row as ChatMessageRow),
                image_path:
                  (row as { image_path?: string | null }).image_path ?? null,
              },
            ])
          })
          const m = row as ChatMessageRow
          if (
            document.hidden &&
            !isMessageMine(m) &&
            'Notification' in globalThis &&
            Notification.permission === 'granted'
          ) {
            new Notification('OpenChat 新消息', {
              body: m.image_path
                ? (m.content.trim() ? m.content : '[图片]')
                : m.content,
              tag: row.id,
            })
          }
        },
      )
      channelRef.current = ch
    }
    void boot()
    return () => {
      cancelled = true
      if (channelRef.current && supabaseRef.current) {
        removeChannel(supabaseRef.current, channelRef.current)
        channelRef.current = null
      }
    }
  }, [
    roomId,
    refreshMessages,
    isMessageMine,
    isGuest,
    isAuthenticated,
    role,
    userId,
  ])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && roomId) {
        void catchUp()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [roomId, catchUp])

  useEffect(() => {
    if (!roomId) return
    const tick = () => {
      const guestPollAlways = isGuest
      if (!guestPollAlways && !document.hidden) return
      const since = lastIdRef.current
      if (!since) return
      void (async () => {
        try {
          const more = await refreshMessages(roomId, since)
          if (more.length === 0) return
          setMessages((prev) => {
            const merged = mergeById(prev, more)
            const last = merged[merged.length - 1]
            if (last) {
              lastIdRef.current = last.id
              persistSyncCursor(roomId, last.id)
            }
            return merged
          })
          for (const m of more) {
            if (isMessageMine(m)) continue
            if (
              'Notification' in globalThis &&
              Notification.permission === 'granted' &&
              document.hidden
            ) {
              new Notification('OpenChat 新消息', {
                body: m.image_path
                  ? (m.content.trim() ? m.content : '[图片]')
                  : m.content,
                tag: m.id,
              })
            }
          }
        } catch {
          /* 轮询失败不阻断 UI */
        }
      })()
    }
    const id = window.setInterval(tick, 2000)
    return () => window.clearInterval(id)
  }, [roomId, refreshMessages, isMessageMine, isGuest])

  const onOpen = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!peerEmail.trim()) return
    setOpenBusy(true)
    try {
      const r = await apiFetch<ChatOpenResponse>('/api/chat/open', {
        method: 'POST',
        body: JSON.stringify({ peerEmail: peerEmail.trim() }),
      })
      setRoomId(r.room.id)
      setPeerLabel(r.peer.display_name || r.peer.email)
      setPeerEmail('')
      await loadRooms()
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : '开聊失败')
    } finally {
      setOpenBusy(false)
    }
  }

  const runUploadImages = useCallback(
    async (files: File[]) => {
      if (!roomId || sendBusy || isGuest || files.length === 0) return
      const list = files.filter((f) => isChatImageFile(f))
      if (list.length === 0) {
        window.alert('请使用 JPEG、PNG、GIF 或 WebP 图片')
        return
      }
      const over = list.filter((f) => f.size > CHAT_IMAGE_MAX_BYTES)
      if (over.length > 0) {
        window.alert(
          `超过 5MB 未发送：${over.map((f) => f.name).join('、')}`,
        )
      }
      const ok = list.filter((f) => f.size <= CHAT_IMAGE_MAX_BYTES)
      if (ok.length === 0) return

      const url = `/api/chat/rooms/${encodeURIComponent(roomId)}/images`
      const cap = msgText.trim()
      let captionForFirstOnly = true

      setSendBusy(true)
      try {
        for (const file of ok) {
          const fd = new FormData()
          fd.append('file', file)
          if (captionForFirstOnly && cap) {
            fd.append('caption', cap)
            captionForFirstOnly = false
          }
          const r = await apiFetch<ChatPostMessageResponse>(url, {
            method: 'POST',
            body: fd,
          })
          setMessages((prev) => {
            const next = mergeById(prev, [r.message])
            lastIdRef.current = r.message.id
            if (roomId) persistSyncCursor(roomId, r.message.id)
            return next
          })
        }
        if (cap) {
          setMsgText('')
        }
      } catch (err) {
        window.alert(err instanceof ApiError ? err.message : '发送图片失败')
      } finally {
        setSendBusy(false)
      }
    },
    [roomId, sendBusy, isGuest, msgText],
  )

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomId || !msgText.trim() || sendBusy) return
    setSendBusy(true)
    try {
      const r = await apiFetch<ChatPostMessageResponse>(
        `/api/chat/rooms/${encodeURIComponent(roomId)}/messages`,
        { method: 'POST', body: JSON.stringify({ content: msgText.trim() }) },
      )
      setMsgText('')
      if (isGuest) {
        setMyGuestMsgIds((s) => {
          const n = new Set(s)
          n.add(r.message.id)
          return n
        })
      }
      setMessages((prev) => {
        const next = mergeById(prev, [r.message])
        lastIdRef.current = r.message.id
        if (roomId) persistSyncCursor(roomId, r.message.id)
        return next
      })
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : '发送失败')
    } finally {
      setSendBusy(false)
    }
  }

  if (!authReady) {
    return <p className="text-sm text-zinc-400">正在检查登录…</p>
  }
  if (!isAuthenticated && !isGuest) {
    return (
      <p className="text-sm text-zinc-300">
        请先<Link to="/login" className="text-amber-200 underline">登录</Link>
        ，或在 Web 中配置 <code className="text-amber-200">VITE_GUEST_PUBLIC_ROOM_ID</code> 与{' '}
        <code className="text-amber-200">VITE_GUEST_PUBLIC_USER_ID</code>（与 API
        环境变量成对）以启用访客发消息。
      </p>
    )
  }
  if (isAuthenticated && role !== 'user') {
    return (
      <p className="text-sm text-zinc-300">
        私聊仅对通过 Supabase 登录的普通用户开放。请用管理员创建的账号在登录页以邮箱密码登录。
      </p>
    )
  }
  if (isAuthenticated && !isChatConfigured()) {
    return (
      <p className="text-sm text-zinc-300">
        无法使用实时聊天：请在 <code className="text-amber-200">apps/api/.env</code> 中配置{' '}
        <code className="text-amber-200">SUPABASE_URL</code> 与{' '}
        <code className="text-amber-200">SUPABASE_ANON_KEY</code>，或于{' '}
        <code className="text-amber-200">apps/web</code> 中设置同内容的{' '}
        <code className="text-amber-200">VITE_SUPABASE_*</code>；保存后需重启 Vite 开发服。
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">私聊</h1>
        <p className="mt-1 text-pretty text-sm text-zinc-400">
          {isGuest
            ? '当前为访客模式：仅可访问环境变量中配置的公开房间，通过 HTTP 每 2 秒轮询新消息。'
            : '输入对方在系统中的邮箱即可开聊。消息通过 Supabase Realtime 同步；可发送图片（拖拽、粘贴或点「图片」），说明文字可选。'}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          本机可在聊天页点一次以请求浏览器通知。
          <button
            type="button"
            className="ml-2 text-amber-200 underline"
            onClick={() => {
              if ('Notification' in globalThis) {
                void Notification.requestPermission()
              }
            }}
          >
            请求通知权限
          </button>
        </p>
      </div>

      {!isGuest && (
        <motion.section
          layout
          className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4"
        >
          <p className="text-sm font-medium text-zinc-200">开聊</p>
          <form onSubmit={onOpen} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
              placeholder="对方邮箱"
              value={peerEmail}
              onChange={(e) => setPeerEmail(e.target.value)}
              autoComplete="email"
            />
            <button
              type="submit"
              disabled={openBusy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {openBusy ? '处理中…' : '开始'}
            </button>
          </form>
          {roomsError && (
            <p className="mt-2 text-sm text-rose-300">会话列表：{roomsError}</p>
          )}
        </motion.section>
      )}

      <div
        className={
          isGuest
            ? 'grid gap-4 md:grid-cols-1'
            : 'grid gap-4 md:grid-cols-3'
        }
      >
        {!isGuest && (
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 md:col-span-1">
            <p className="text-sm font-medium text-zinc-200">我的会话</p>
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
              {rooms.length === 0 && (
                <li className="text-zinc-500">暂无，先在上方输入邮箱开聊。</li>
              )}
              {rooms.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setRoomId(r.id)
                      setPeerLabel(r.peer.display_name || r.peer.email)
                    }}
                    className={`w-full rounded-md px-2 py-1.5 text-left ${
                      roomId === r.id
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-300 hover:bg-zinc-900'
                    }`}
                  >
                    {r.peer.display_name || r.peer.email || r.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div
          className={
            isGuest
              ? 'rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3'
              : 'rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3 md:col-span-2'
          }
          onDragOver={
            isGuest
              ? undefined
              : (e) => {
                  if (!roomId) return
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'copy'
                }
          }
          onDrop={
            isGuest
              ? undefined
              : (e) => {
                  if (!roomId) return
                  e.preventDefault()
                  e.stopPropagation()
                  const list = Array.from(e.dataTransfer.files ?? []).filter(
                    (f) => isChatImageFile(f),
                  )
                  if (list.length > 0) void runUploadImages(list)
                }
          }
        >
          {!roomId ? (
            <p className="text-sm text-zinc-500">选择左侧会话或先开聊。</p>
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                当前与 <span className="text-zinc-100">{peerLabel || '—'}</span> ·
                我：{isGuest ? '访客' : (email ?? myId)}
              </p>
              <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-sm">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg px-2 py-1.5 ${
                      isMessageMine(m) ? 'ml-8 bg-emerald-950/50' : 'mr-8 bg-zinc-800/80'
                    }`}
                  >
                    <span className="text-xs text-zinc-500">
                      {isMessageMine(m) ? '我' : (isGuest ? '访客' : '对方')}
                    </span>
                    {m.image_path ? (
                      <ChatMessageImage
                        path={m.image_path}
                        mine={isMessageMine(m)}
                      />
                    ) : null}
                    {m.content.trim() ? (
                      <p className="whitespace-pre-wrap text-zinc-100">{m.content}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <form onSubmit={onSend} className="mt-3 flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={CHAT_IMAGE_ACCEPT}
                  multiple
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? [])
                    e.target.value = ''
                    if (list.length > 0) void runUploadImages(list)
                  }}
                />
                <input
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100"
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onPaste={(e) => {
                    if (isGuest || !roomId || sendBusy) return
                    const files = e.clipboardData?.files
                    if (!files?.length) return
                    const list = Array.from(files).filter((x) =>
                      isChatImageFile(x),
                    )
                    if (list.length > 0) {
                      e.preventDefault()
                      void runUploadImages(list)
                    }
                  }}
                  placeholder="写消息或粘贴图片…（多图时说明只加在第一张）"
                />
                {!isGuest && (
                  <button
                    type="button"
                    disabled={sendBusy || !roomId}
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
                  >
                    图片
                  </button>
                )}
                <button
                  type="submit"
                  disabled={sendBusy}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
                >
                  发送
                </button>
              </form>
              {!isGuest && roomId && (
                <p className="mt-1.5 text-xs text-zinc-500">
                  支持多选、拖拽多张；单张最大 5MB。手机相册/微信里是否有「原图」由
                  系统与 App 控制，网页选图没有单独的「原图」开关，属浏览器限制。
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
