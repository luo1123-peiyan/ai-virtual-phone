import { NextRequest, NextResponse } from "next/server";

// JM 图片 CDN 有防盗链 + 浏览器 CORS 限制，用服务端代理透传字节。
export const runtime = "nodejs";

const UA = "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36";

function isAllowedJmImage(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return u.protocol === "https:" && u.hostname.endsWith("jmapinodeudzn.net");
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (!url || !isAllowedJmImage(url)) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://localhost/",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "X-Requested-With": "com.example.app",
      },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `HTTP ${upstream.status}` }, { status: 502 });
    }
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/webp",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
