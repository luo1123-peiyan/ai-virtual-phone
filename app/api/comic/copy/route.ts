import { NextRequest, NextResponse } from "next/server";
import { getHomeIndex, getCategoryComics, search, getComicInfo, getChapterImages } from "@/lib/comic/copy-fetch";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action");

  try {
    switch (action) {
      case "home":
        return NextResponse.json(await getHomeIndex());
      case "category": {
        const theme = searchParams.get("theme") ?? "";
        const ordering = searchParams.get("ordering") ?? "-datetime_updated";
        const top = searchParams.get("top") ?? "";
        const page = Number(searchParams.get("page")) || 1;
        return NextResponse.json(await getCategoryComics(theme, ordering, top, page));
      }
      case "search": {
        const keyword = searchParams.get("keyword") ?? "";
        const qType = searchParams.get("qType") ?? "";
        const page = Number(searchParams.get("page")) || 1;
        return NextResponse.json(await search(keyword, qType, page));
      }
      case "info": {
        const pathWord = searchParams.get("id");
        if (!pathWord) return NextResponse.json({ error: "missing id" }, { status: 400 });
        return NextResponse.json(await getComicInfo(pathWord));
      }
      case "chapter": {
        const comicId = searchParams.get("comicId");
        const chapterId = searchParams.get("chapterId");
        if (!comicId || !chapterId) 
          return NextResponse.json({ error: "missing ids" }, { status: 400 });
        return NextResponse.json(await getChapterImages(comicId, chapterId));
      }
      default:
        return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
