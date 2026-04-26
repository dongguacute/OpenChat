-- OpenChat 聊天表（与 apps/api/src/db/init.ts 一致；`supabase db reset` 会执行本迁移，PostgREST 才能发现表）
-- 要求：已存在 auth.users（Supabase 默认有）

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.profiles IS '与 auth.users 1:1，供聊天展示与 FK';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_read_all'
  ) THEN
    CREATE POLICY "profiles_read_all"
      ON public.profiles FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- chat_rooms
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.chat_rooms IS '聊天室；私聊为两人确定性 id，见 API dmRoomIdForUsers';

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_rooms' AND policyname = 'chat_rooms_read'
  ) THEN
    CREATE POLICY "chat_rooms_read"
      ON public.chat_rooms FOR SELECT TO authenticated
      USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_rooms' AND policyname = 'chat_rooms_insert_dm'
  ) THEN
    CREATE POLICY "chat_rooms_insert_dm"
      ON public.chat_rooms FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- chat_messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_len CHECK (
    char_length(content) > 0 AND char_length(content) <= 2000
  )
);
CREATE INDEX IF NOT EXISTS chat_messages_room_created_at
  ON public.chat_messages (room_id, created_at);
COMMENT ON TABLE public.chat_messages IS 'Realtime 订阅 INSERT';

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'chat_msg_select'
  ) THEN
    CREATE POLICY "chat_msg_select"
      ON public.chat_messages FOR SELECT TO authenticated
      USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chat_messages' AND policyname = 'chat_msg_insert_own'
  ) THEN
    CREATE POLICY "chat_msg_insert_own"
      ON public.chat_messages FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = user_id
        AND room_id IN (SELECT id FROM public.chat_rooms)
      );
  END IF;
END $$;

-- chat_room_participants（会话列表、鉴权用）
CREATE TABLE IF NOT EXISTS public.chat_room_participants (
  room_id uuid NOT NULL REFERENCES public.chat_rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS chat_room_participants_user_id
  ON public.chat_room_participants (user_id);
COMMENT ON TABLE public.chat_room_participants IS '谁在该房间，用于会话列表与鉴权';

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
END $$;
