import { NextRequest, NextResponse } from "next/server";
import {
  getHomeIndex,
  getCategoryComics,
  search,
  getComicInfo,
  getChapterImages,
} from "@/lib/comic/jm-fetch";

// jm-fetch 依赖 Node 的 crypto（AES/MD5），必须跑在 nodejs runtime 上。
export const runtime = "nodejs";

type JmAction = "home" | "category" | "search" | "info" | "chapter";

type JmRequestBody = {
  action?: JmAction;
  payload?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  let body: JmRequestBody;
  try {
    body = (await req.json()) as JmRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  const payload = body.payload ?? {};

  try {
    switch (action) {
      case "home":
        return NextResponse.json({ data: await getHomeIndex() });
      case "category": {
        const theme = String(payload.theme ?? "");
        const ordering = String(payload.ordering ?? "mr");
        const page = Number(payload.page) || 1;
        return NextResponse.json({ data: await getCategoryComics(theme, ordering, page) });
      }
      case "search": {
        const keyword = String(payload.keyword ?? "");
        const ordering = String(payload.ordering ?? "mr");
        const page = Number(payload.page) || 1;
        return NextResponse.json({ data: await search(keyword, ordering, page) });
      }
      case "info": {
        const id = payload.id ? String(payload.id) : "";
        if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
        return NextResponse.json({ data: await getComicInfo(id) });
      }
      case "chapter": {
        const chapterId = payload.chapterId ? String(payload.chapterId) : "";
        if (!chapterId) return NextResponse.json({ error: "missing chapterId" }, { status: 400 });
        return NextResponse.json({ data: await getChapterImages(chapterId) });
      }
      default:
        return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
