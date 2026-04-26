import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'

/** HttpOnly cookie carrying JWT; Path=/api so it is only sent to API routes. */
export const ACCESS_COOKIE_NAME = 'openchat_access'
/** 仅用于 `/api/chat/supabase-token` 刷新，使浏览器可连 Supabase Realtime。 */
export const SUPABASE_REFRESH_COOKIE_NAME = 'openchat_sbat'

const ACCESS_MAX_AGE_SEC = 60 * 60 * 24 * 7
const SUPABASE_REFRESH_MAX_AGE_SEC = 60 * 60 * 24 * 60

function secureCookieDefault(c: Context): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true
  if (process.env.COOKIE_SECURE === 'false') return false
  try {
    return new URL(c.req.url).protocol === 'https:'
  } catch {
    return false
  }
}

function cookiePathApi(c: Context) {
  return {
    path: '/api' as const,
    httpOnly: true as const,
    secure: secureCookieDefault(c),
    sameSite: 'Lax' as const,
  }
}

export function accessCookieSerializeOptions(c: Context) {
  return {
    ...cookiePathApi(c),
    maxAge: ACCESS_MAX_AGE_SEC,
  }
}

export function supabaseRefreshCookieOptions(c: Context) {
  return {
    ...cookiePathApi(c),
    maxAge: SUPABASE_REFRESH_MAX_AGE_SEC,
  }
}

export function setAccessTokenCookie(c: Context, token: string): void {
  setCookie(c, ACCESS_COOKIE_NAME, token, accessCookieSerializeOptions(c))
}

export function clearAccessTokenCookie(c: Context): void {
  deleteCookie(c, ACCESS_COOKIE_NAME, accessCookieSerializeOptions(c))
}

export function setSupabaseRefreshCookie(c: Context, refreshToken: string): void {
  setCookie(
    c,
    SUPABASE_REFRESH_COOKIE_NAME,
    refreshToken,
    supabaseRefreshCookieOptions(c),
  )
}

export function clearSupabaseRefreshCookie(c: Context): void {
  deleteCookie(c, SUPABASE_REFRESH_COOKIE_NAME, supabaseRefreshCookieOptions(c))
}
