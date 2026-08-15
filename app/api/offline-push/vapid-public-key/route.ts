/**
 * 离线推送 · VAPID 公钥端点
 * GET /api/offline-push/vapid-public-key
 * ------------------------------------------------------------
 * 返回本服务的 VAPID 公钥，供前端创建 Web Push 订阅时作 applicationServerKey。
 * 未配置 VAPID 时返回 503（与官方 amsg-server 行为一致）。
 *
 * 环境变量：VAPID_PUBLIC_KEY（在 Vercel 项目环境变量里配置）。
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json(
      { ok: false, message: '服务端未配置 VAPID_PUBLIC_KEY，无法提供推送公钥。' },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true, publicKey: key });
}
