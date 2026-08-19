"use client";

import { useSyncExternalStore } from "react";
import type { ComicSummary, ComicHistoryEntry, ComicFavorite } from "@/lib/comic/types";

// 零依赖的拷贝漫画收藏/历史本地存储（不使用 zustand，直接 localStorage + useSyncExternalStore）。
const STORAGE_KEY = "ai-phone-comic-storage-v2";

type ComicState = {
  history: ComicHistoryEntry[];
  favorites: ComicFavorite[];
};

let state: ComicState = { history: [], favorites: [] };
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 忽略配额 / 序列化异常
  }
}

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ComicState>;
      state = {
        history: Array.isArray(parsed.history) ? parsed.history : [],
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      };
    }
  } catch {
    // 忽略损坏的存储
  }
}

function setState(next: ComicState): void {
  state = next;
  persist();
  emit();
}

export function addComicHistory(comic: ComicSummary, chapterId: string, chapterTitle: string): void {
  const nextEntry: ComicHistoryEntry = {
    ...comic,
    chapterId,
    chapterTitle,
    readAt: Date.now(),
  };
  const history = [
    nextEntry,
    ...state.history.filter((item) => item.id !== comic.id),
  ].slice(0, 100);
  setState({ ...state, history });
}

export function toggleComicFavorite(comic: ComicSummary): void {
  const exists = state.favorites.some((item) => item.id === comic.id);
  const favorites = exists
    ? state.favorites.filter((item) => item.id !== comic.id)
    : [{ ...comic, addedAt: Date.now() }, ...state.favorites].slice(0, 200);
  setState({ ...state, favorites });
}

function subscribe(listener: () => void): () => void {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ComicState {
  return state;
}

const SERVER_SNAPSHOT: ComicState = { history: [], favorites: [] };

function getServerSnapshot(): ComicState {
  return SERVER_SNAPSHOT;
}

export function useComicStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    history: snapshot.history,
    favorites: snapshot.favorites,
    addHistory: addComicHistory,
    toggleFavorite: toggleComicFavorite,
    isFavorite: (id: string) => snapshot.favorites.some((item) => item.id === id),
  };
}
