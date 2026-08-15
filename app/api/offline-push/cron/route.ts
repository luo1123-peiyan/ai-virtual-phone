/**
 * 离线推送 · 定时投递（cron）
 * ------------------------------------------------------------
 *  GET /api/offline-push/cron
 *    由 Vercel Cron 定时触发（vercel.json 里配 schedule）。
 *    也可手动带 ?key=<CRON_SECRET> 触发一次做测试。
 *
 * 流程：
 *  1. 领取到点、未被占用的 pending 任务（乐观租约）。
 *  2. 逐条：读订阅 → 落一行收件箱 → Web Push 发送 → 成功 markSent / 失败 markFailed。
 *  3. 订阅失效(404/410)则删订阅并把任务标记失败。
 *
 * 安全：配置了 CRON_SECRET 时，非 Vercel Cron 的请求必须带正确 key。
 */
import { NextResponse } from 'next/server';
import { claimDueTasks, markSent, markFailed } from '@/lib/offline-push/schedule-store';
import { getPushSubscription, deletePushSubscription, appendOutbox, markOutboxDelivered } from '@/lib/offline-push/store';
import { sendWebPush } from '@/lib/offline-push/webpush';
import { isDbConfigured } from '@/lib/offline-push/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const USER_ID = 'self';

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 未配则不校验（Vercel Cron 内网触发）
  // Vercel Cron 会带 Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  const key = new URL(req.url).searchParams.get('key');
  return key === secret;
}

export async function GET(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, message: '未配置数据库。' }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: '未授权。' }, { status: 401 });
  }

  const tasks = await claimDueTasks({ limit: 20 });
  const results: Array<{ id: number; status: string; detail?: string }> = [];

  const sub = await getPushSubscription(USER_ID);

  for (const task of tasks) {
    // 没订阅：任务按失败处理，记原因
    if (!sub) {
      await markFailed(task.id, JSON.stringify({ reason: 'no_subscription' }));
      results.push({ id: task.id, status: 'failed', detail: 'no_subscription' });
      continue;
    }

    // payload：当前直接把 encryptedPayload 当作要发的 push 字符串
    const messageId = task.uuid || `task-${task.id}`;
    const pushPayload = task.encryptedPayload;

    try {
      // 先落收件箱（离线补收的兜底）
      await appendOutbox({
        userId: USER_ID,
        messageId,
        taskUuid: task.uuid,
        payload: pushPayload,
        createdAt: Date.now(),
      });

      const res = await sendWebPush(sub.subscription, pushPayload);
      if (res.ok) {
        await markOutboxDelivered(USER_ID, messageId);
        await markSent(task.id);
        results.push({ id: task.id, status: 'sent' });
      } else {
        if (res.gone) {
          // 订阅失效：删掉，避免反复失败
          await deletePushSubscription(USER_ID);
        }
        await markFailed(task.id, JSON.stringify({ reason: 'push_failed', error: res.error, statusCode: res.statusCode }));
        results.push({ id: task.id, status: 'failed', detail: res.error });
      }
    } catch (err) {
      await markFailed(task.id, JSON.stringify({ reason: 'exception', error: err instanceof Error ? err.message : String(err) }));
      results.push({ id: task.id, status: 'failed', detail: 'exception' });
    }
  }

  return NextResponse.json({ ok: true, claimed: tasks.length, results });
}
