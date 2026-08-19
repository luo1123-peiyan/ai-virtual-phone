import { NextRequest, NextResponse } from "next/server";
import { getHomeIndex, getCategoryComics, search, getComicInfo, getChapterImages } from "@/lib/comic/copy-fetch";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { action, payload } = await req.json();

    if (action === "home") {
      const data = await getHomeIndex();
      return NextResponse.json({ success: true, data });
    }

    if (action === "category") {
      const { theme, ordering, top, page } = payload;
      const data = await getCategoryComics(theme || "", ordering || "-datetime_updated", top || "", page || 1);
      return NextResponse.json({ success: true, data });
    }

    if (action === "search") {
      const { keyword, qType, page } = payload;
      const data = await search(keyword, qType || "", page || 1);
      return NextResponse.json({ success: true, data });
    }

    if (action === "info") {
      const { id } = payload;
      const data = await getComicInfo(id);
      return NextResponse.json({ success: true, data });
    }

    if (action === "chapter") {
      const { comicId, chapterId } = payload;
      const data = await getChapterImages(comicId, chapterId);
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[Copy API] Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
