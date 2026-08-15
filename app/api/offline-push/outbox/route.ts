/**
 * 离线推送 · 收件箱补收端点
 * ------------------------------------------------------------
 *  GET  /api/offline-push/outbox?since=<id>&limit=<n>
 *       拉未 ack 的收件箱条目（客户端上线/回前台时调）。
 *
 * 这是 Vercel 版补齐的关键：不弹通知的内容（思考过程、工具请求、
 * 错误、show:false 的结果）只落收件箱，客户端靠这里补拉。
 */
import { NextResponse } from 'next/server';
import { getUnackedOutbox } from '@/lib/offline-push/store';
import { isDbConfigured } from '@/lib/offline-push/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const USER_ID = 'self';

export async function GET(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, message: '未配置数据库（DATABASE_URL）。' },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get('since');
  const limitRaw = url.searchParams.get('limit');
  const sinceId = sinceRaw ? Number(sinceRaw) : 0;
  const limit = limitRaw ? Number(limitRaw) : 100;

  if (Number.isNaN(sinceId) || sinceId < 0) {
    return NextResponse.json({ ok: false, message: 'since 参数非法。' }, { status: 400 });
  }

  const { entries, cursor, hasMore } = await getUnackedOutbox(USER_ID, { sinceId, limit });

  // payload 是整条 push JSON 字符串，逐条 parse 回对象给客户端
  const parsed = entries.map((e) => {
    let push: unknown = null;
    try {
      push = JSON.parse(e.payload);
    } catch {
      push = { raw: e.payload };
    }
    return { id: e.id, messageId: e.messageId, push };
  });

  return NextResponse.json({ ok: true, entries: parsed, cursor, hasMore });
}
