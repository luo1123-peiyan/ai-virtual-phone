const ORIGINS = [
  "https://cn.bzmgcn.com",
  "https://cn.baozimhcn.com",
  "https://cn.webmota.com",
  "https://cn.kukuc.co",
  "https://cn.twmanga.com",
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
  "Accept-Language": "zh-CN,zh;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/json",
};

export async function fetchWithTimeout(url: string, timeoutMs = 20_000, referer?: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { ...HEADERS, ...(referer ? { Referer: referer } : {}) },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchBaozi(path: string): Promise<string> {
  let lastError = "包子漫画暂时无法连接";
  for (const origin of ORIGINS) {
    try {
      const response = await fetchWithTimeout(`${origin}${path}`, 20_000, `${origin}/`);
      if (!response.ok) {
        lastError = `${origin} 返回 HTTP ${response.status}`;
        continue;
      }
      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
}

export function isAllowedBaoziImage(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && ["baozimh.com", "baozicdn.com", "bzcdn.net", "bzmgcn.com"]
      .some((domain) => host.endsWith(domain));
  } catch {
    return false;
  }
}

export const baoziReferer = ORIGINS[0];
