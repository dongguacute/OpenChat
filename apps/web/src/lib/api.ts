export type ApiErrorBody = { error?: string }

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const defaultFetchInit: RequestInit = {
  credentials: 'include',
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(path, { ...defaultFetchInit, ...init, headers })
  const text = await res.text()
  let json: unknown = null
  if (text.length > 0) {
    try {
      json = JSON.parse(text) as unknown
    } catch {
      json = { raw: text }
    }
  }

  if (!res.ok) {
    const errMsg =
      typeof json === 'object' && json !== null && 'error' in json
        ? String((json as ApiErrorBody).error ?? res.statusText)
        : res.statusText
    throw new ApiError(errMsg, res.status, json)
  }

  return json as T
}
