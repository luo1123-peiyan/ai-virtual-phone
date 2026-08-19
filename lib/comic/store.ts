import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ComicSummary, ComicHistoryEntry, ComicFavorite } from "@/lib/comic/types";

type ComicStore = {
  history: ComicHistoryEntry[];
  favorites: ComicFavorite[];
  addHistory: (comic: ComicSummary, chapterId: string, chapterTitle: string) => void;
  toggleFavorite: (comic: ComicSummary) => void;
  isFavorite: (id: string) => boolean;
};

export const useComicStore = create<ComicStore>()(
  persist(
    (set, get) => ({
      history: [],
      favorites: [],
      addHistory: (comic, chapterId, chapterTitle) =>
        set((state) => {
          const nextEntry: ComicHistoryEntry = {
            ...comic,
            chapterId,
            chapterTitle,
            readAt: Date.now(),
          };
          const next = [
            nextEntry,
            ...state.history.filter((item) => item.id !== comic.id),
          ].slice(0, 100);
          return { history: next };
        }),
      toggleFavorite: (comic) =>
        set((state) => {
          const exists = state.favorites.some((item) => item.id === comic.id);
          if (exists) {
            return { favorites: state.favorites.filter((item) => item.id !== comic.id) };
          }
          return {
            favorites: [
              { ...comic, addedAt: Date.now() },
              ...state.favorites,
            ].slice(0, 200),
          };
        }),
      isFavorite: (id) => get().favorites.some((item) => item.id === id),
    }),
    {
      name: "ai-phone-comic-storage-v2",
    }
  )
);
