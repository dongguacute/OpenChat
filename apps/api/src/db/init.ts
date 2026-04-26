/**
 * 本地/直连 PostgreSQL 的聊天表 schema 检查与创建。
 * Supabase JS 走 PostgREST 不能跑 DDL，故用 `pg` + `DATABASE_URL`。
 * 表存在性在 `config.ts` 的 `shouldSkipChatTableBootstrap` 中检查。
 */
import {
  poolForDirectDb,
  shouldSkipChatTableBootstrap,
  CHAT_MESSAGES_TABLE,
  CHAT_ROOM_PARTICIPANTS_TABLE,
  CHAT_ROOMS_TABLE,
} from './config'

/**
 * 多用户聊天：profiles、chat_rooms、chat_messages、RLS、Realtime 发布
 */
export async function ensureChatSchema(): Promise<void> {
  const pool = poolForDirectDb()
  if (!pool) {
    console.info('[db/init] 跳过聊天表：未配置 DATABASE_URL')
    return
  }
  try {
    if (await shouldSkipChatTableBootstrap(pool)) {
      console.info(
        `[db/init] 聊天表已存在: public.${CHAT_ROOMS_TABLE} 与 public.${CHAT_MESSAGES_TABLE}`,
      )
      return
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // profiles：展示邮箱/昵称（用户仅由 Admin API 通过 service role 写入）
      await client.query(`
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
        email text,
        display_name text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      COMMENT ON TABLE public.profiles IS '与 auth.users 1:1，供聊天展示与 FK';
    `)
      await client.query(`
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "profiles_read_all"
        ON public.profiles FOR SELECT TO authenticated
        USING (true);
    `)

      await client.query(`
      CREATE TABLE public.chat_rooms (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      COMMENT ON TABLE public.chat_rooms IS '聊天室；私聊为两人确定性 id，见前端 dmRoom';
    `)
      await client.query(`
      ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "chat_rooms_read"
        ON public.chat_rooms FOR SELECT TO authenticated
        USING (true);
      CREATE POLICY "chat_rooms_insert_dm"
        ON public.chat_rooms FOR INSERT TO authenticated
        WITH CHECK (true);
    `)

      await client.query(`
      CREATE TABLE public.chat_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id uuid NOT NULL REFERENCES public.chat_rooms (id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
        content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chat_messages_len CHECK (
          char_length(content) > 0 AND char_length(content) <= 2000
        )
      );
      CREATE INDEX chat_messages_room_created_at
        ON public.chat_messages (room_id, created_at);
      COMMENT ON TABLE public.chat_messages IS 'Realtime 订阅 INSERT';
    `)
      await client.query(`
      ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "chat_msg_select"
        ON public.chat_messages FOR SELECT TO authenticated
        USING (true);
      CREATE POLICY "chat_msg_insert_own"
        ON public.chat_messages FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() = user_id
          AND room_id IN (SELECT id FROM public.chat_rooms)
        );
    `)

      await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = 'chat_messages'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
        END IF;
      END
      $$;
    `)
      await client.query('COMMIT')
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // ignore
      }
      console.error('[db/init] 聊天表创建失败:', e)
      throw e
    } finally {
      client.release()
    }
    console.info(
      `[db/init] 已创建聊天相关表与 RLS: ${CHAT_ROOMS_TABLE}, ${CHAT_MESSAGES_TABLE}`,
    )
  } catch (e) {
    console.error('[db/init] 聊天表创建失败:', e)
    throw e
  } finally {
    await pool.end()
  }
}

/**
 * 已有库可能缺少 `chat_rooms` 的 INSERT 策略；补一条以便客户端为私聊建房间行。
 */
export async function ensureChatRoomInsertPolicy(): Promise<void> {
  const pool = poolForDirectDb()
  if (!pool) return
  try {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'chat_rooms'
          AND policyname = 'chat_rooms_insert_dm'
      ) AS exists`,
    )
    if (rows[0]?.exists) {
      return
    }
    const { rows: t } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'chat_rooms'
      ) AS exists`,
    )
    if (!t[0]?.exists) return
    await pool.query(`
      CREATE POLICY "chat_rooms_insert_dm"
        ON public.chat_rooms FOR INSERT TO authenticated
        WITH CHECK (true);
    `)
    console.info('[db/init] 已补全 chat_rooms_insert_dm 策略')
  } catch (e) {
    console.error('[db/init] 补全 chat_rooms 插入策略失败:', e)
    throw e
  } finally {
    await pool.end()
  }
}

/**
 * 启动时调用的总入口
 */
/**
 * 私聊参与方，用于在「我的会话」列表中展示；已有库在启动时补建。
 */
export async function ensureChatRoomParticipantsTable(): Promise<void> {
  const pool = poolForDirectDb()
  if (!pool) return
  try {
    const { rows: t } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists`,
      [CHAT_ROOM_PARTICIPANTS_TABLE],
    )
    if (t[0]?.exists) {
      return
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`
        CREATE TABLE public.chat_room_participants (
          room_id uuid NOT NULL REFERENCES public.chat_rooms (id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (room_id, user_id)
        );
        CREATE INDEX chat_room_participants_user_id
          ON public.chat_room_participants (user_id);
        COMMENT ON TABLE public.chat_room_participants IS '谁在该房间，用于会话列表与鉴权';
      `)
      await client.query('COMMIT')
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // ignore
      }
      throw e
    } finally {
      client.release()
    }
    console.info(`[db/init] 已创建 ${CHAT_ROOM_PARTICIPANTS_TABLE}`)
  } catch (e) {
    console.error('[db/init] chat_room_participants 创建失败:', e)
    throw e
  } finally {
    await pool.end()
  }
}

export async function ensureDemoSchema(): Promise<void> {
  await ensureChatSchema().catch((err) => {
    console.warn('[db/init] 聊天表可稍后重试', err)
  })
  await ensureChatRoomInsertPolicy().catch((err) => {
    console.warn('[db/init] chat_rooms 插入策略可稍后重试', err)
  })
  await ensureChatRoomParticipantsTable().catch((err) => {
    console.error('[db/init] chat_room_participants 未创建成功（会话列表会失败）:', err)
  })
}
