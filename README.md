# OpenChat

Turborepo + pnpm：Vite 前端在 `apps/web`；Hono 在 `apps/api`（本地与 `pnpm dev` 一起起）。根目录 `package.json` 的 `lint` 使用 `eslint.config.mjs` 覆盖全仓。

## 开发

```bash
pnpm install
pnpm dev
```

- `apps/web`：Vite（代理 `/api` 到 Hono 默认 8787）
- `apps/api`：Hono 本地起服务

## 命令

- `pnpm build`：前端构建（`turbo`）
- `pnpm typecheck`：TypeScript
- `pnpm lint`：ESLint

## Vercel

- **Root Directory**：仓库根（`vercel.json`）
- 当前配置为**仅发布** `apps/web` 的静态构建产物；线上下不再包含仓库根下 `api/` 的 Serverless 入口。若之后要在同一项目里上 API，需自行再加部署方式或重新接入 Hono 入口。
