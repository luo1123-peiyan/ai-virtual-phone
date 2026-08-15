/**
 * 离线推送 · Neon Postgres 连接助手
 * ------------------------------------------------------------
 * 用途：给后端 API（收件箱 / 订阅 / 调度）提供一个统一的数据库入口。
 * 说明：
 *   - Vercel 的 Neon 集成会注入多种变量名，这里按优先级挨个找：
 *     DATABASE_URL → POSTGRES_URL → DATABASE_URL_UNPOOLED → POSTGRES_URL_NON_POOLING
 *   - 采用 @neondatabase/serverless 的 HTTP 驱动，适配 Vercel Serverless/
 *     Edge 环境，无需长连接池，冷启动友好。
 *   - 本文件只提供连接与查询封装，不改动任何现有业务逻辑。
 *
 * 依赖：需要在 package.json 里加入 "@neondatabase/serverless"。
 */
import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

/** 从环境变量里挑一个可用的数据库连接串。 */
export function resolveDbUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    undefined
  );
}

/** 懒加载单例：第一次用到时才连接，避免构建期报错。 */
export function getSql() {
  if (_sql) return _sql;
  const url = resolveDbUrl();
  if (!url) {
    throw new Error(
      '[offline-push] 未找到数据库连接串（DATABASE_URL / POSTGRES_URL 等）。请在 Vercel 项目里确认 Neon 数据库已连接。'
    );
  }
  _sql = neon(url);
  return _sql;
}

/** 数据库是否已配置（供健康检查、优雅降级用）。 */
export function isDbConfigured(): boolean {
  return Boolean(resolveDbUrl());
}

/** 轻量健康检查：SELECT 1，成功返回 true。 */
export async function pingDb(): Promise<boolean> {
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
