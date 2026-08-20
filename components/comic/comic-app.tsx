"use client";

import { useState } from "react";

type Props = { onClose: () => void };

type HomeData = Record<string, Array<{ id: string; title: string; cover: string }>>;

export default function ComicApp({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<HomeData>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(action: string, payload?: Record<string, string>) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/comic/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || "请求失败");
      setData(result.data || {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-gray-50">
      <header className="flex h-14 flex-none items-center gap-2 border-b bg-white px-3">
        <button type="button" onClick={onClose} className="px-2 py-1 text-gray-500" aria-label="返回桌面">返回</button>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim()) void load("search", { keyword: query.trim() });
          }}
          placeholder="搜索拷贝漫画"
          className="min-w-0 flex-1 rounded-full bg-gray-100 px-3 py-2 text-sm outline-none"
        />
        <button type="button" onClick={() => void load(query.trim() ? "search" : "home", query.trim() ? { keyword: query.trim() } : undefined)} className="px-2 py-1 text-sm">搜索</button>
      </header>
      <main className="flex-1 overflow-y-auto p-3">
        {loading && <p className="py-6 text-center text-sm text-gray-400">正在加载...</p>}
        {error && <p className="mb-3 rounded bg-red-50 p-3 text-sm text-red-600">加载失败：{error}</p>}
        {Object.entries(data).map(([section, comics]) => (
          <section key={section} className="mb-4 bg-white">
            <h2 className="border-b p-3 text-sm font-bold">{section}</h2>
            <div className="grid grid-cols-3 gap-2 p-2">
              {comics.slice(0, 9).map((comic) => (
                <article key={comic.id} className="min-w-0">
                  <img src={comic.cover} alt={comic.title} className="aspect-[3/4] w-full rounded object-cover" />
                  <p className="mt-1 line-clamp-2 text-xs">{comic.title}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
        {!loading && !error && Object.keys(data).length === 0 && <p className="py-10 text-center text-sm text-gray-400">点击搜索加载漫画</p>}
      </main>
    </div>
  );
}
