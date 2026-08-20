"use client";
import { useState, useEffect, useCallback } from "react";
import { useComicStore } from "@/lib/comic/store";

type Props = { onClose: () => void };
type Comic = { id: string; title: string; author?: string; cover: string; tags?: string[] };
type Chapter = { id: string; title: string; comicId: string; section: string; slot: string };
type Details = Comic & { description?: string; updateTime?: string; chapters: Chapter[] };
type HomeData = Record<string, Comic[]>;
type View = "home" | "search" | "explore" | "detail" | "reader";

const SOURCES: { name: string; active: boolean }[] = [
  { name: "包子漫画", active: false },
  { name: "禁漫天堂", active: false },
  { name: "拷贝漫画", active: true },
  { name: "漫画柜", active: false },
  { name: "漫画人", active: false },
  { name: "爱看漫", active: false },
  { name: "GoDa漫画", active: false },
  { name: "再漫画", active: false },
  { name: "Picacg", active: false },
  { name: "紳士漫畫", active: false },
  { name: "漫画1234", active: false },
];

function Cover({ comic, onOpen }: { comic: Comic; onOpen?: () => void }) {
  const [broken, setBroken] = useState(false);
  return (
    <button type="button" onClick={onOpen} className="block min-w-0 text-left">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-blue-100">
        {broken || !comic.cover ? (
          <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-gray-400">
            {comic.title}
          </div>
        ) : (
          <img
            src={comic.cover}
            alt={comic.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-gray-700">{comic.title}</p>
    </button>
  );
}

function ReaderImage({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken || !src) {
    return <div className="flex h-40 w-full items-center justify-center text-xs text-gray-400">图片加载失败</div>;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="block w-full"
    />
  );
}

function NavIcon({ path, active, label, onClick }: { path: string; active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={"flex flex-1 items-center justify-center py-2 " + (active ? "text-blue-600" : "text-gray-400")}
    >
      <span className={"flex h-9 w-14 items-center justify-center rounded-full " + (active ? "bg-blue-100" : "")}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={path} />
        </svg>
      </span>
    </button>
  );
}

export default function ComicApp({ onClose }: Props) {
  const { history, addHistory } = useComicStore();
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [home, setHome] = useState<HomeData>({});
  const [results, setResults] = useState<Comic[]>([]);
  const [detail, setDetail] = useState<Details | null>(null);
  const [detailComic, setDetailComic] = useState<Comic | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [chapterTitle, setChapterTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const call = useCallback(async (action: string, payload?: Record<string, string>) => {
    const response = await fetch("/api/comic/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || "请求失败");
    return result.data;
  }, []);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHome((await call("home")) || {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [call]);

  const runSearch = useCallback(async () => {
    const keyword = query.trim();
    if (!keyword) return;
    setView("search");
    setLoading(true);
    setError(null);
    try {
      const data = await call("search", { keyword });
      setResults(Array.isArray(data && data.comics) ? data.comics : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [call, query]);

  const openDetail = useCallback(
    async (comic: Comic) => {
      setDetailComic(comic);
      setDetail(null);
      setView("detail");
      setLoading(true);
      setError(null);
      try {
        const data = (await call("info", { id: comic.id })) as Details;
        setDetail(data);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    },
    [call],
  );

  const openReader = useCallback(
    async (chapter: Chapter) => {
      setPages([]);
      setChapterTitle(chapter.title);
      setView("reader");
      setLoading(true);
      setError(null);
      try {
        const data = await call("chapter", { comicId: chapter.comicId, chapterId: chapter.id });
        setPages(Array.isArray(data) ? data.filter(Boolean) : []);
        if (detailComic) addHistory(detailComic, chapter.id, chapter.title);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    },
    [call, detailComic, addHistory],
  );

  const openExplore = useCallback(() => {
    setView("explore");
    if (Object.keys(home).length === 0) void loadHome();
  }, [home, loadHome]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  function pickSource(source: { name: string; active: boolean }) {
    if (source.active) openExplore();
    else setToast(source.name + " 暂未接入，先用拷贝漫画吧");
  }

  function renderHome() {
    return (
      <div className="flex-1 overflow-y-auto pb-24 pt-6">
        <div className="flex items-center justify-between px-4 pb-1 pt-2">
          <span className="text-2xl font-bold text-gray-800">主页</span>
          <button type="button" onClick={onClose} aria-label="返回桌面" className="text-gray-500">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setView("search")}
          className="mx-4 mb-4 mt-2 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-gray-100 px-4 py-3 text-gray-400"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span className="text-base">搜索</span>
        </button>

        <section className="mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center">
            <span className="text-lg font-bold text-gray-800">历史</span>
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">{history.length}</span>
            <span className="ml-auto text-gray-300">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </span>
          </div>
          {history.length === 0 ? (
            <div className="flex gap-3">
              {[0, 1, 2].map((n) => (
                <div key={n} className="aspect-[3/4] flex-1 rounded-xl bg-blue-100" />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {history.slice(0, 12).map((comic) => (
                <div key={comic.id} className="w-24 flex-none">
                  <Cover comic={comic} onOpen={() => void openDetail(comic)} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center">
            <span className="text-lg font-bold text-gray-800">本地</span>
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">0</span>
            <span className="ml-auto text-gray-300">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              0 Tasks
            </span>
            <button type="button" onClick={() => setToast("导入功能稍后接入~")} className="rounded-full bg-blue-700 px-6 py-2 text-sm font-medium text-white">
              导入
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setToast("追更列表稍后接入~")}
          className="mx-4 mb-4 flex w-[calc(100%-2rem)] items-center rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <span className="text-lg font-bold text-gray-800">追更</span>
          <span className="ml-auto text-gray-300">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </span>
        </button>

        <section className="mx-4 mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center">
            <span className="text-lg font-bold text-gray-800">漫画源</span>
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">{SOURCES.length}</span>
            <span className="ml-auto text-gray-300">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((source) => (
              <button
                key={source.name}
                type="button"
                onClick={() => pickSource(source)}
                className={"rounded-full px-4 py-1.5 text-sm " + (source.active ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700")}
              >
                {source.name}
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderSearch() {
    return (
      <div className="flex flex-1 flex-col overflow-hidden pt-6">
        <div className="flex flex-none items-center gap-2 px-3 pb-2 pt-2">
          <button type="button" onClick={() => setView("home")} className="flex h-8 w-8 items-center justify-center text-gray-500" aria-label="返回">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div className="flex flex-1 items-center gap-2 rounded-full bg-gray-100 px-3 py-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void runSearch();
              }}
              placeholder="搜索拷贝漫画"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <button type="button" onClick={() => void runSearch()} className="flex-none px-1 text-sm text-blue-600">搜索</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading && <p className="py-6 text-center text-sm text-gray-400">正在加载...</p>}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              加载失败：{error}
              <button type="button" onClick={() => void runSearch()} className="ml-2 underline">重试</button>
            </div>
          )}
          {!loading && !error && results.length === 0 && query.trim() && (
            <p className="py-10 text-center text-sm text-gray-400">没有找到相关漫画</p>
          )}
          {!loading && !error && !query.trim() && (
            <p className="py-10 text-center text-sm text-gray-400">输入关键词搜索拷贝漫画</p>
          )}
          {results.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {results.map((comic) => (
                <Cover key={comic.id} comic={comic} onOpen={() => void openDetail(comic)} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderExplore() {
    return (
      <div className="flex flex-1 flex-col overflow-hidden pt-6">
        <div className="flex flex-none items-center gap-2 border-b px-3 pb-2 pt-2">
          <button type="button" onClick={() => setView("home")} className="flex h-8 w-8 items-center justify-center text-gray-500" aria-label="返回">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span className="text-base font-bold text-gray-800">拷贝漫画</span>
          <button type="button" onClick={() => void loadHome()} className="ml-auto text-gray-400" aria-label="刷新">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-4">
          {loading && <p className="py-6 text-center text-sm text-gray-400">正在加载...</p>}
          {error && (
            <div className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              加载失败：{error}
              <button type="button" onClick={() => void loadHome()} className="ml-2 underline">重试</button>
            </div>
          )}
          {!loading &&
            Object.entries(home).map(([section, comics]) =>
              comics.length === 0 ? null : (
                <section key={section} className="mt-2 bg-white px-3 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800">{section}</span>
                    <span className="rounded-full bg-blue-100 px-2 text-xs text-blue-600">{comics.length}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {comics.slice(0, 9).map((comic) => (
                      <Cover key={comic.id} comic={comic} onOpen={() => void openDetail(comic)} />
                    ))}
                  </div>
                </section>
              ),
            )}
          {!loading && !error && Object.keys(home).length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">暂无内容</p>
          )}
        </div>
      </div>
    );
  }

  function renderDetail() {
    const c = detail || detailComic;
    return (
      <div className="flex flex-1 flex-col overflow-hidden pt-6">
        <div className="flex flex-none items-center gap-2 border-b px-3 pb-2 pt-2">
          <button type="button" onClick={() => setView(results.length ? "search" : "explore")} className="flex h-8 w-8 items-center justify-center text-gray-500" aria-label="返回">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span className="line-clamp-1 text-base font-bold text-gray-800">{c ? c.title : "详情"}</span>
        </div>
        <div className="flex-1 overflow-y-auto pb-4">
          {c && (
            <div className="flex gap-3 p-3">
              <div className="w-28 flex-none">
                <Cover comic={c} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-gray-800">{c.title}</p>
                {c.author && <p className="mt-1 text-xs text-gray-500">{c.author}</p>}
                {detail && detail.updateTime && <p className="mt-1 text-xs text-gray-400">更新：{detail.updateTime}</p>}
                {c.tags && c.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.tags.slice(0, 6).map((tag) => (
                      <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {detail && detail.description && (
            <p className="px-3 pb-3 text-xs leading-relaxed text-gray-600">{detail.description}</p>
          )}
          {loading && <p className="py-6 text-center text-sm text-gray-400">正在加载章节...</p>}
          {error && (
            <div className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              加载失败：{error}
              <button type="button" onClick={() => detailComic && void openDetail(detailComic)} className="ml-2 underline">重试</button>
            </div>
          )}
          {detail && detail.chapters && detail.chapters.length > 0 && (
            <div className="px-3">
              <p className="mb-2 text-sm font-bold text-gray-800">章节 {detail.chapters.length}</p>
              <div className="grid grid-cols-3 gap-2">
                {detail.chapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => void openReader(chapter)}
                    className="truncate rounded-lg bg-gray-100 px-2 py-2 text-center text-xs text-gray-700 active:bg-blue-100"
                  >
                    {chapter.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderReader() {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-none items-center gap-2 border-b bg-white px-3 pb-2 pt-8">
          <button type="button" onClick={() => setView("detail")} className="flex h-8 w-8 items-center justify-center text-gray-500" aria-label="返回">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span className="line-clamp-1 text-sm font-bold text-gray-800">{chapterTitle}</span>
        </div>
        <div className="flex-1 overflow-y-auto bg-black">
          {loading && <p className="py-10 text-center text-sm text-gray-400">正在加载图片...</p>}
          {error && (
            <div className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">加载失败：{error}</div>
          )}
          {!loading && !error && pages.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">本章暂无内容</p>
          )}
          {pages.map((src, index) => (
            <ReaderImage key={index} src={src} />
          ))}
        </div>
      </div>
    );
  }

  const showNav = view === "home" || view === "explore";

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-gray-50">
      {view === "home" && renderHome()}
      {view === "search" && renderSearch()}
      {view === "explore" && renderExplore()}
      {view === "detail" && renderDetail()}
      {view === "reader" && renderReader()}

      {showNav && (
        <nav className="flex flex-none items-center border-t bg-white pb-1 pt-1">
          <NavIcon label="主页" active={view === "home"} onClick={() => setView("home")} path="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
          <NavIcon label="收藏" active={false} onClick={() => setToast("收藏页稍后接入~")} path="M4 4h13l3 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 8h16" />
          <NavIcon label="探索" active={view === "explore"} onClick={openExplore} path="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16 8l-2 6-6 2 2-6z" />
          <NavIcon label="设置" active={false} onClick={() => setToast("更多设置稍后接入~")} path="M4 20V10M4 6V4M12 20v-8M12 8V4M20 20v-4M20 12V4M1 14h6M9 10h6M17 16h6" />
        </nav>
      )}

      {toast && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-gray-800/90 px-4 py-2 text-xs text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
