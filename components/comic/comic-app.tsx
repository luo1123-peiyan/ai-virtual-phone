"use client";
import { useState, useEffect, useCallback } from "react";
import { useComicStore } from "@/lib/comic/store";

type Props = { onClose: () => void };
type Comic = { id: string; title: string; author?: string; cover: string; tags?: string[] };
type HomeData = Record<string, Comic[]>;

function Cover({ comic }: { comic: Comic }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="min-w-0">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-blue-100">
        {broken ? (
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
    </div>
  );
}

export default function ComicApp({ onClose }: Props) {
  const { history } = useComicStore();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"home" | "search">("home");
  const [home, setHome] = useState<HomeData>({});
  const [results, setResults] = useState<Comic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!keyword) {
      setMode("home");
      return;
    }
    setMode("search");
    setLoading(true);
    setError(null);
    try {
      const data = await call("search", { keyword });
      setResults(Array.isArray(data?.comics) ? data.comics : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [call, query]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-gray-50">
      <header className="flex-none border-b bg-white px-3 pb-2 pt-2">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="-ml-1 flex h-7 w-7 items-center justify-center rounded-full text-gray-500 active:bg-gray-100"
            aria-label="返回桌面"
          >
            &#8249;
          </button>
          <span className="text-base font-bold text-gray-800">漫画</span>
          <button
            type="button"
            onClick={() => void loadHome()}
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
            aria-label="刷新"
          >
            &#10227;
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5">
          <span className="text-sm text-gray-400">&#128269;</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runSearch();
            }}
            placeholder="搜索拷贝漫画"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {query.trim() && (
            <button type="button" onClick={() => void runSearch()} className="flex-none text-sm text-blue-600">
              搜索
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {loading && <p className="py-6 text-center text-sm text-gray-400">正在加载...</p>}
        {error && (
          <div className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            加载失败：{error}
            <button
              type="button"
              onClick={() => (mode === "search" ? void runSearch() : void loadHome())}
              className="ml-2 underline"
            >
              重试
            </button>
          </div>
        )}

        {mode === "search" && !loading && !error && (
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">搜索「{query.trim()}」</span>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setMode("home");
                }}
                className="text-xs text-blue-600"
              >
                返回主页
              </button>
            </div>
            {results.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">没有找到相关漫画</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {results.map((comic) => (
                  <Cover key={comic.id} comic={comic} />
                ))}
              </div>
            )}
          </div>
        )}

        {mode === "home" && !loading && (
          <div className="pb-4">
            {history.length > 0 && (
              <section className="mt-2 bg-white px-3 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-800">历史</span>
                  <span className="rounded-full bg-blue-100 px-2 text-xs text-blue-600">{history.length}</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {history.slice(0, 12).map((comic) => (
                    <div key={comic.id} className="w-24 flex-none">
                      <Cover comic={comic} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {Object.entries(home).map(([section, comics]) =>
              comics.length === 0 ? null : (
                <section key={section} className="mt-2 bg-white px-3 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800">{section}</span>
                    <span className="rounded-full bg-blue-100 px-2 text-xs text-blue-600">{comics.length}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {comics.slice(0, 9).map((comic) => (
                      <Cover key={comic.id} comic={comic} />
                    ))}
                  </div>
                </section>
              ),
            )}

            {!error && Object.keys(home).length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">暂无内容，试试搜索</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
