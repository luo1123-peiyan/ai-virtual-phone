import { NextRequest, NextResponse } from "next/server";
import {
  getHomeIndex,
  getCategoryComics,
  search,
  getComicInfo,
  getChapterImages,
} from "@/lib/comic/copy-fetch";

// copy-fetch 依赖 Node 的 crypto（HMAC 签名），必须跑在 nodejs runtime 上。
export const runtime = "nodejs";

type CopyAction = "home" | "category" | "search" | "info" | "chapter";

type CopyRequestBody = {
  action?: CopyAction;
  payload?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  let body: CopyRequestBody;
  try {
    body = (await req.json()) as CopyRequestBody;
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
        const ordering = String(payload.ordering ?? "-datetime_updated");
        const top = String(payload.top ?? "");
        const page = Number(payload.page) || 1;
        return NextResponse.json({ data: await getCategoryComics(theme, ordering, top, page) });
      }
      case "search": {
        const keyword = String(payload.keyword ?? "");
        const qType = String(payload.qType ?? "");
        const page = Number(payload.page) || 1;
        return NextResponse.json({ data: await search(keyword, qType, page) });
      }
      case "info": {
        const id = payload.id ? String(payload.id) : "";
        if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
        return NextResponse.json({ data: await getComicInfo(id) });
      }
      case "chapter": {
        const comicId = payload.comicId ? String(payload.comicId) : "";
        const chapterId = payload.chapterId ? String(payload.chapterId) : "";
        if (!comicId || !chapterId) {
          return NextResponse.json({ error: "missing ids" }, { status: 400 });
        }
        return NextResponse.json({ data: await getChapterImages(comicId, chapterId) });
      }
      default:
        return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
