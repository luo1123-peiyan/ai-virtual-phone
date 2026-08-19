import { DesktopIconId, FolderIconId } from "@/lib/desktop-config";
import { ChevronLeft } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { ComicSummary, ComicDetails, ComicChapter } from "@/lib/comic/types";

export function ComicApp({ 
  activeApp, 
  closeApp 
}: { 
  activeApp: DesktopIconId | null; 
  closeApp: () => void 
}) {
  const [view, setView] = useState<"home" | "search" | "detail" | "reader">("home");
  const [keyword, setKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<ComicSummary[]>([]);
  const [homeData, setHomeData] = useState<Record<string, ComicSummary[]>>({});
  const [currentComic, setCurrentComic] = useState<ComicDetails | null>(null);
  const [currentImages, setCurrentImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // 1. 加载首页数据
  useEffect(() => {
    if (activeApp === "reading" && view === "home" && Object.keys(homeData).length === 0) {
      setLoading(true);
      fetch("/api/comic/copy?action=home")
        .then(res => res.json())
        .then(data => {
          if (!data.error) setHomeData(data);
        })
        .finally(() => setLoading(false));
    }
  }, [activeApp, view]);

  // 2. 搜索
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    setView("search");
    try {
      const res = await fetch("/api/comic/copy?action=search&keyword=" + encodeURIComponent(keyword) + "&page=1");
      const data = await res.json();
      setSearchResults(data.comics || []);
    } finally {
      setLoading(false);
    }
  };

  // 3. 看详情
  const openDetail = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/comic/copy?action=info&id=" + id);
      const data = await res.json();
      setCurrentComic(data);
      setView("detail");
    } finally {
      setLoading(false);
    }
  };

  // 4. 看章节图片
  const openChapter = async (chapterId: string) => {
    if (!currentComic) return;
    setLoading(true);
    try {
      const res = await fetch("/api/comic/copy?action=chapter&comicId=" + currentComic.id + "&chapterId=" + chapterId);
      const data = await res.json();
      setCurrentImages(data);
      setView("reader");
    } finally {
      setLoading(false);
    }
  };

  if (activeApp !== "reading") return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#121212] text-gray-200 flex flex-col font-sans">
      {/* 顶栏 */}
      <div className="h-12 border-b border-[#2A2A2A] flex items-center px-2 shrink-0 bg-[#1A1A1A]">
        {view !== "home" ? (
          <button 
            onClick={() => view === "reader" ? setView("detail") : view === "detail" && searchResults.length ? setView("search") : setView("home")}
            className="p-2"
          >
            <ChevronLeft className="w-6 h-6 text-gray-400" />
          </button>
        ) : (
          <div className="w-10" />
        )}
        <div className="flex-1 text-center font-medium truncate px-4">
          {view === "home" ? "拷贝漫画"
           : view === "search" ? "搜索结果"
           : view === "detail" ? currentComic?.title
           : "阅读"}
        </div>
        <button onClick={closeApp} className="p-2 text-sm text-gray-400">
          关闭
        </button>
      </div>

      {/* 搜索框 (仅主页) */}
      {view === "home" && (
        <form onSubmit={handleSearch} className="p-3 bg-[#1A1A1A]">
          <input
            type="text"
            placeholder="搜索漫画 / 作者..."
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            className="w-full bg-[#2A2A2A] rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </form>
      )}

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {loading && <div className="p-8 text-center text-gray-500">加载中...</div>}

        {!loading && view === "home" && Object.entries(homeData).map(([title, comics]) => (
          <div key={title} className="mb-6">
            <div className="px-4 py-2 text-sm font-bold text-gray-400 border-b border-[#2A2A2A] mb-3">
              {title}
            </div>
            <div className="grid grid-cols-3 gap-3 px-3">
              {comics.map(c => (
                <div key={c.id} onClick={() => openDetail(c.id)} className="flex flex-col gap-1">
                  <div className="aspect-[3/4] rounded bg-[#2A2A2A] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.cover} alt={c.title} className="w-full h-full object-cover opacity-90" loading="lazy" />
                  </div>
                  <div className="text-xs line-clamp-2 leading-tight">{c.title}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {!loading && view === "search" && (
          <div className="grid grid-cols-3 gap-3 p-3">
            {searchResults.map(c => (
              <div key={c.id} onClick={() => openDetail(c.id)} className="flex flex-col gap-1">
                <div className="aspect-[3/4] rounded bg-[#2A2A2A] overflow-hidden">
                  <img src={c.cover} alt={c.title} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="text-xs line-clamp-2">{c.title}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && view === "detail" && currentComic && (
          <div className="p-4">
            <div className="flex gap-4 mb-6">
              <img src={currentComic.cover} className="w-32 rounded shadow-lg" />
              <div className="flex flex-col gap-2">
                <h1 className="text-lg font-bold">{currentComic.title}</h1>
                <div className="text-sm text-gray-400">{currentComic.author}</div>
                <div className="flex flex-wrap gap-1">
                  {currentComic.tags.slice(0,4).map(t => (
                    <span key={t} className="bg-[#2A2A2A] px-2 py-0.5 rounded text-[10px]">{t}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-300 leading-relaxed mb-8">
              {currentComic.description}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {currentComic.chapters.map(ch => (
                <button 
                  key={ch.id} 
                  onClick={() => openChapter(ch.id)}
                  className="bg-[#2A2A2A] p-2 rounded text-xs truncate active:bg-[#3A3A3A]"
                >
                  {ch.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && view === "reader" && (
          <div className="flex flex-col w-full">
            {currentImages.map((src, i) => (
              <img 
                key={i} 
                src={src} 
                className="w-full h-auto object-contain block bg-[#1A1A1A] min-h-[300px]"
                loading={i < 3 ? "eager" : "lazy"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
