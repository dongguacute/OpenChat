import * as jose from 'jose'

export type JwtPayload = {
  sub: string
  role: 'admin' | 'user'
  email?: string
}

function secretKey(): Uint8Array {
  const s = process.env.JWT_SECRET?.trim()
  if (!s) {
    throw new Error('JWT_SECRET is not set')
  }
  return new TextEncoder().encode(s)
}

export async function signAccessToken(
  payload: JwtPayload,
  expiresIn: string = '7d',
): Promise<string> {
  return new jose.SignJWT({
    role: payload.role,
    email: payload.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey())
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jose.jwtVerify(token, secretKey())
  const role = payload.role
  if (role !== 'admin' && role !== 'user') {
    throw new Error('invalid token role')
  }
  const sub = payload.sub
  if (!sub) {
    throw new Error('invalid token subject')
  }
  return {
    sub,
    role,
    email: typeof payload.email === 'string' ? payload.email : undefined,
  }
}
