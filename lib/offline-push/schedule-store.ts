/**
 * 离线推送 · 调度存取层
 * ------------------------------------------------------------
 * 负责 scheduled_messages 表：排一条定时任务、到点领取待发任务、
 * 投递后收尾（成功/失败/重试）。
 *
 * 时间统一用 ISO 字符串存 TIMESTAMPTZ。领取用「乐观租约」：
 * 先把到点且没被占用的任务写上 lease_until，占住再发，避免 cron
 * 两跳重复投递同一条。
 */
import { getSql } from './db';

export type MessageType = 'fixed' | 'prompted' | 'auto' | 'instant';

export interface ScheduleInput {
  userId: string;
  uuid?: string | null;
  encryptedPayload: string;
  messageType: MessageType;
  nextSendAt: string; // ISO
}

export interface DueTask {
  id: number;
  userId: string;
  uuid: string | null;
  encryptedPayload: string;
  messageType: MessageType;
  nextSendAt: string;
  retryCount: number;
}

/** 排一条定时任务。uuid 撞车（幂等）时返回既有行的 id。 */
export async function insertSchedule(input: ScheduleInput): Promise<{ id: number; created: boolean }> {
  const sql = getSql();
  const now = new Date().toISOString();

  if (input.uuid) {
    const existing = (await sql`
      SELECT id FROM scheduled_messages WHERE uuid = ${input.uuid} LIMIT 1
    `) as Array<{ id: number }>;
    if (existing.length > 0) {
      return { id: Number(existing[0].id), created: false };
    }
  }

  const rows = (await sql`
    INSERT INTO scheduled_messages
      (user_id, uuid, encrypted_payload, message_type, next_send_at, status, retry_count, created_at, updated_at)
    VALUES
      (${input.userId}, ${input.uuid ?? null}, ${input.encryptedPayload}, ${input.messageType},
       ${input.nextSendAt}, 'pending', 0, ${now}, ${now})
    RETURNING id
  `) as Array<{ id: number }>;
  return { id: Number(rows[0].id), created: true };
}

/**
 * 领取到点待发任务：把 next_send_at <= now、且没被租约占用的 pending 任务
 * 占住（写 lease_until = now + leaseMs），返回这批任务给调用方去投递。
 */
export async function claimDueTasks(
  opts: { now?: Date; leaseMs?: number; limit?: number } = {}
): Promise<DueTask[]> {
  const sql = getSql();
  const now = opts.now ?? new Date();
  const leaseMs = opts.leaseMs ?? 10 * 60_000;
  const nowIso = now.toISOString();
  const leaseUntilIso = new Date(now.getTime() + leaseMs).toISOString();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  // 原子领取：仅占用到点、pending、未被有效租约锁住的任务
  const rows = (await sql`
    UPDATE scheduled_messages
    SET lease_until = ${leaseUntilIso}, updated_at = ${nowIso}
    WHERE id IN (
      SELECT id FROM scheduled_messages
      WHERE status = 'pending'
        AND next_send_at <= ${nowIso}
        AND (lease_until IS NULL OR lease_until <= ${nowIso})
        AND (retry_after IS NULL OR retry_after <= ${nowIso})
      ORDER BY next_send_at ASC
      LIMIT ${limit}
    )
    RETURNING id, user_id, uuid, encrypted_payload, message_type, next_send_at, retry_count
  `) as Array<{
    id: number; user_id: string; uuid: string | null; encrypted_payload: string;
    message_type: MessageType; next_send_at: string; retry_count: number;
  }>;

  return rows.map((r) => ({
    id: Number(r.id),
    userId: r.user_id,
    uuid: r.uuid,
    encryptedPayload: r.encrypted_payload,
    messageType: r.message_type,
    nextSendAt: r.next_send_at,
    retryCount: Number(r.retry_count),
  }));
}

/** 投递成功：标记 sent。 */
export async function markSent(id: number): Promise<void> {
  const sql = getSql();
  const now = new Date().toISOString();
  await sql`
    UPDATE scheduled_messages
    SET status = 'sent', lease_until = NULL, updated_at = ${now}
    WHERE id = ${id}
  `;
}

/**
 * 投递失败：记 last_error，重试次数 +1。未超 3 次则退避重试（写 retry_after），
 * 超过则标 failed。
 */
export async function markFailed(id: number, errorSummary: string): Promise<void> {
  const sql = getSql();
  const now = new Date();
  const nowIso = now.toISOString();
  const retryAfterIso = new Date(now.getTime() + 5 * 60_000).toISOString();
  await sql`
    UPDATE scheduled_messages
    SET retry_count = retry_count + 1,
        last_error = ${errorSummary},
        lease_until = NULL,
        retry_after = CASE WHEN retry_count + 1 < 3 THEN ${retryAfterIso}::timestamptz ELSE NULL END,
        status = CASE WHEN retry_count + 1 < 3 THEN 'pending' ELSE 'failed' END,
        updated_at = ${nowIso}
    WHERE id = ${id}
  `;
}

/** 列出某用户的任务（面板用），按创建时间倒序。 */
export async function listSchedules(
  userId: string,
  opts: { limit?: number } = {}
): Promise<Array<{ id: number; uuid: string | null; messageType: MessageType; nextSendAt: string; status: string; retryCount: number; lastError: string | null }>> {
  const sql = getSql();
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 100);
  const rows = (await sql`
    SELECT id, uuid, message_type, next_send_at, status, retry_count, last_error
    FROM scheduled_messages
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as Array<{ id: number; uuid: string | null; message_type: MessageType; next_send_at: string; status: string; retry_count: number; last_error: string | null }>;
  return rows.map((r) => ({
    id: Number(r.id),
    uuid: r.uuid,
    messageType: r.message_type,
    nextSendAt: r.next_send_at,
    status: r.status,
    retryCount: Number(r.retry_count),
    lastError: r.last_error,
  }));
}

/** 取消（删除）一条任务。 */
export async function cancelSchedule(userId: string, id: number): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM scheduled_messages WHERE user_id = ${userId} AND id = ${id}
    RETURNING id
  `) as Array<{ id: number }>;
  return rows.length > 0;
}
