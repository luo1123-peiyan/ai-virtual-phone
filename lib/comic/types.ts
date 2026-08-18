export type ComicSummary = {
  id: string;
  title: string;
  author?: string;
  cover: string;
  tags: string[];
};

export type ComicChapter = {
  id: string;
  title: string;
  comicId: string;
  section: string;
  slot: string;
};

export type ComicDetails = ComicSummary & {
  description: string;
  updateTime?: string;
  chapters: ComicChapter[];
};

export type ComicFavorite = ComicSummary & {
  addedAt: number;
};

export type ComicHistoryEntry = ComicSummary & {
  chapterId: string;
  chapterTitle: string;
  readAt: number;
};
