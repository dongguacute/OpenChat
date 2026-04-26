import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, requireAuth, type AppVariables } from '../middleware/auth'

export interface CreateUserRequest {
  email: string
  password: string
  display_name?: string
}

const admin = new Hono<{ Variables: AppVariables }>()

admin.use('*', requireAuth)
admin.use('*', requireAdmin)

admin.post('/users', async (c) => {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceKey) {
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

  const service = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

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
