import React, { useState, useEffect } from "react";
import { Search, ChevronLeft, BookOpen, Clock, Heart } from "lucide-react";
import { useComicStore } from "@/lib/comic/store";
import type { ComicSummary, ComicDetails } from "@/lib/comic/types";

export default function ComicReaderApp() {
  const [view, setView] = useState<"home" | "search" | "detail" | "reader">("home");
  const [query, setQuery] = useState("");
  const [homeData, setHomeData] = useState<Record<string, ComicSummary[]>>({});
  const [searchResults, setSearchResults] = useState<ComicSummary[]>([]);
  const [currentComic, setCurrentComic] = useState<ComicDetails | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const { history, favorites, toggleFavorite, isFavorite, addHistory } = useComicStore();

  useEffect(() => {
    if (view === "home") {
      setLoading(true);
      fetch("/api/comic/copy", {
        method: "POST",
        body: JSON.stringify({ action: "home" }),
      })
        .then((r) => r.json())
        .then((res) => setHomeData(res.data || {}))
        .finally(() => setLoading(false));
    }
  }, [view]);

  const handleSearch = () => {
    if (!query.trim()) return;
    setLoading(true);
    fetch("/api/comic/copy", {
      method: "POST",
      body: JSON.stringify({ action: "search", payload: { keyword: query } }),
    })
      .then((r) => r.json())
      .then((res) => {
        setSearchResults(res.data?.comics || []);
        setView("search");
      })
      .finally(() => setLoading(false));
  };

  const openDetail = (id: string) => {
    setLoading(true);
    fetch("/api/comic/copy", {
      method: "POST",
      body: JSON.stringify({ action: "info", payload: { id } }),
    })
      .then((r) => r.json())
      .then((res) => {
        setCurrentComic(res.data);
        setView("detail");
      })
      .finally(() => setLoading(false));
  };

  const readChapter = (comic: ComicDetails, chapterId: string, chapterTitle: string) => {
    setLoading(true);
    fetch("/api/comic/copy", {
      method: "POST",
      body: JSON.stringify({ action: "chapter", payload: { comicId: comic.id, chapterId } }),
    })
      .then((r) => r.json())
      .then((res) => {
        setImages(res.data || []);
        addHistory(comic, chapterId, chapterTitle);
        setView("reader");
      })
      .finally(() => setLoading(false));
  };

  const renderComicGrid = (comics: ComicSummary[]) => (
    <div className="grid grid-cols-3 gap-2 p-2">
      {comics.slice(0, 9).map((c) => (
        <div key={c.id} className="flex flex-col cursor-pointer" onClick={() => openDetail(c.id)}>
          <img src={c.cover} alt={c.title} className="aspect-[3/4] object-cover rounded shadow-sm bg-black/10" />
          <span className="text-xs mt-1 line-clamp-2 leading-tight">{c.title}</span>
        </div>
      ))}
    </div>
  );

  if (view === "reader") {
    return (
      <div className="h-full w-full bg-black text-white flex flex-col overflow-hidden">
        <div className="flex-none h-12 flex items-center px-4 bg-black/80 sticky top-0 z-10">
          <button onClick={() => setView("detail")} className="p-2 -ml-2"><ChevronLeft /></button>
          <span className="font-bold flex-1 truncate ml-2">{currentComic?.title}</span>
        </div>
        <div className="flex-1 overflow-y-auto bg-black">
          {loading && <div className="p-4 text-ced-center text-white/60">加载丵...</div>}
          {images.map((img, i) => (
            <img key={i} src={img} className="w-full block" loading="lazy" />
          ))}
        </div>
      </div>
    );
  }

  if (view === "detail" && currentComic) {
    const fav = isFavorite(currentComic.id);
    const btnCls = fav ? "p-2 text-red-500" : "p-2 text-gray-400";
    return (
      <div className="h-full w-full bg-white flex flex-col overflow-hidden">
        <div className="flex-none h-12 flex items-center px-4 border-b">
          <button onClick={() => setView("home")} className="p-2 -ml-2"><ChevronLeft /></button>
          <span className="font-bold flex-1 truncate ml-2">漫画详惵</span>
          <button onClick={() => toggleFavorite(currentComic)} className={btnCls}>
            <Heart fill={fav ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex gap-4">
            <img src={currentComic.cover} className="w-24 rounded shadow" />
            <div>
              <h2 className="font-bold text-lg leading-tight">{currentComic.title}</h2>
              <p className="text-sm text-gray-500 mt-1">{currentComic.author}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {currentComic.tags.map(t => <span key={t} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{t}</span>)}
              </div>
            </div>
          </div>
          <p className="text-sm mt-4 text-gray-600 leading-relaxed">{currentComic.description}</p>
          
          <div className="mt-6">
            <h3 className="font-bold mb-3">全部章节</h3>
            <div className="grid grid-cols-2 gap-2">
              {currentComic.chapters.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => readChapter(currentComic, ch.id, ch.title)}
                  className="border p-2 text-sm rounded truncate text-left"
                >
                  {ch.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-gray-50 flex flex-col overflow-hidden">
      <div className="flex-none h-14 bg-white border-b flex items-center px-3 gap-2 sticky top-0 z-10">
        <div className="flex-1 flex items-center bg-gray-100 rounded-full px-3 py-1.5">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            className="flex-1 bg-transparent outline-none ml-2 text-sm"
            placeholder="搜索拷贝漫画..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <button onClick={() => setView("home")} className="text-sm font-medium">取消</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {view === "search" ? (
          <div>
            <div className="p-3 text-sm text-gray-500">搜索结枰 (${searchResults.length})</div>
            {renderComicGrid(searchResults)}
          </div>
        ) : (
          <div className="pb-8">
            {loading && <div className="p-4 text-center text-sm text-gray-400">正在连接拷贝漫画溔...</div>}
            
            {history.length > 0 && (
              <div className="mt-2 bg-white">
                <div className="p-3 font-bold flex items-center gap-1 border-b"><Clock className="w-4 h-4"/> 最近阅读</div>
                <div className="flex overflow-x-auto p-3 gap-3">
                  {history.slice(0, 5).map(h => (
                    <div key={h.id} className="flex-none w-20 flex flex-col cursor-pointer" onClick={() => openDetail(h.id)}>
                      <img src={h.cover} className="aspect-[3/4] object-cover rounded shadow-sm" />
                      <span className="text-xs mt-1 truncate">{h.title}</span>
                      <span className="text-[10px] text-gray-400 truncate">{h.chapterTitle}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.entries(homeData).map(([section, list]) => list.length > 0 && (
              <div key={section} className="mt-3 bg-white">
                <div className="p-3 font-bold border-b">{section}</div>
                {renderComicGrid(list)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
