/** 与 `apps/api` 聊天图上传、Supabase 桶名一致 */
export const CHAT_IMAGES_BUCKET = 'chat-images'

export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024

export const CHAT_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const

export const CHAT_IMAGE_ACCEPT = CHAT_IMAGE_MIME.join(',')

export function isChatImageFile(f: File): boolean {
  return (CHAT_IMAGE_MIME as readonly string[]).includes(f.type)
}
