# 离线推送（Vercel + Neon 版）· 进度与部署清单

> 目标：让 float 到点能主动给你发消息（离线推送）。
> 因为电脑连不上 Cloudflare，改走 Vercel + Neon 路线，全程通过 GitHub 提交、Vercel 自动部署，不用本地 wrangler。

## 已完成（都在 `feat-offline-push` 分支，未动 main）

| 文件 | 作用（大白话） |
|------|----------------|
| `docs/offline-push/schema.postgres.sql` | 建表脚本 —— 「柜子的图纸」，在 Neon 里建 5 张表 |
| `lib/offline-push/db.ts` | 数据库连接 —— 「接线板」，让代码连上 Neon |
| `lib/offline-push/store.ts` | 数据存取层 —— 订阅/收件箱的增删查改 |
| `app/api/offline-push/health/route.ts` | 自检页 —— 浏览器打开看「通没通」 |
| `app/api/offline-push/vapid-public-key/route.ts` | 前端订阅要用的公钥出口 |
| `app/api/offline-push/push-subscription/route.ts` | 登记/查询/删除推送订阅 |
| `app/api/offline-push/outbox/route.ts` | 客户端上线补收（离线也不丢消息的关键） |
| `app/api/offline-push/outbox/ack/route.ts` | 补收完销账 |

## 待办（后续）

- [ ] 调度核心：cron 到点扫 `scheduled_messages` 并投递（需 Vercel Cron）
- [ ] Web Push 发送：用 VAPID 私钥对 payload 加密并 POST 到推送服务
- [ ] `/schedule-message`、`/messages`、`/client-state` 等端点
- [ ] 前端 Service Worker 订阅 + 补收接线
- [ ] payload 加密（当前订阅先明文入库，占位）

## 部署前需要做的事（等回南宁或精神好时，一步步来）

1. **加依赖**：`package.json` 里加 `@neondatabase/serverless`（Vercel 构建会自动装）。
2. **建表**：在 Neon 控制台 SQL Editor 里整段执行 `schema.postgres.sql`。
3. **配环境变量**（Vercel 项目 Settings → Environment Variables）：
   - `DATABASE_URL`（Neon 已自动注入，确认存在即可）
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL`（你已用 web-push-codelab 生成）
4. **合并分支**：`feat-offline-push` → `main`，Vercel 自动部署。
5. **验证**：浏览器打开 `https://<你的域名>/api/offline-push/health`，看返回的中文说明。

## 安全说明

- 所有接口 `user_id` 暂固定为 `self`（单用户）。若日后开放多人，需接入鉴权。
- 订阅/凭据字段预留了加密位（当前先明文占位），上线前应补加密。
- 密钥只放 Vercel 环境变量，绝不写进代码或提交到仓库。
