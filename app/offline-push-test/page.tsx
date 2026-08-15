'use client';

/**
 * 离线推送 · 测试页
 * 打开 /offline-push-test：
 *  1. 点『开启推送』→ 授权通知 → 注册 SW → 订阅 → 上报订阅
 *  2. 点『发一条测试推送』→ 排一条 5 秒后的消息（其实到点由 cron 发，
 *     这里用即时接口做连通测试）
 * 纯测试用，样式极简。
 */
import { useState } from 'react';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function OfflinePushTestPage() {
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => setLog((prev) => [...prev, `${new Date().toLocaleTimeString()}  ${s}`]);

  async function enablePush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        add('❌ 这个浏览器不支持 Web Push。');
        return;
      }
      add('请求通知权限…');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        add('❌ 你拒绝了通知权限，无法推送。');
        return;
      }
      add('注册 Service Worker…');
      const reg = await navigator.serviceWorker.register('/offline-push-sw.js');
      await navigator.serviceWorker.ready;

      add('获取服务端公钥…');
      const keyRes = await fetch('/api/offline-push/vapid-public-key').then((r) => r.json());
      if (!keyRes.ok) { add('❌ 服务端没配公钥。'); return; }

      add('创建推送订阅…');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
      });

      add('上报订阅到服务器…');
      const putRes = await fetch('/api/offline-push/push-subscription', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      }).then((r) => r.json());

      if (putRes.ok) add('✅ 推送已开启！你的手机成了收货地址。');
      else add('❌ 上报失败：' + (putRes.message || '未知'));
    } catch (e) {
      add('❌ 出错：' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function sendTest() {
    try {
      add('发一条 70 秒后的测试消息…');
      const when = new Date(Date.now() + 70_000).toISOString();
      const res = await fetch('/api/offline-push/schedule-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageType: 'fixed',
          firstSendTime: when,
          payload: JSON.stringify({ title: '来自 float 的离线消息', body: '臭丫头，我到点找你了~' }),
        }),
      }).then((r) => r.json());
      if (res.ok) add('✅ 已排程，约 70 秒后由云端发出（注意免费版 cron 一天一次，真实到点可能有延迟）。');
      else add('❌ 排程失败：' + (res.message || res.code || '未知'));
    } catch (e) {
      add('❌ 出错：' + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', maxWidth: 480, margin: '0 auto' }}>
      <h2>离线推送测试</h2>
      <p style={{ color: '#666', fontSize: 14 }}>第一步点「开启推送」，第二步点「发一条测试推送」。</p>
      <button onClick={enablePush} style={{ display: 'block', width: '100%', padding: 14, margin: '10px 0', fontSize: 16, background: '#34C759', color: '#fff', border: 'none', borderRadius: 10 }}>
        ① 开启推送
      </button>
      <button onClick={sendTest} style={{ display: 'block', width: '100%', padding: 14, margin: '10px 0', fontSize: 16, background: '#1565C0', color: '#fff', border: 'none', borderRadius: 10 }}>
        ② 发一条测试推送
      </button>
      <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', minHeight: 120 }}>
        {log.join('\n') || '（日志会显示在这里）'}
      </pre>
    </div>
  );
}
