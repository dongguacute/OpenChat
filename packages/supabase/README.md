# OpenChat 数据库说明与配置

本仓库的「数据库」指 **Supabase 托管的 PostgreSQL** 以及其 **Storage**；Schema 以 `supabase/migrations/*.sql` 为唯一来源。应用侧还可通过 `DATABASE_URL` 用 `pg` 做直连（建表、补全列等，见下）。

---

## 1. 目录与迁移

| 路径 | 说明 |
|------|------|
| `supabase/config.toml` | 本地 `supabase start` 的配置（端口、Postgres 版本等） |
| `supabase/migrations/` | 按时间戳顺序执行；新环境/云端推送均依赖这些文件 |
| `scripts/db-push-url.sh` | 需要显式 `SUPABASE_DB_URL` 时执行 `db push` |
| `scripts/db-push-local.sh` | 从仓库 `apps/api/.env` 读取 `DATABASE_URL` 后执行 `db push`（本机开发） |

当前迁移文件：

- `20250501000000_openchat.sql`：`profiles`、`chat_rooms`、`chat_messages`、`chat_room_participants`、RLS、Realtime 发布
- `20250502100000_chat_image_storage.sql`：`chat_messages.image_path`、内容约束、私有桶 `chat-images`、`storage.objects` 策略

**云端新项目**：先完成下方「推迁移」，再在 Dashboard 中核对表与策略是否存在。

---

## 2. 依赖与前提

- **包管理**：[pnpm](https://pnpm.io)（见仓库根 `package.json` 的 `packageManager`）
- **Supabase CLI**：在 `packages/supabase` 以 devDependency 安装，用根目录脚本调用
- **本机起栈**：`supabase start` 需本机可运行 **Docker**；首次会拉取镜像
- **账号**：推送到 **线上 Supabase 项目** 前需能执行 `supabase login` 并完成 **link** 或提供**直连库 URI**（见第 4 节）

---

## 3. 环境变量一览

### 3.1 API（`apps/api/.env`）

| 变量 | 用途 |
|------|------|
| `DATABASE_URL` | 直连 PostgreSQL。本地一般为 `supabase start` 后的 `127.0.0.1:54322`；云托管用 Dashboard 的 **Connection string**（**直连/Session** 的 `5432` 更利于迁移动作） |
| `SUPABASE_URL` | Supabase API 基址。本地为 `http://127.0.0.1:54321` |
| `SUPABASE_ANON_KEY` | 匿名公钥，供 Hono 建客户端 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端角色密钥，**勿提交、勿进前端**；管理用户、写库、上传 Storage 等 |
| `OPENCHAT_DB_BOOTSTRAP` | 可选。设为 `0` / `false` / `no` / `off` 时，**不执行** `apps/api/src/db/init.ts` 中的启动时建表/补列（`tsx watch src/dev.ts` 时）。默认开启；**已用 `db push` 管理 schema 时建议关闭**，避免与迁移对同一库重复改 DDL |
| 其他 | `JWT_SECRET`、`ADMIN_*` 等与认证相关，不直接改数据库 Schema |

说明：

- 若 `DATABASE_URL` 指向 **Supabase 云**，且主机名含 `supabase.co` 或 `pooler.`，`apps/api` 的 `config.ts` 会对 `pg` 使用常见 SSL 设置。
- 开发入口 `dev.ts` 会调用 `ensureDemoSchema`（当 `OPENCHAT_DB_BOOTSTRAP` 未关闭时），在空库或缺表时 **自动建表/补全**（见 `init.ts`）。**Storage 桶等仍须靠迁移**；与迁移脚本重叠的部分（如 `image_path`、约束）仅作兼容兜底，**线上一律以 `supabase/migrations` 为准**。

### 3.2 Web 前端

聊天 Realtime 需要浏览器侧能拿到与 API 同项目的 URL 与 anon key：

- 推荐在 `apps/web/.env` 中设置 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（与 `supabase status` 或线上一致）；
- 或依赖 `apps/web/vite.config.ts` 从 **API 的 env** 注入（以你本地 Vite 配置为准）。

改 env 后需 **重启 Vite 开发服**。

### 3.3 仅用于 CLI 脚本

| 变量 | 使用场景 |
|------|----------|
| `SUPABASE_DB_URL` | 与 `db:push:url` / `db-push-url.sh` 联用，任意「直连」Postgres（密码特殊字符需 [百分号编码](https://en.wikipedia.org/wiki/Percent-encoding)） |
| `SUPABASE_PROJECT_REF` + `SUPABASE_DB_PASSWORD` | 与 `db:link:env` 非交互式 **link** 联用；ref 在 Dashboard **Project Settings → General → Reference ID** |

---

## 4. 把迁移推送到「库」的三种方式

| 方式 | 根目录命令 | 适用场景 | 要求 |
|------|------------|----------|------|
| **A. 已 link 的远程项目** | `pnpm db:push` | 开发机已与云端 `supabase link` | 无交互：`pnpm db:link:env`（先 `pnpm db:login`） |
| **B. 显式库 URI** | `pnpm db:push:url` | CI、临时指向某实例 | 已 `export SUPABASE_DB_URL='postgresql://...'`；脚本会检测空变量 |
| **C. 读 `apps/api/.env` 的 `DATABASE_URL`** | `pnpm db:push:local` | 本机 `supabase start` 与 API 同库 | 先 `pnpm db:start`（或 54322 可连） |

- **A** 若报 `Cannot find project ref. Have you run supabase link?`，需先 `pnpm db:link` 或 **link:env**。
- **B** 与 **C** 不依赖 `link`；C 在 `packages/supabase` 下执行 `bash ./scripts/db-push-local.sh`（由 `push:local` 间接调用），从仓库根解析 `apps/api/.env`。

---

## 5. 常用 pnpm 命令（在仓库根执行）

| 命令 | 作用 |
|------|------|
| `pnpm db:start` | 本机起 Supabase 栈（Postgres/Studio 等） |
| `pnpm db:stop` | 停止本机栈 |
| `pnpm db:status` | 查看本机各服务 URL/密钥（可用来填 `apps/api/.env` 与 Vite） |
| `pnpm db:reset` | 本机库 **清空并按迁移重建**（会丢本地数据，慎用） |
| `pnpm db:push` | 将未应用迁移推送到 **已 link 的**远程项目 |
| `pnpm db:push:url` | 使用 `SUPABASE_DB_URL` 推送 |
| `pnpm db:push:local` | 使用 `apps/api/.env` 的 `DATABASE_URL` 推送 |
| `pnpm db:login` | 登录 Supabase CLI |
| `pnpm db:link` | 交互式将本地 `packages/supabase` 与线上项目关联 |
| `pnpm db:link:env` | 非交互式 link（需 `SUPABASE_PROJECT_REF` 与 `SUPABASE_DB_PASSWORD`） |

---

## 6. 推荐工作流

### 6.1 本机自测

1. `pnpm db:start` → `pnpm db:status` 复制 URL/Key 到 `apps/api/.env`（与模板一致即可：`DATABASE_URL=...@127.0.0.1:54322/...`）。
2. 首次或改迁移后：根目录 `pnpm db:push:local`（或本机也常用 `db:reset` 从空白初始化）。
3. 启动 API 与 Web，用聊天/管理功能验证 RLS 与 Realtime。

### 6.2 线上（单项目）

1. `pnpm db:login`
2. `pnpm db:link` 或 `pnpm db:link:env`
3. `pnpm db:push`
4. 在 [Dashboard](https://supabase.com/dashboard) 的 **Table Editor / Storage** 核对；把 **Project URL、anon、service role** 配到部署环境的 API/CI 密文，勿泄露 service role。

### 6.3 无 link、只有连接串

1. 在 Dashboard 复制 **Database → Connection string（URI，直连/Session）**
2. `export SUPABASE_DB_URL='...'`
3. `pnpm db:push:url`

---

## 7. 故障与修复

- **`flag needs an argument: --db-url`**：`SUPABASE_DB_URL` 未设置；或用 `db:push:local` 代替。
- **迁移与本地自举同时改了同一约束**：已尽量将迁移写为**幂等**；若某版本在 `supabase_migrations` 中状态异常，可用官方 CLI 的 [`migration repair`](https://supabase.com/docs/reference/cli/supabase-migration-repair) 再执行 `db push`。
- **Storage 策略不生效**：确认迁移里 `chat-images` 桶与 `storage.objects` 策略已应用，且用户为 **authenticated** 且为 `chat_room_participants` 成员。

---

## 8. 参考文档

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [本地开发](https://supabase.com/docs/guides/local-development)
- [Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage 访问控制](https://supabase.com/docs/guides/storage/security/access-control)
