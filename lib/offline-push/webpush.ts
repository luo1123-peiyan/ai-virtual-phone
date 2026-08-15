/**
 * 离线推送 · Web Push 发送封装
 * ------------------------------------------------------------
 * 用 web-push 库对 payload 做 aes128gcm 加密并投递到推送服务
 * (FCM / APNs / Mozilla autopush)。
 *
 * 依赖：需要在 package.json 里加入 "web-push"。
 *       安装：npm i web-push
 *
 * 环境变量：VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_EMAIL
 *
 * 说明：一条 push 的明文上限约 3993 字节（4096 减去 aes128gcm 固定开销），
 *       这里在发送前先量一次，超限直接抛错，避免 413。超限内容应走
 *       旁路（存 client_state，push 里只带引用键）。
 */
import webpush from 'web-push';

export const MAX_PUSH_PAYLOAD_BYTES = 3993;

let _configured = false;

function ensureConfigured(): void {
  if (_configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || 'mailto:admin@example.com';
  if (!publicKey || !privateKey) {
    throw new Error('[offline-push] 未配置 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY。');
  }
  webpush.setVapidDetails(email, publicKey, privateKey);
  _configured = true;
}

/** 量 payload 字节数（UTF-8）。 */
export function measurePayloadBytes(payload: string): number {
  return new TextEncoder().encode(payload).length;
}

export interface SendResult {
  ok: boolean;
  statusCode?: number;
  error?: string;
  gone?: boolean; // 404/410：订阅已失效，应删除
}

/**
 * 发送一条 Web Push。
 * @param subscriptionJson 订阅对象的 JSON 字符串（PushSubscription）
 * @param payload          要发送的字符串（通常是 JSON.stringify 后的 push）
 */
export async function sendWebPush(
  subscriptionJson: string,
  payload: string
): Promise<SendResult> {
  ensureConfigured();

  const bytes = measurePayloadBytes(payload);
  if (bytes > MAX_PUSH_PAYLOAD_BYTES) {
    return {
      ok: false,
      error: `PUSH_PAYLOAD_TOO_LARGE: ${bytes} > ${MAX_PUSH_PAYLOAD_BYTES}`,
    };
  }

  let subscription: webpush.PushSubscription;
  try {
    subscription = JSON.parse(subscriptionJson) as webpush.PushSubscription;
  } catch {
    return { ok: false, error: '订阅 JSON 解析失败。' };
  }

  try {
    const res = await webpush.sendNotification(subscription, payload);
    return { ok: true, statusCode: res.statusCode };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; body?: string; message?: string };
    const gone = e.statusCode === 404 || e.statusCode === 410;
    return {
      ok: false,
      statusCode: e.statusCode,
      gone,
      error: e.body || e.message || String(err),
    };
  }
}
