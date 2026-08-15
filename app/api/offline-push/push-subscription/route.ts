/**
 * 离线推送 · 推送订阅端点
 * ------------------------------------------------------------
 *  PUT    /api/offline-push/push-subscription   登记/覆盖订阅
 *  GET    /api/offline-push/push-subscription   查询是否已登记
 *  DELETE /api/offline-push/push-subscription   停止接收推送
 *
 * 单用户场景：user_id 固定为 'self'。若日后要多用户，改成从鉴权取。
 * body 里的 subscription 应为整段订阅 JSON（当前先明文入库，
 * 后续接入加密后只改 store 上层，不动本文件的契约）。
 */
import { NextResponse } from 'next/server';
import {
  putPushSubscription,
  getPushSubscription,
  deletePushSubscription,
} from '@/lib/offline-push/store';
import { isDbConfigured } from '@/lib/offline-push/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const USER_ID = 'self';

function dbGuard() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, message: '未配置数据库（DATABASE_URL）。' },
      { status: 503 }
    );
  }
  return null;
}

export async function PUT(req: Request) {
  const guard = dbGuard();
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: '请求体不是合法 JSON。' }, { status: 400 });
  }

  const sub = (body as { subscription?: unknown })?.subscription;
  const endpoint = (sub as { endpoint?: unknown })?.endpoint;
  if (!sub || typeof endpoint !== 'string' || endpoint.length === 0) {
    return NextResponse.json(
      { ok: false, message: 'subscription 至少要有非空 endpoint。' },
      { status: 400 }
    );
  }

  await putPushSubscription({
    userId: USER_ID,
    subscription: JSON.stringify(sub),
    updatedAt: Date.now(),
  });

  return NextResponse.json({ ok: true, message: '订阅已登记。' });
}

export async function GET() {
  const guard = dbGuard();
  if (guard) return guard;

  const row = await getPushSubscription(USER_ID);
  if (!row) {
    return NextResponse.json({ ok: true, exists: false });
  }

  let endpoint: string | null = null;
  try {
    endpoint = (JSON.parse(row.subscription) as { endpoint?: string }).endpoint ?? null;
  } catch {
    endpoint = null;
  }

  return NextResponse.json({
    ok: true,
    exists: true,
    updatedAt: row.updatedAt,
    endpoint, // 只回 endpoint，不含密钥部分
  });
}

export async function DELETE() {
  const guard = dbGuard();
  if (guard) return guard;

  await deletePushSubscription(USER_ID);
  return NextResponse.json({ ok: true, message: '已停止接收推送。' });
}
