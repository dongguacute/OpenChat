import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { isSupabaseConfigured } from '../db/config'
import { dmRoomIdForUsers } from '../lib/dm-room-id'
import { createServiceSupabase } from '../lib/supabase-service'
import {
  setSupabaseRefreshCookie,
  SUPABASE_REFRESH_COOKIE_NAME,
} from '../lib/auth-cookie'
import { optionalAuth, type AppVariables } from '../middleware/auth'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Err403 = { error: string; status: 403 }

function getMyUserId(c: { get: (k: 'user') => import('../lib/jwt').JwtPayload | undefined }):
  | { ok: true; userId: string }
  | { ok: false; res: Err403 } {
  const u = c.get('user')
  if (!u || u.role !== 'user' || !UUID_RE.test(u.sub)) {
    return { ok: false, res: { error: '仅普通用户可使用私聊', status: 403 } }
  }
  return { ok: true, userId: u.sub }
}

function requireLogin(c: { get: (k: 'user') => import('../lib/jwt').JwtPayload | undefined }):
  | { ok: true }
  | { ok: false; res: { error: string; status: 401 } } {
  if (!c.get('user')) {
    return { ok: false, res: { error: 'Unauthorized', status: 401 } }
  }
  return { ok: true }
}

const chatroom = new Hono<{ Variables: AppVariables }>()

chatroom.use('*', optionalAuth)

function guestPublicEnabled(): { roomId: string; userId: string } | null {
  const roomId = process.env.OPENCHAT_GUEST_PUBLIC_ROOM_ID?.trim()
  const userId = process.env.OPENCHAT_GUEST_PUBLIC_USER_ID?.trim()
  if (
    roomId &&
    userId &&
    UUID_RE.test(roomId) &&
    UUID_RE.test(userId)
  ) {
    return { roomId, userId }
  }
  return null
}

/**
 * 用 HttpOnly 中的 Supabase refresh 换 access，供浏览器创建 Realtime 连接（RLS 使用 auth.uid()）。
 */
chatroom.get('/supabase-token', async (c) => {
  const login = requireLogin(c)
  if (!login.ok) {
    return c.json({ error: login.res.error }, login.res.status)
  }
  if (!isSupabaseConfigured()) {
    return c.json({ error: '未配置 Supabase' }, 503)
  }
  const me = getMyUserId(c)
  if (!me.ok) {
    return c.json({ error: me.res.error }, me.res.status)
  }
  const refresh = getCookie(c, SUPABASE_REFRESH_COOKIE_NAME)
  if (!refresh) {
    return c.json({ error: '无 Supabase 会话，请重新登录' }, 401)
  }
  const url = process.env.SUPABASE_URL!.trim()
  const anon = process.env.SUPABASE_ANON_KEY!.trim()
  const supabase = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refresh,
  })
  if (error || !data.session) {
    return c.json({ error: 'Supabase 会话已失效，请重新登录' }, 401)
  }
  if (data.user?.id !== me.userId) {
    return c.json({ error: '会话与当前用户不一致' }, 403)
  }
  if (data.session.refresh_token) {
    setSupabaseRefreshCookie(c, data.session.refresh_token)
  }
  return c.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in ?? 3600,
    token_type: 'bearer' as const,
  })
})

/** 输入对方邮箱，创建或复用私聊房并写入参与方。 */
chatroom.post('/open', async (c) => {
  const login = requireLogin(c)
  if (!login.ok) {
    return c.json({ error: login.res.error }, login.res.status)
  }
  const service = createServiceSupabase()
  if (!service) {
    return c.json({ error: '服务未配置' }, 500)
  }
  const me = getMyUserId(c)
  if (!me.ok) {
    return c.json({ error: me.res.error }, me.res.status)
  }
  let body: { peerEmail?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const raw = typeof body.peerEmail === 'string' ? body.peerEmail.trim() : ''
  if (!raw) {
    return c.json({ error: 'peerEmail 必填' }, 400)
  }
  const peerEmail = raw.toLowerCase()
  if (me.userId) {
    const { data: meRow } = await service
      .from('profiles')
      .select('email')
      .eq('id', me.userId)
      .maybeSingle()
    if (meRow?.email && meRow.email.toLowerCase() === peerEmail) {
      return c.json({ error: '不能与自己开聊' }, 400)
    }
  }
  const { data: peer, error: peerErr } = await service
    .from('profiles')
    .select('id, email, display_name')
    .eq('email', peerEmail)
    .maybeSingle()
  if (peerErr) {
    return c.json({ error: peerErr.message }, 400)
  }
  if (!peer) {
    return c.json(
      { error: '未找到该邮箱用户，请确认已注册并已有资料' },
      404,
    )
  }
  if (peer.id === me.userId) {
    return c.json({ error: '不能与自己开聊' }, 400)
  }
  const roomId = dmRoomIdForUsers(me.userId, peer.id)
  const { error: roomErr } = await service.from('chat_rooms').upsert(
    { id: roomId, name: peer.display_name ? String(peer.display_name) : peerEmail },
    { onConflict: 'id' },
  )
  if (roomErr) {
    return c.json({ error: roomErr.message }, 400)
  }
  const { error: pErr } = await service.from('chat_room_participants').upsert(
    [
      { room_id: roomId, user_id: me.userId },
      { room_id: roomId, user_id: peer.id },
    ],
    { onConflict: 'room_id,user_id' },
  )
  if (pErr) {
    if (
      pErr.message?.includes('chat_room_participants') &&
      pErr.message?.includes('does not exist')
    ) {
      return c.json(
        { error: '数据库缺少 chat_room_participants 表，请执行迁移后重试' },
        503,
      )
    }
    return c.json({ error: pErr.message }, 400)
  }
  return c.json({
    room: {
      id: roomId,
      name: peer.display_name ? String(peer.display_name) : (peer.email ?? peerEmail),
    },
    peer: {
      id: peer.id,
      email: peer.email ?? peerEmail,
      display_name: peer.display_name,
    },
  })
})

/** 当前用户参与的房间列表（带对方展示信息） */
chatroom.get('/rooms', async (c) => {
  const login = requireLogin(c)
  if (!login.ok) {
    return c.json({ error: login.res.error }, login.res.status)
  }
  const service = createServiceSupabase()
  if (!service) {
    return c.json({ error: '服务未配置' }, 500)
  }
  const me = getMyUserId(c)
  if (!me.ok) {
    return c.json({ error: me.res.error }, me.res.status)
  }
  const { data: part, error: pErr } = await service
    .from('chat_room_participants')
    .select('room_id')
    .eq('user_id', me.userId)
  if (pErr) {
    if (
      pErr.message?.includes('chat_room_participants') &&
      pErr.message?.includes('does not exist')
    ) {
      return c.json(
        { error: '数据库缺少 chat_room_participants 表' },
        503,
      )
    }
    return c.json({ error: pErr.message }, 400)
  }
  const roomIds = [...new Set((part ?? []).map((r) => r.room_id as string))]
  if (roomIds.length === 0) {
    return c.json({ rooms: [] })
  }
  const { data: rooms, error: rErr } = await service
    .from('chat_rooms')
    .select('id, name, created_at')
    .in('id', roomIds)
  if (rErr) {
    return c.json({ error: rErr.message }, 400)
  }
  const { data: others, error: oErr } = await service
    .from('chat_room_participants')
    .select('room_id, user_id')
    .in('room_id', roomIds)
    .neq('user_id', me.userId)
  if (oErr) {
    return c.json({ error: oErr.message }, 400)
  }
  const peerUserIds = [...new Set((others ?? []).map((r) => r.user_id as string))]
  const profById = new Map<string, { email: string; display_name: string | null }>()
  if (peerUserIds.length > 0) {
    const { data: profs, error: prErr } = await service
      .from('profiles')
      .select('id, email, display_name')
      .in('id', peerUserIds)
    if (prErr) {
      return c.json({ error: prErr.message }, 400)
    }
    for (const p of profs ?? []) {
      profById.set(p.id, {
        email: p.email ?? '',
        display_name: p.display_name,
      })
    }
  }
  const peerByRoom = new Map<string, { email: string; display_name: string | null }>()
  for (const row of others ?? []) {
    const pr = profById.get(row.user_id as string)
    if (pr) {
      peerByRoom.set(row.room_id as string, pr)
    }
  }
  const list = (rooms ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    peer: peerByRoom.get(r.id) ?? { email: '', display_name: null },
  }))
  return c.json({ rooms: list })
})

/** 轮询/加载历史：某房间内消息。 */
chatroom.get('/rooms/:roomId/messages', async (c) => {
  const service = createServiceSupabase()
  if (!service) {
    return c.json({ error: '服务未配置' }, 500)
  }
  const roomId = c.req.param('roomId')?.trim() ?? ''
  if (!roomId || !UUID_RE.test(roomId)) {
    return c.json({ error: 'invalid room id' }, 400)
  }

  const user = c.get('user')
  if (!user) {
    const guest = guestPublicEnabled()
    if (!guest || roomId !== guest.roomId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  } else {
    const me = getMyUserId(c)
    if (!me.ok) {
      return c.json({ error: me.res.error }, me.res.status)
    }
    const { data: m, error: mErr } = await service
      .from('chat_room_participants')
      .select('user_id')
      .eq('room_id', roomId)
      .eq('user_id', me.userId)
      .maybeSingle()
    if (mErr) {
      return c.json({ error: mErr.message }, 400)
    }
    if (!m) {
      return c.json({ error: '无权访问此房间' }, 403)
    }
  }
  const since = c.req.query('since')?.trim()
  const limitRaw = c.req.query('limit') ?? '50'
  const limit = Math.min(200, Math.max(1, Number.parseInt(limitRaw, 10) || 50))

  if (since && UUID_RE.test(since)) {
    const { data: afterRow, error: afterErr } = await service
      .from('chat_messages')
      .select('created_at')
      .eq('id', since)
      .eq('room_id', roomId)
      .maybeSingle()
    if (afterErr) {
      return c.json({ error: afterErr.message }, 400)
    }
    if (!afterRow?.created_at) {
      return c.json({ messages: [] })
    }
    const { data: rows, error: msgErr } = await service
      .from('chat_messages')
      .select('id, room_id, user_id, content, created_at')
      .eq('room_id', roomId)
      .gt('created_at', afterRow.created_at)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (msgErr) {
      return c.json({ error: msgErr.message }, 400)
    }
    return c.json({ messages: rows ?? [] })
  }

  const { data: descRows, error: msgErr } = await service
    .from('chat_messages')
    .select('id, room_id, user_id, content, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (msgErr) {
    return c.json({ error: msgErr.message }, 400)
  }
  const chrono = [...(descRows ?? [])].reverse()
  return c.json({ messages: chrono })
})

chatroom.post('/rooms/:roomId/messages', async (c) => {
  const service = createServiceSupabase()
  if (!service) {
    return c.json({ error: '服务未配置' }, 500)
  }
  const roomId = c.req.param('roomId')?.trim() ?? ''
  if (!roomId || !UUID_RE.test(roomId)) {
    return c.json({ error: 'invalid room id' }, 400)
  }
  let body: { content?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) {
    return c.json({ error: 'content 必填' }, 400)
  }

  const authed = c.get('user')
  if (!authed) {
    const guest = guestPublicEnabled()
    if (!guest || roomId !== guest.roomId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const { data: inserted, error: insErr } = await service
      .from('chat_messages')
      .insert({ room_id: roomId, user_id: guest.userId, content })
      .select('id, room_id, user_id, content, created_at')
      .single()
    if (insErr) {
      return c.json({ error: insErr.message }, 400)
    }
    return c.json({ message: inserted })
  }

  const me = getMyUserId(c)
  if (!me.ok) {
    return c.json({ error: me.res.error }, me.res.status)
  }
  const { data: m, error: pErr } = await service
    .from('chat_room_participants')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('user_id', me.userId)
    .maybeSingle()
  if (pErr) {
    return c.json({ error: pErr.message }, 400)
  }
  if (!m) {
    return c.json({ error: '无权在此房间发消息' }, 403)
  }
  const { data: inserted, error: insErr } = await service
    .from('chat_messages')
    .insert({ room_id: roomId, user_id: me.userId, content })
    .select('id, room_id, user_id, content, created_at')
    .single()
  if (insErr) {
    return c.json({ error: insErr.message }, 400)
  }
  return c.json({ message: inserted })
})

export { chatroom }