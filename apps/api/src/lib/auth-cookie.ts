import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'

/** HttpOnly cookie carrying JWT; Path=/api so it is only sent to API routes. */
export const ACCESS_COOKIE_NAME = 'openchat_access'

const ACCESS_MAX_AGE_SEC = 60 * 60 * 24 * 7

function secureCookieDefault(c: Context): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true
  if (process.env.COOKIE_SECURE === 'false') return false
  try {
    return new URL(c.req.url).protocol === 'https:'
  } catch {
    return false
  }
}

export function accessCookieSerializeOptions(c: Context) {
  return {
    path: '/api',
    httpOnly: true,
    secure: secureCookieDefault(c),
    sameSite: 'Lax' as const,
    maxAge: ACCESS_MAX_AGE_SEC,
  }
}

export function setAccessTokenCookie(c: Context, token: string): void {
  setCookie(c, ACCESS_COOKIE_NAME, token, accessCookieSerializeOptions(c))
}

export function clearAccessTokenCookie(c: Context): void {
  deleteCookie(c, ACCESS_COOKIE_NAME, accessCookieSerializeOptions(c))
}
