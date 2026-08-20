"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useComicStore } from "@/lib/comic/store";

type Props = { onClose: () => void };
type Comic = { id: string; title: string; author?: string; cover: string; tags?: string[]; src?: Source };
type Chapter = { id: string; title: string; comicId: string; section: string; slot: string };
type Details = Comic & { description?: string; updateTime?: string; chapters: Chapter[] };
type HomeData = Record<string, Comic[]>;
type View = "home" | "search" | "explore" | "detail" | "reader" | "favorites" | "settings";
type ExploreTab = "recommend" | "category";
type Source = "copy" | "jm";
// 阅读页图片：num>1 表示禁漫的乱序切块数，需要 canvas 竖切倒序还原。
type PageImg = { url: string; num: number };

const SOURCES: { name: string; active: boolean }[] = [
  { name: "包子漫画", active: false },
  { name: "禁漫天堂", active: true },
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

// 拷贝漫画题材（path_word -> 中文名）。
const THEMES: { word: string; name: string }[] = [
  { word: "", name: "全部" },
  { word: "aiqing", name: "爱情" },
  { word: "huanlexiang", name: "欢乐向" },
  { word: "maoxian", name: "冒险" },
  { word: "rexue", name: "热血" },
  { word: "xuanyi", name: "悬疑" },
  { word: "kehuan", name: "科幻" },
  { word: "qihuan", name: "奇幻" },
  { word: "xuanhuan", name: "玄幻" },
  { word: "gedou", name: "格斗" },
  { word: "baihe", name: "百合" },
  { word: "hougong", name: "后宫" },
  { word: "zhiyu", name: "治愈" },
  { word: "xiaoyuan", name: "校园" },
  { word: "dushi", name: "都市" },
  { word: "kongbu", name: "恐怖" },
  { word: "meishi", name: "美食" },
  { word: "lizhi", name: "励志" },
  { word: "chuanyue", name: "穿越" },
  { word: "gaoxiao", name: "搞笑" },
];

// 拷贝漫画排序方式。
const ORDERINGS: { value: string; name: string }[] = [
  { value: "-datetime_updated", name: "最新" },
  { value: "-popular", name: "人气" },
];

// 禁漫天堂分类（c 参数 -> 中文名）。
const JM_THEMES: { word: string; name: string }[] = [
  { word: "", name: "最新" },
  { word: "doujin", name: "同人" },
  { word: "single", name: "单本" },
  { word: "short", name: "短篇" },
  { word: "another", name: "其他类" },
  { word: "hanman", name: "韩漫" },
  { word: "meiman", name: "美漫" },
  { word: "another_cosplay", name: "Cosplay" },
  { word: "3D", name: "3D" },
];

// 禁漫天堂排序（o 参数）。
const JM_ORDERINGS: { value: string; name: string }[] = [
  { value: "mr", name: "最新" },
  { value: "mv", name: "总排行" },
  { value: "mv_m", name: "月排行" },
  { value: "mv_w", name: "周排行" },
  { value: "mv_t", name: "日排行" },
  { value: "tf", name: "最多爱心" },
];

// 每个源的默认排序值 + API 端点。
const SOURCE_META: Record<Source, { name: string; endpoint: string; defaultOrdering: string }> = {
  copy: { name: "拷贝漫画", endpoint: "/api/comic/copy", defaultOrdering: "-datetime_updated" },
  jm: { name: "禁漫天堂", endpoint: "/api/comic/jm", defaultOrdering: "mr" },
};

// 阅读进度：每章记住看到第几页（纯本地）。
const PROGRESS_KEY = "ai-phone-comic-progress-v1";
function loadProgress(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
function saveProgress(chapterId: string, page: number): void {
  if (typeof window === "undefined" || !chapterId) return;
  try {
    const all = loadProgress();
    all[chapterId] = page;
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

// 阅读器 / 外观设置（纯本地）。
type ComicSettings = {
  readerMode: "scroll" | "paged"; // 卷轴 / 翻页
  readerDir: "ltr" | "rtl"; // 翻页方向：左→右 / 右→左（日漫）
  tapTurn: boolean; // 点击左右翻页
  brightness: number; // 阅读器亮度 30-100
  dark: boolean; // 深色模式
};
const DEFAULT_SETTINGS: ComicSettings = { readerMode: "scroll", readerDir: "ltr", tapTurn: true, brightness: 100, dark: false };
const SETTINGS_KEY = "ai-phone-comic-settings-v1";
function loadSettings(): ComicSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ComicSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
function persistSettings(next: ComicSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

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

function ReaderImage({ img, source }: { img: PageImg; source: Source }) {
  const [broken, setBroken] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // 禁漫图片走服务端代理（同源，canvas 可读；且带正确 UA/Referer 过防盗链）。
  const src = source === "jm" ? `/api/comic/jm/image?url=${encodeURIComponent(img.url)}` : img.url;
  const needDescramble = img.num > 1;

  useEffect(() => {
    if (!needDescramble) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const num = img.num;
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const blockSize = Math.floor(image.height / num);
      const remainder = image.height % num;
      // 乱序图是竖向分块倒序，取最后一块放最上，逐块还原。
      let y = 0;
      for (let i = num - 1; i >= 0; i--) {
        const start = i * blockSize;
        const h = blockSize + (i === num - 1 ? remainder : 0);
        ctx.drawImage(image, 0, start, image.width, h, 0, y, image.width, h);
        y += h;
      }
    };
    image.onerror = () => setBroken(true);
    image.src = src;
  }, [src, needDescramble, img.num]);

  if (broken || !img.url) {
    return <div className="flex h-40 w-full items-center justify-center text-xs text-gray-400">图片加载失败</div>;
  }
  if (needDescramble) {
    return <canvas ref={canvasRef} className="block w-full" />;
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
  const { history, favorites, addHistory, toggleFavorite, isFavorite } = useComicStore();
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [home, setHome] = useState<HomeData>({});
  const [results, setResults] = useState<Comic[]>([]);
  const [detail, setDetail] = useState<Details | null>(null);
  const [detailComic, setDetailComic] = useState<Comic | null>(null);
  const [detailFrom, setDetailFrom] = useState<View>("explore");
  const [pages, setPages] = useState<PageImg[]>([]);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [curPage, setCurPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef(0);

  // 当前漫画源。
  const [source, setSource] = useState<Source>("copy");

  // 探索页：推荐 / 分类
  const [exploreTab, setExploreTab] = useState<ExploreTab>("recommend");
  const [theme, setTheme] = useState("");
  const [ordering, setOrdering] = useState("-datetime_updated");
  const [catComics, setCatComics] = useState<Comic[]>([]);
  const [catPage, setCatPage] = useState(1);
  const [catTotal, setCatTotal] = useState(0);
  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  // 聚合搜索：勾选后同时搜所有已接入源，结果按源分组。
  const [aggregate, setAggregate] = useState(false);
  const [settings, setSettings] = useState<ComicSettings>(DEFAULT_SETTINGS);
  const [showSearchSource, setShowSearchSource] = useState(false);

  const call = useCallback(
    async (action: string, payload?: Record<string, string>) => {
      const response = await fetch(SOURCE_META[source].endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || "请求失败");
      return result.data;
    },
    [source],
  );

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

  const loadCategory = useCallback(
    async (nextTheme: string, nextOrdering: string, page: number, append: boolean) => {
      setCatLoading(true);
      setCatError(null);
      try {
        const data = await call("category", { theme: nextTheme, ordering: nextOrdering, page: String(page) });
        const list: Comic[] = Array.isArray(data && data.comics) ? data.comics : [];
        setCatComics((prev) => (append ? [...prev, ...list] : list));
        setCatTotal(typeof (data && data.total) === "number" ? data.total : 0);
        setCatPage(page);
      } catch (cause) {
        setCatError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setCatLoading(false);
      }
    },
    [call],
  );

  function selectTheme(nextTheme: string) {
    setTheme(nextTheme);
    void loadCategory(nextTheme, ordering, 1, false);
  }
  function selectOrdering(nextOrdering: string) {
    setOrdering(nextOrdering);
    void loadCategory(theme, nextOrdering, 1, false);
  }

  // 向指定源发一次请求（聚合搜索用，不依赖当前 source）。
  async function callSource(src: Source, action: string, payload?: Record<string, string>) {
    const response = await fetch(SOURCE_META[src].endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || "请求失败");
    return result.data;
  }

  const runSearch = useCallback(async () => {
    const keyword = query.trim();
    if (!keyword) return;
    setView("search");
    setLoading(true);
    setError(null);
    try {
      if (aggregate) {
        // 聚合搜索：并发问所有已接入源，任一失败不影响其他源。
        const activeSrcs: Source[] = ["copy", "jm"];
        const settled = await Promise.allSettled(
          activeSrcs.map((s) => callSource(s, "search", { keyword })),
        );
        const merged: Comic[] = [];
        settled.forEach((r, i) => {
          if (r.status === "fulfilled") {
            const list: Comic[] = Array.isArray(r.value && r.value.comics) ? r.value.comics : [];
            list.forEach((c) => merged.push({ ...c, src: activeSrcs[i] }));
          }
        });
        setResults(merged);
        if (merged.length === 0) setError("所有源都没搜到，换个关键词试试");
      } else {
        const data = await call("search", { keyword });
        const list: Comic[] = Array.isArray(data && data.comics) ? data.comics : [];
        setResults(list.map((c) => ({ ...c, src: source })));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [call, query, aggregate, source]);

  const openDetail = useCallback(
    async (comic: Comic, from: View) => {
      // 聚合搜索的结果可能来自别的源，点开时先切到该漫画所属源，保证详情/章节/图片走对端点。
      if (comic.src && comic.src !== source) setSource(comic.src);
      const useSrc: Source = comic.src || source;
      setDetailComic(comic);
      setDetailFrom(from);
      setDetail(null);
      setView("detail");
      setLoading(true);
      setError(null);
      try {
        const data = (await callSource(useSrc, "info", { id: comic.id })) as Details;
        setDetail(data);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    },
    [call, source],
  );

  const openReader = useCallback(
    async (target: Chapter) => {
      setPages([]);
      setChapter(target);
      setCurPage(0);
      restoreTo.current = loadProgress()[target.id] || 0;
      setView("reader");
      setLoading(true);
      setError(null);
      try {
        const data = await call("chapter", { comicId: target.comicId, chapterId: target.id });
        let normalized: PageImg[] = [];
        if (Array.isArray(data)) {
          if (source === "jm") {
            normalized = data.filter((x: any) => x && x.url).map((x: any) => ({ url: String(x.url), num: Number(x.num) || 0 }));
          } else {
            normalized = data.filter(Boolean).map((u: string) => ({ url: u, num: 0 }));
          }
        }
        setPages(normalized);
        if (detailComic) addHistory(detailComic, target.id, target.title);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    },
    [call, detailComic, addHistory],
  );

  // 翻页模式换页：到本章边界时自动翻到上/下一章。
  function turnPage(dir: number) {
    setCurPage((prev) => {
      const next = prev + dir;
      if (next < 0) {
        gotoChapter(-1);
        return prev;
      }
      if (next >= pages.length) {
        gotoChapter(1);
        return prev;
      }
      if (chapter) saveProgress(chapter.id, next);
      return next;
    });
  }

  function gotoChapter(offset: number) {
    if (!detail || !chapter) return;
    const idx = detail.chapters.findIndex((item) => item.id === chapter.id);
    const next = detail.chapters[idx + offset];
    if (next) void openReader(next);
    else setToast(offset > 0 ? "已经是最后一章" : "已经是第一章");
  }

  useEffect(() => {
    if (view !== "reader" || loading || pages.length === 0) return;
    const container = scrollRef.current;
    if (!container) return;
    const target = restoreTo.current;
    if (target > 0 && target < pages.length) {
      const timer = setTimeout(() => {
        const child = container.children[target] as HTMLElement | undefined;
        if (child) container.scrollTop = child.offsetTop;
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [view, loading, pages.length]);

  function onReaderScroll() {
    const container = scrollRef.current;
    if (!container || pages.length === 0) return;
    const mid = container.scrollTop + container.clientHeight / 2;
    let index = 0;
    for (let i = 0; i < container.children.length; i++) {
      const child = container.children[i] as HTMLElement;
      if (child.offsetTop <= mid) index = i;
      else break;
    }
    if (index !== curPage) {
      setCurPage(index);
      if (chapter) saveProgress(chapter.id, index);
    }
  }

  const openExplore = useCallback(() => {
    setView("explore");
  }, []);

  // 进入探索页（或切源后）自动拉当前源的推荐首页。
  useEffect(() => {
    if (view !== "explore" || exploreTab !== "recommend") return;
    if (Object.keys(home).length === 0 && !loading) void loadHome();
  }, [view, exploreTab, source, home, loading, loadHome]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  // 挂载时读取本地设置。
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function updateSettings(patch: Partial<ComicSettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      persistSettings(next);
      return next;
    });
  }

  function pickSource(item: { name: string; active: boolean }) {
    if (!item.active) {
      setToast(item.name + " 暂未接入，先用拷贝漫画或禁漫天堂吧");
      return;
    }
    const next: Source = item.name === "禁漫天堂" ? "jm" : "copy";
    if (next !== source) {
      // 切源：清空旧源数据，重置分类筛选到新源默认值。
      setSource(next);
      setHome({});
      setResults([]);
      setCatComics([]);
      setCatTotal(0);
      setCatError(null);
      setError(null);
      setTheme("");
      setOrdering(SOURCE_META[next].defaultOrdering);
      setExploreTab("recommend");
    }
    setView("explore");
  }

  function handleFavorite() {
    if (!detailComic) return;
    const wasFav = isFavorite(detailComic.id);
    toggleFavorite(detailComic);
    setToast(wasFav ? "已取消收藏" : "已加入收藏");
  }

  function switchExploreTab(tab: ExploreTab) {
    setExploreTab(tab);
    if (tab === "category" && catComics.length === 0 && !catLoading) {
      void loadCategory(theme, ordering, 1, false);
    }
  }

  function renderHome() {
    return (
      <div className="flex-1 overflow-y-auto pb-24 pt-12">
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
                  <Cover comic={comic} onOpen={() => void openDetail(comic, "home")} />
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
          onClick={() => setView("favorites")}
          className="mx-4 mb-4 flex w-[calc(100%-2rem)] items-center rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
        >
          <span className="text-lg font-bold text-gray-800">追更</span>
          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">{favorites.length}</span>
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

  function renderFavorites() {
    return (
      <div className="flex flex-1 flex-col overflow-hidden pt-1">
        <div className="flex flex-none items-center gap-2 border-b px-4 pb-2 pt-2">
          <span className="text-xl font-bold text-gray-800">收藏</span>
          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">{favorites.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {favorites.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-400">还没有收藏，去详情页点❤收藏吧</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {favorites.map((comic) => (
                <Cover key={comic.id} comic={comic} onOpen={() => void openDetail(comic, "favorites")} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderSearch() {
    return (
      <div className="flex flex-1 flex-col overflow-hidden pt-10">
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
        <div className="flex-none border-b px-3 pb-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600">搜索于</span>
            {aggregate && <span className="text-[10px] text-gray-400">（聚合模式下将搜索所有已接入源）</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => {
              const isActive = s.active;
              const picked = !aggregate && ((s.name === "禁漫天堂" && source === "jm") || (s.name === "拷贝漫画" && source === "copy"));
              return (
                <button
                  key={s.name}
                  type="button"
                  disabled={aggregate}
                  onClick={() => {
                    if (!isActive) { setToast(s.name + " 暂未接入~"); return; }
                    setSource(s.name === "禁漫天堂" ? "jm" : "copy");
                  }}
                  className={
                    "rounded-lg border px-3 py-1.5 text-xs " +
                    (picked ? "border-blue-500 bg-blue-50 text-blue-600" : isActive ? "border-gray-200 text-gray-600" : "border-gray-100 text-gray-300") +
                    (aggregate ? " opacity-40" : "")
                  }
                >
                  {s.name}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setAggregate((v) => !v)} className="mt-3 flex items-center gap-2">
            <span className={"flex h-5 w-5 items-center justify-center rounded border " + (aggregate ? "border-blue-500 bg-blue-500 text-white" : "border-gray-300 text-transparent")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-11" /></svg>
            </span>
            <span className="text-sm text-gray-700">聚合搜索</span>
          </button>
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
                <div key={(comic.src || "") + comic.id} className="relative">
                  {aggregate && comic.src && (
                    <span className="absolute left-1 top-1 z-10 rounded bg-black/60 px-1 text-[9px] text-white">
                      {SOURCE_META[comic.src].name}
                    </span>
                  )}
                  <Cover comic={comic} onOpen={() => void openDetail(comic, "search")} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderExplore() {
    const canLoadMore = catComics.length < catTotal;
    return (
      <div className="flex flex-1 flex-col overflow-hidden pt-6">
        <div className="flex flex-none items-center gap-2 border-b px-3 pb-2 pt-2">
          <button type="button" onClick={() => setView("home")} className="flex h-8 w-8 items-center justify-center text-gray-500" aria-label="返回">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span className="text-base font-bold text-gray-800">{SOURCE_META[source].name}</span>
          <button
            type="button"
            onClick={() => (exploreTab === "recommend" ? void loadHome() : void loadCategory(theme, ordering, 1, false))}
            className="ml-auto text-gray-400"
            aria-label="刷新"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
          </button>
        </div>

        {/* 推荐 / 分类 切换 */}
        <div className="flex flex-none gap-6 border-b px-4 pt-2">
          <button
            type="button"
            onClick={() => switchExploreTab("recommend")}
            className={"pb-2 text-sm font-bold " + (exploreTab === "recommend" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-400")}
          >
            推荐
          </button>
          <button
            type="button"
            onClick={() => switchExploreTab("category")}
            className={"pb-2 text-sm font-bold " + (exploreTab === "category" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-400")}
          >
            分类
          </button>
        </div>
        {exploreTab === "recommend" ? (
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
                        <Cover key={comic.id} comic={comic} onOpen={() => void openDetail(comic, "explore")} />
                      ))}
                    </div>
                  </section>
                ),
              )}
            {!loading && !error && Object.keys(home).length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">暂无内容</p>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* 排序（按源切换选项） */}
            <div className="flex flex-none gap-2 overflow-x-auto px-3 pt-2">
              {(source === "jm" ? JM_ORDERINGS : ORDERINGS).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => selectOrdering(o.value)}
                  className={"flex-none rounded-full px-3 py-1 text-xs " + (ordering === o.value ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600")}
                >
                  {o.name}
                </button>
              ))}
            </div>
            {/* 题材（按源切换选项） */}
            <div className="flex flex-none flex-wrap gap-1.5 px-3 py-2">
              {(source === "jm" ? JM_THEMES : THEMES).map((t) => (
                <button
                  key={t.word || "all"}
                  type="button"
                  onClick={() => selectTheme(t.word)}
                  className={"rounded-full px-3 py-1 text-xs " + (theme === t.word ? "bg-blue-100 font-bold text-blue-700" : "bg-gray-50 text-gray-500")}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {catError && (
                <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  加载失败：{catError}
                  <button type="button" onClick={() => void loadCategory(theme, ordering, 1, false)} className="ml-2 underline">重试</button>
                </div>
              )}
              {catComics.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {catComics.map((comic) => (
                    <Cover key={comic.id} comic={comic} onOpen={() => void openDetail(comic, "explore")} />
                  ))}
                </div>
              )}
              {catLoading && <p className="py-6 text-center text-sm text-gray-400">正在加载...</p>}
              {!catLoading && !catError && catComics.length === 0 && (
                <p className="py-10 text-center text-sm text-gray-400">该分类暂无内容</p>
              )}
              {!catLoading && canLoadMore && (
                <button
                  type="button"
                  onClick={() => void loadCategory(theme, ordering, catPage + 1, true)}
                  className="mx-auto mt-4 block rounded-full bg-gray-100 px-6 py-2 text-sm text-gray-600"
                >
                  加载更多（{catComics.length}/{catTotal}）
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderDetail() {
    const c = detail || detailComic;
    const faved = detailComic ? isFavorite(detailComic.id) : false;
    return (
      <div className="flex flex-1 flex-col overflow-hidden pt-6">
        <div className="flex flex-none items-center gap-2 border-b px-3 pb-2 pt-2">
          <button type="button" onClick={() => setView(detailFrom)} className="flex h-8 w-8 items-center justify-center text-gray-500" aria-label="返回">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span className="line-clamp-1 flex-1 text-base font-bold text-gray-800">{c ? c.title : "详情"}</span>
          <button
            type="button"
            onClick={handleFavorite}
            aria-label="收藏"
            className={"flex h-8 w-8 items-center justify-center " + (faved ? "text-red-500" : "text-gray-400")}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill={faved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
            </svg>
          </button>
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
                <button
                  type="button"
                  onClick={handleFavorite}
                  className={"mt-3 rounded-full px-4 py-1.5 text-xs font-medium " + (faved ? "bg-red-50 text-red-500" : "bg-blue-600 text-white")}
                >
                  {faved ? "已收藏 ♥" : "＋ 收藏"}
                </button>
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
              <button type="button" onClick={() => detailComic && void openDetail(detailComic, detailFrom)} className="ml-2 underline">重试</button>
            </div>
          )}
          {detail && detail.chapters && detail.chapters.length > 0 && (
            <div className="px-3">
              <p className="mb-2 text-sm font-bold text-gray-800">章节 {detail.chapters.length}</p>
              <div className="grid grid-cols-3 gap-2">
                {detail.chapters.map((item) => {
                  const read = typeof window !== "undefined" && loadProgress()[item.id] !== undefined;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void openReader(item)}
                      className={"truncate rounded-lg px-2 py-2 text-center text-xs active:bg-blue-100 " + (read ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-700")}
                    >
                      {item.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderSettings() {
    const SwitchRow = ({ label, desc, on, onToggle }: { label: string; desc?: string; on: boolean; onToggle: () => void }) => (
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm text-gray-800">{label}</p>
          {desc && <p className="mt-0.5 text-xs text-gray-400">{desc}</p>}
        </div>
        <span className={"relative h-6 w-11 flex-none rounded-full transition-colors " + (on ? "bg-blue-500" : "bg-gray-300")}>
          <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all " + (on ? "left-[22px]" : "left-0.5")} />
        </span>
      </button>
    );
    const Seg = ({ label, options, value, onPick }: { label: string; options: { v: string; t: string }[]; value: string; onPick: (v: string) => void }) => (
      <div className="px-4 py-3">
        <p className="mb-2 text-sm text-gray-800">{label}</p>
        <div className="flex gap-2">
          {options.map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => onPick(o.v)}
              className={"flex-1 rounded-lg py-2 text-xs " + (value === o.v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600")}
            >
              {o.t}
            </button>
          ))}
        </div>
      </div>
    );
    return (
      <div className="flex flex-1 flex-col overflow-hidden pt-1">
        <div className="flex flex-none items-center gap-2 border-b px-3 pb-2 pt-2">
          <button type="button" onClick={() => setView("home")} className="flex h-8 w-8 items-center justify-center text-gray-500" aria-label="返回">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span className="text-xl font-bold text-gray-800">设置</span>
        </div>
        <div className="flex-1 overflow-y-auto pb-8">
          <p className="px-4 pb-1 pt-4 text-xs font-bold text-gray-400">阅读中</p>
          <div className="divide-y bg-white">
            <Seg
              label="阅读模式"
              options={[{ v: "scroll", t: "卷轴（竖滑）" }, { v: "paged", t: "翻页（单页）" }]}
              value={settings.readerMode}
              onPick={(v) => updateSettings({ readerMode: v as ComicSettings["readerMode"] })}
            />
            <Seg
              label="翻页方向"
              options={[{ v: "ltr", t: "从左到右" }, { v: "rtl", t: "从右到左（日漫）" }]}
              value={settings.readerDir}
              onPick={(v) => updateSettings({ readerDir: v as ComicSettings["readerDir"] })}
            />
            <SwitchRow label="点击左右翻页" desc="翻页模式下点屏幕左右侧切页" on={settings.tapTurn} onToggle={() => updateSettings({ tapTurn: !settings.tapTurn })} />
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between text-sm text-gray-800">
                <span>阅读器亮度</span>
                <span className="text-xs text-gray-400">{settings.brightness}%</span>
              </div>
              <input
                type="range"
                min={30}
                max={100}
                value={settings.brightness}
                onChange={(e) => updateSettings({ brightness: Number(e.target.value) })}
                className="w-full accent-blue-500"
              />
            </div>
          </div>
          <p className="px-4 pb-1 pt-4 text-xs font-bold text-gray-400">外观</p>
          <div className="divide-y bg-white">
            <SwitchRow label="深色模式" desc="整个漫画应用切换深色背景" on={settings.dark} onToggle={() => updateSettings({ dark: !settings.dark })} />
          </div>
          <p className="px-4 pb-1 pt-4 text-xs font-bold text-gray-400">漫画源</p>
          <div className="bg-white px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((s) => (
                <span key={s.name} className={"rounded-full px-3 py-1 text-xs " + (s.active ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400")}>
                  {s.name}{s.active ? " ✓" : ""}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">✓ 为已接入源，其余正在逐个接入中</p>
          </div>
        </div>
      </div>
    );
  }

  function renderReader() {
    const idx = detail && chapter ? detail.chapters.findIndex((item) => item.id === chapter.id) : -1;
    const hasPrev = idx > 0;
    const hasNext = detail ? idx >= 0 && idx < detail.chapters.length - 1 : false;
    const total = pages.length;
    const percent = total > 0 ? Math.min(100, Math.round(((curPage + 1) / total) * 100)) : 0;
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-none bg-white pt-8">
          <div className="flex items-center gap-2 px-3 pb-1">
            <button type="button" onClick={() => setView("detail")} className="flex h-8 w-8 items-center justify-center text-gray-500" aria-label="返回">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <span className="line-clamp-1 flex-1 text-sm font-bold text-gray-800">{chapter ? chapter.title : ""}</span>
            <span className="flex-none text-xs text-gray-400">{total > 0 ? curPage + 1 + " / " + total : ""}</span>
          </div>
          <div className="h-0.5 w-full bg-gray-100">
            <div className="h-full bg-blue-500 transition-all" style={{ width: percent + "%" }} />
          </div>
        </div>
        {settings.readerMode === "paged" && !loading && !error && pages.length > 0 ? (
          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden bg-black"
            style={{ filter: settings.brightness < 100 ? `brightness(${settings.brightness}%)` : undefined }}
          >
            <ReaderImage key={curPage} img={pages[curPage]} source={source} />
            {settings.tapTurn && (
              <>
                <button type="button" aria-label="上一页" onClick={() => turnPage(settings.readerDir === "rtl" ? 1 : -1)} className="absolute left-0 top-0 h-full w-1/3" />
                <button type="button" aria-label="下一页" onClick={() => turnPage(settings.readerDir === "rtl" ? -1 : 1)} className="absolute right-0 top-0 h-full w-1/3" />
              </>
            )}
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={onReaderScroll}
            className="flex-1 overflow-y-auto bg-black"
            style={{ filter: settings.brightness < 100 ? `brightness(${settings.brightness}%)` : undefined }}
          >
            {loading && <p className="py-10 text-center text-sm text-gray-400">正在加载图片...</p>}
            {error && (
              <div className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">加载失败：{error}</div>
            )}
            {!loading && !error && pages.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-400">本章暂无内容</p>
            )}
            {pages.map((p, index) => (
              <ReaderImage key={index} img={p} source={source} />
            ))}
            {!loading && pages.length > 0 && (
              <div className="flex items-center justify-between gap-3 bg-white p-4">
                <button
                  type="button"
                  onClick={() => gotoChapter(-1)}
                  disabled={!hasPrev}
                  className={"flex-1 rounded-full py-2 text-sm font-medium " + (hasPrev ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-300")}
                >
                  上一章
                </button>
                <button
                  type="button"
                  onClick={() => gotoChapter(1)}
                  disabled={!hasNext}
                  className={"flex-1 rounded-full py-2 text-sm font-medium " + (hasNext ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-300")}
                >
                  下一章
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const showNav = view === "home" || view === "explore" || view === "favorites";

  return (
    <div className={"absolute inset-0 flex flex-col overflow-hidden " + (settings.dark ? "bg-neutral-900 text-gray-100" : "bg-gray-50")}>
      {view === "home" && renderHome()}
      {view === "search" && renderSearch()}
      {view === "explore" && renderExplore()}
      {view === "detail" && renderDetail()}
      {view === "reader" && renderReader()}
      {view === "favorites" && renderFavorites()}
      {view === "settings" && renderSettings()}

      {showNav && (
        <nav className="flex flex-none items-center border-t bg-white pb-1 pt-1">
          <NavIcon label="主页" active={view === "home"} onClick={() => setView("home")} path="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
          <NavIcon label="收藏" active={view === "favorites"} onClick={() => setView("favorites")} path="M4 4h13l3 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 8h16" />
          <NavIcon label="探索" active={view === "explore"} onClick={openExplore} path="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16 8l-2 6-6 2 2-6z" />
          <NavIcon label="设置" active={view === "settings"} onClick={() => setView("settings")} path="M4 20V10M4 6V4M12 20v-8M12 8V4M20 20v-4M20 12V4M1 14h6M9 10h6M17 16h6" />
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
