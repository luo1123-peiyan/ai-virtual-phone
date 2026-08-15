-- ============================================================
-- 离线推送 · Neon Postgres 建表脚本
-- 由 Cloudflare 单用户示例 (D1/SQLite) 移植到 Vercel + Neon (Postgres)
-- 只新增表，不改动任何现有业务表。安全可回滚。
-- 用法：在 Neon 控制台的 SQL Editor 里整段粘贴执行一次即可。
-- ============================================================

-- 1) 定时/待发消息表：调度服务的核心
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id                BIGSERIAL PRIMARY KEY,
  user_id           TEXT NOT NULL,
  uuid              TEXT,
  encrypted_payload TEXT NOT NULL,
  message_type      TEXT NOT NULL CHECK (message_type IN ('fixed','prompted','auto','instant')),
  next_send_at      TIMESTAMPTZ NOT NULL,
  lease_until       TIMESTAMPTZ,
  retry_after       TIMESTAMPTZ,
  serialize_group   TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  retry_count       INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_tasks_optimized
  ON scheduled_messages (status, next_send_at, id, retry_count)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cleanup_completed
  ON scheduled_messages (status, updated_at)
  WHERE status IN ('sent','failed');
CREATE INDEX IF NOT EXISTS idx_failed_retry
  ON scheduled_messages (status, retry_count, next_send_at)
  WHERE status = 'failed' AND retry_count < 3;
CREATE INDEX IF NOT EXISTS idx_user_id
  ON scheduled_messages (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_uuid
  ON scheduled_messages (uuid)
  WHERE uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_serialize_group_lease
  ON scheduled_messages (serialize_group, lease_until)
  WHERE serialize_group IS NOT NULL AND status = 'pending';

-- 2) 客户端状态的云端镜像（last-write-wins）
CREATE TABLE IF NOT EXISTS client_state (
  user_id     TEXT NOT NULL,
  namespace   TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  BIGINT NOT NULL,
  PRIMARY KEY (user_id, namespace, key)
);

-- 3) Web Push 订阅：一个用户一份
CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id      TEXT PRIMARY KEY,
  subscription TEXT NOT NULL,
  updated_at   BIGINT NOT NULL
);

-- 4) LLM API 凭据：任务按 cred_id 引用
CREATE TABLE IF NOT EXISTS llm_credentials (
  user_id         TEXT NOT NULL,
  cred_id         TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cred_id)
);

-- 5) 服务端收件箱：解决「离线也能补收」的关键（Vercel 版原本缺的就是它）
CREATE TABLE IF NOT EXISTS message_outbox (
  id             BIGSERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL,
  message_id     TEXT NOT NULL,
  task_uuid      TEXT,
  session_id     TEXT,
  message_index  INTEGER,
  total_messages INTEGER,
  payload        TEXT NOT NULL,
  created_at     BIGINT NOT NULL,
  delivered_at   BIGINT,
  acked_at       BIGINT,
  UNIQUE (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_outbox_unacked
  ON message_outbox (user_id, id)
  WHERE acked_at IS NULL;
