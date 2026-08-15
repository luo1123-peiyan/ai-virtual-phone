/**
 * 离线推送 · 健康检查接口
 * GET /api/offline-push/health
 * ------------------------------------------------------------
 * 用途：部署后第一时间确认「数据库通不通、表建没建」。
 * 不含任何敏感信息，只返回布尔状态，供你在浏览器直接打开自检。
 *
 * 安全说明：此接口只读、不接受任何用户输入，不泄露连接串。
 */
import { NextResponse } from 'next/server';
import { getSql, isDbConfigured } from '@/lib/offline-push/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REQUIRED_TABLES = [
  'scheduled_messages',
  'client_state',
  'push_subscriptions',
  'llm_credentials',
  'message_outbox',
];

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, stage: 'config', message: '未检测到 DATABASE_URL，请在 Vercel 确认已连接 Neon 数据库。' },
      { status: 200 }
    );
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(${REQUIRED_TABLES})
    `) as Array<{ table_name: string }>;

    const found = rows.map((r) => r.table_name);
    const missing = REQUIRED_TABLES.filter((t) => !found.includes(t));

    return NextResponse.json({
      ok: missing.length === 0,
      stage: missing.length === 0 ? 'ready' : 'schema',
      dbConnected: true,
      tablesFound: found,
      tablesMissing: missing,
      message:
        missing.length === 0
          ? '数据库已连接，5 张表齐全，离线推送地基就绪。'
          : `数据库已连接，但还缺表：${missing.join(', ')}。请在 Neon SQL Editor 执行 docs/offline-push/schema.postgres.sql。`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'request',
        dbConnected: false,
        message: '连接数据库失败：' + (err instanceof Error ? err.message : String(err)),
      },
      { status: 200 }
    );
  }
}
