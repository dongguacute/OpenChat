import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createMiddleware } from "hono/factory";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadEnv({ path: resolve(apiRoot, ".env") });
loadEnv({ path: resolve(apiRoot, ".env.local") });

/**
 * 从环境变量读取的 Supabase 配置（Hono 进程侧使用）。
 * 本地可与 `packages/supabase` 中 `supabase status` 输出的 URL / 密钥 对应。
 */
export const supabaseConfig = {
  url: process.env.SUPABASE_URL ?? "",
  anonKey: process.env.SUPABASE_ANON_KEY ?? "",
  /** 仅服务端使用，切勿下发给客户端 */
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
} as const;

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseConfig.url && supabaseConfig.anonKey);
}

export type HonoSupabase = {
  /** 携带 `Authorization: Bearer`（若存在），供 PostgREST RLS 使用 */
  withAuth: SupabaseClient;
  /** 匿名，无用户会话 */
  anon: SupabaseClient;
  /** 使用 service role 时可用（需配置 SUPABASE_SERVICE_ROLE_KEY） */
  admin: SupabaseClient | null;
};

/**
 * 为单次请求准备 Supabase 客户端：有 Bearer 时将其传给 API，与「服务端按用户 JWT 访问」一致。
 * 未配置环境变量时返回 `null`（不抛错，便于仅跑 health 等无 DB 场景）。
 */
export function getSupabaseForRequest(
  authHeader: string | undefined,
): HonoSupabase | null {
  if (!isSupabaseConfigured()) return null;
  const { url, anonKey, serviceRoleKey } = supabaseConfig;

  const anon = createClient(url, anonKey, clientOptions);
  const withAuth = authHeader
    ? createClient(url, anonKey, {
        ...clientOptions,
        global: { headers: { Authorization: authHeader } },
      })
    : anon;

  const admin =
    serviceRoleKey && serviceRoleKey.length > 0
      ? createClient(url, serviceRoleKey, clientOptions)
      : null;

  return { withAuth, anon, admin };
}

/**
 * 在 Hono 中挂载，路由内通过 `c.get('supabase')` 使用；未配置时为 `null`。
 * App 上需带类型：`new Hono<{ Variables: { supabase: HonoSupabase | null } }>()`
 */
export const supabaseMiddleware = createMiddleware(async (c, next) => {
  c.set("supabase", getSupabaseForRequest(c.req.header("Authorization")));
  await next();
});

export type { SupabaseClient };
