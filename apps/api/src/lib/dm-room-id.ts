import { createHash } from 'node:crypto'

/**
 * 由两名用户的 UUID 得到确定性、稳定排序的私聊「房间 id」。
 * 同一会话双方计算结果一致，便于在首次打开时 upsert 同一条 `chat_rooms` 行。
 */
export function dmRoomIdForUsers(userIdA: string, userIdB: string): string {
  const [a, b] = [userIdA.toLowerCase(), userIdB.toLowerCase()].sort(
    (x, y) => x.localeCompare(y),
  )
  const hash = createHash('sha256')
    .update(`openchat:dm1:${a}:${b}`, 'utf8')
    .digest()
  const buf = Buffer.alloc(16)
  hash.copy(buf, 0, 0, 16)
  buf[6] = (buf[6]! & 0x0f) | 0x40
  buf[8] = (buf[8]! & 0x3f) | 0x80
  const hex = buf.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}
