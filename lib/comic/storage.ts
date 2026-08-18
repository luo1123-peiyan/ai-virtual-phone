import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";
import type { ComicFavorite, ComicHistoryEntry, ComicSummary } from "@/lib/comic/types";

const FAVORITES_KEY = "ai_phone_comic_favorites_v1";
const HISTORY_KEY = "ai_phone_comic_history_v1";

registerKvMigration(FAVORITES_KEY);
registerKvMigration(HISTORY_KEY);

function readArray<T>(key: string): T[] {
  const raw = kvGet(key);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function loadComicFavorites(): ComicFavorite[] {
  return readArray<ComicFavorite>(FAVORITES_KEY);
}

export function isComicFavorite(id: string): boolean {
  return loadComicFavorites().some((item) => item.id === id);
}

export function toggleComicFavorite(comic: ComicSummary): ComicFavorite[] {
  const current = loadComicFavorites();
  const exists = current.some((item) => item.id === comic.id);
  const next = exists
    ? current.filter((item) => item.id !== comic.id)
    : [{ ...comic, addedAt: Date.now() }, ...current].slice(0, 200);
  kvSet(FAVORITES_KEY, JSON.stringify(next));
  return next;
}

export function loadComicHistory(): ComicHistoryEntry[] {
  return readArray<ComicHistoryEntry>(HISTORY_KEY)
    .sort((a, b) => b.readAt - a.readAt)
    .slice(0, 100);
}

export function recordComicHistory(
  comic: ComicSummary,
  chapterId: string,
  chapterTitle: string,
): ComicHistoryEntry[] {
  const nextEntry: ComicHistoryEntry = {
    ...comic,
    chapterId,
    chapterTitle,
    readAt: Date.now(),
  };
  const next = [nextEntry, ...loadComicHistory().filter((item) => item.id !== comic.id)].slice(0, 100);
  kvSet(HISTORY_KEY, JSON.stringify(next));
  return next;
}
