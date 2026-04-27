-- 聊天图片：message 上挂 storage 路径，与 chat_rooms 通过 room_id 关联；图片对象路径为 {room_id}/{name}

-- 1) chat_messages.image_path + 内容约束（纯文本 或 带图+可选说明）
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS image_path text;
COMMENT ON COLUMN public.chat_messages.image_path IS
  'Supabase Storage bucket chat-images 内相对路径，首段为 room_id';

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_len;

-- 与 apps/api ensureChatImageFeature 可能已先创建同约束，须幂等以免重跑迁移失败
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_messages_body'
      AND conrelid = 'public.chat_messages'::regclass
  ) THEN
    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_body CHECK (
        char_length(content) <= 2000
        AND (
          image_path IS NOT NULL
          OR (btrim(content) <> '')
        )
      );
  END IF;
END $$;

-- 2) 私有桶（经 RLS 按房间参与者放行；大小/类型在 API 侧再校验）
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 3) storage.objects：仅房间参与者可读写其 room 前缀下对象
-- name 格式：{room_id as uuid string}/{file...}，首段用 storage.foldername(name)[1] 与 chat_room_participants 校验

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'chat_images_select'
  ) THEN
    CREATE POLICY "chat_images_select"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'chat-images'
        AND EXISTS (
          SELECT 1
          FROM public.chat_room_participants p
          WHERE p.user_id = (SELECT auth.uid())
            AND p.room_id::text = (storage.foldername(name))[1]
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'chat_images_insert'
  ) THEN
    CREATE POLICY "chat_images_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'chat-images'
        AND EXISTS (
          SELECT 1
          FROM public.chat_room_participants p
          WHERE p.user_id = (SELECT auth.uid())
            AND p.room_id::text = (storage.foldername(name))[1]
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'chat_images_update'
  ) THEN
    CREATE POLICY "chat_images_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'chat-images'
        AND EXISTS (
          SELECT 1
          FROM public.chat_room_participants p
          WHERE p.user_id = (SELECT auth.uid())
            AND p.room_id::text = (storage.foldername(name))[1]
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'chat_images_delete'
  ) THEN
    CREATE POLICY "chat_images_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'chat-images'
        AND EXISTS (
          SELECT 1
          FROM public.chat_room_participants p
          WHERE p.user_id = (SELECT auth.uid())
            AND p.room_id::text = (storage.foldername(name))[1]
        )
      );
  END IF;
END $$;
