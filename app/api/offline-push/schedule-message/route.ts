/**
 * 离线推送 · 排定时消息端点
 * ------------------------------------------------------------
 *  POST /api/offline-push/schedule-message
 *    body: { messageType, firstSendTime, uuid?, payload }
 *  GET  /api/offline-push/schedule-message
 *    列出当前用户的任务（面板用）
 *
 * 约束：
 *  - 未登记推送订阅时返回 409 PUSH_SUBSCRIPTION_MISSING（建了也发不出去）。
 *  - firstSendTime 必须能解析、且至少比现在晚 60 秒。
 */
import { NextResponse } from 'next/server';
import { insertSchedule, listSchedules, type MessageType } from '@/lib/offline-push/schedule-store';
import { getPushSubscription } from '@/lib/offline-push/store';
import { isDbConfigured } from '@/lib/offline-push/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const USER_ID = 'self';
const VALID_TYPES: MessageType[] = ['fixed', 'prompted', 'auto', 'instant'];

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, message: '未配置数据库。' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: '请求体不是合法 JSON。' }, { status: 400 });
  }

  const messageType = body.messageType as MessageType;
  if (!VALID_TYPES.includes(messageType)) {
    return NextResponse.json(
      { ok: false, message: `messageType 必须是 ${VALID_TYPES.join('/')} 之一。` },
      { status: 400 }
    );
  }

  const firstSendTime = body.firstSendTime as string;
  const t = Date.parse(firstSendTime);
  if (Number.isNaN(t)) {
    return NextResponse.json({ ok: false, message: 'firstSendTime 无法解析为时间。' }, { status: 400 });
  }
  if (t < Date.now() + 60_000) {
    return NextResponse.json(
      { ok: false, code: 'TOO_SOON', message: 'firstSendTime 至少要比现在晚 60 秒。' },
      { status: 400 }
    );
  }

  // 没有订阅就别排：建了也永远发不出去
  const sub = await getPushSubscription(USER_ID);
  if (!sub) {
    return NextResponse.json(
      { ok: false, code: 'PUSH_SUBSCRIPTION_MISSING', message: '尚未登记推送订阅，请先在设置里开启推送。' },
      { status: 409 }
    );
  }

  const payload = body.payload;
  const encryptedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});

  const { id, created } = await insertSchedule({
    userId: USER_ID,
    uuid: (body.uuid as string) ?? null,
    encryptedPayload,
    messageType,
    nextSendAt: new Date(t).toISOString(),
  });

  return NextResponse.json({ ok: true, id, created, nextSendAt: new Date(t).toISOString() });
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, message: '未配置数据库。' }, { status: 503 });
  }
  const tasks = await listSchedules(USER_ID, { limit: 100 });
  return NextResponse.json({ ok: true, tasks });
}
