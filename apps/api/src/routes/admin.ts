import { Hono } from 'hono'
import { createServiceSupabase } from '../lib/supabase-service'
import { requireAdmin, requireAuth, type AppVariables } from '../middleware/auth'

export interface CreateUserRequest {
  email: string
  password: string
  display_name?: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parsePageParams(c: { req: { query: (k: string) => string | undefined } }): {
  page: number
  perPage: number
} {
  const rawPage = c.req.query('page')
  const rawPer = c.req.query('perPage') ?? c.req.query('per_page')
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1)
  const perPageRaw = Number.parseInt(rawPer ?? '50', 10) || 50
  const perPage = Math.min(1000, Math.max(1, perPageRaw))
  return { page, perPage }
}

const admin = new Hono<{ Variables: AppVariables }>()

admin.use('*', requireAuth)
admin.use('*', requireAdmin)

admin.get('/users', async (c) => {
  const service = createServiceSupabase()
  if (!service) {
    return c.json({ error: 'Server misconfigured' }, 500)
  }

  const { page, perPage } = parsePageParams(c)
  const { data, error } = await service.auth.admin.listUsers({ page, perPage })

  if (error) {
    return c.json({ error: error.message }, 400)
  }

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email,
    phone: u.phone,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    email_confirmed_at: u.email_confirmed_at,
    user_metadata: u.user_metadata,
    is_anonymous: u.is_anonymous,
  }))

  return c.json({
    users,
    page,
    perPage,
    total: data.total,
    nextPage: data.nextPage,
    lastPage: data.lastPage,
  })
})

admin.delete('/users/:id', async (c) => {
  const service = createServiceSupabase()
  if (!service) {
    return c.json({ error: 'Server misconfigured' }, 500)
  }

  const id = c.req.param('id')?.trim() ?? ''
  if (!id || !UUID_RE.test(id)) {
    return c.json({ error: 'invalid user id' }, 400)
  }

  const { data, error } = await service.auth.admin.deleteUser(id)

  if (error) {
    return c.json({ error: error.message }, 400)
  }

  return c.json({ ok: true, id: data.user?.id ?? id })
})

admin.post('/users', async (c) => {
  const service = createServiceSupabase()
  if (!service) {
    return c.json({ error: 'Server misconfigured' }, 500)
  }

  let body: CreateUserRequest
  try {
    body = await c.req.json<CreateUserRequest>()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const display_name =
    typeof body.display_name === 'string' ? body.display_name.trim() : undefined

  if (!email || !password) {
    return c.json({ error: 'email and password required' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: 'password must be at least 8 characters' }, 400)
  }

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata:
      display_name && display_name.length > 0
        ? { display_name }
        : undefined,
  })

  if (createErr || !created.user) {
    return c.json(
      { error: createErr?.message ?? 'Failed to create user' },
      400,
    )
  }

  const uid = created.user.id
  const { error: profileErr } = await service.from('profiles').upsert(
    {
      id: uid,
      email,
      display_name: display_name && display_name.length > 0 ? display_name : null,
    },
    { onConflict: 'id' },
  )

  if (profileErr) {
    console.warn('[admin] profiles upsert:', profileErr.message)
  }

  return c.json({
    id: uid,
    email: created.user.email ?? email,
  })
})

export { admin }
