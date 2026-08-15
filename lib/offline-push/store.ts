/**
 * 离线推送 · 数据访问层（Store）
 * ------------------------------------------------------------
 * 把对 5 张表的读写收拢到这里，API 路由只调这些函数，不直接写 SQL。
 * 全部基于 lib/offline-push/db.ts 的 Neon 连接。
 *
 * 注意：本层只做存取，不做加密。加密/鉴权在上层 API 里处理，
 *       这样便于单元测试，也让职责清晰。
 */
import { getSql } from './db';

// ---------------- Web Push 订阅 ----------------

export interface StoredSubscription {
  userId: string;
  subscription: string; // 已加密的订阅 JSON 字符串
  updatedAt: number; // epoch 毫秒
}

/** 登记 / 覆盖用户的推送订阅（幂等）。 */
export async function putPushSubscription(row: StoredSubscription): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO push_subscriptions (user_id, subscription, updated_at)
    VALUES (${row.userId}, ${row.subscription}, ${row.updatedAt})
    ON CONFLICT (user_id)
    DO UPDATE SET subscription = EXCLUDED.subscription,
                  updated_at   = EXCLUDED.updated_at
  `;
}

/** 读取用户的推送订阅；没有则返回 null。 */
export async function getPushSubscription(
  userId: string
): Promise<StoredSubscription | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT user_id, subscription, updated_at
    FROM push_subscriptions
    WHERE user_id = ${userId}
    LIMIT 1
  `) as Array<{ user_id: string; subscription: string; updated_at: number }>;
  if (rows.length === 0) return null;
  const r = rows[0];
  return { userId: r.user_id, subscription: r.subscription, updatedAt: Number(r.updated_at) };
}

/** 删除用户的推送订阅（「停止接收推送」按钮用）。 */
export async function deletePushSubscription(userId: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM push_subscriptions WHERE user_id = ${userId}`;
}

// ---------------- 服务端收件箱（outbox） ----------------

export interface OutboxEntry {
  userId: string;
  messageId: string;
  taskUuid?: string | null;
  sessionId?: string | null;
  messageIndex?: number | null;
  totalMessages?: number | null;
  payload: string; // 整条 push JSON 的密文
  createdAt: number;
}

/** 落一行收件箱账（发 push 前先存）。同一 messageId 幂等。 */
export async function appendOutbox(entry: OutboxEntry): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO message_outbox
      (user_id, message_id, task_uuid, session_id, message_index, total_messages, payload, created_at)
    VALUES
      (${entry.userId}, ${entry.messageId}, ${entry.taskUuid ?? null}, ${entry.sessionId ?? null},
       ${entry.messageIndex ?? null}, ${entry.totalMessages ?? null}, ${entry.payload}, ${entry.createdAt})
    ON CONFLICT (user_id, message_id) DO NOTHING
  `;
}

/** 拉未 ack 的收件箱条目（客户端上线补收）。按 id 升序，游标用 sinceId。 */
export async function getUnackedOutbox(
  userId: string,
  opts: { sinceId?: number; limit?: number } = {}
): Promise<{ entries: Array<{ id: number; messageId: string; payload: string }>; cursor: number | null; hasMore: boolean }> {
  const sql = getSql();
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 100);
  const sinceId = opts.sinceId ?? 0;
  const rows = (await sql`
    SELECT id, message_id, payload
    FROM message_outbox
    WHERE user_id = ${userId} AND acked_at IS NULL AND id > ${sinceId}
    ORDER BY id ASC
    LIMIT ${limit + 1}
  `) as Array<{ id: number; message_id: string; payload: string }>;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const entries = page.map((r) => ({ id: Number(r.id), messageId: r.message_id, payload: r.payload }));
  const cursor = entries.length > 0 ? entries[entries.length - 1].id : null;
  return { entries, cursor, hasMore };
}

/** 客户端确认收到后销账（按 messageId）。 */
export async function ackOutbox(userId: string, messageIds: string[]): Promise<number> {
  if (messageIds.length === 0) return 0;
  const sql = getSql();
  const now = Date.now();
  const rows = (await sql`
    UPDATE message_outbox
    SET acked_at = ${now}
    WHERE user_id = ${userId}
      AND acked_at IS NULL
      AND message_id = ANY(${messageIds})
    RETURNING id
  `) as Array<{ id: number }>;
  return rows.length;
}

/** 标记某条已通过 Web Push 发出去（记 delivered_at）。 */
export async function markOutboxDelivered(userId: string, messageId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE message_outbox
    SET delivered_at = ${Date.now()}
    WHERE user_id = ${userId} AND message_id = ${messageId} AND delivered_at IS NULL
  `;
}
