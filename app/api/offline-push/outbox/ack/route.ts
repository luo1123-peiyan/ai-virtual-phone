/**
 * 离线推送 · 收件箱销账端点
 * POST /api/offline-push/outbox/ack
 * body: { messageIds: string[] }
 * ------------------------------------------------------------
 * 客户端把补收到的条目落库成功后，调这个把它们标记为已确认，
 * 下次 /outbox 就不再返回。
 */
import { NextResponse } from 'next/server';
import { ackOutbox } from '@/lib/offline-push/store';
import { isDbConfigured } from '@/lib/offline-push/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const USER_ID = 'self';

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, message: '未配置数据库（DATABASE_URL）。' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: '请求体不是合法 JSON。' }, { status: 400 });
  }

  const ids = (body as { messageIds?: unknown })?.messageIds;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) {
    return NextResponse.json(
      { ok: false, message: 'messageIds 必须是字符串数组。' },
      { status: 400 }
    );
  }

  const acked = await ackOutbox(USER_ID, ids as string[]);
  return NextResponse.json({ ok: true, acked });
}
