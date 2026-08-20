import crypto from "crypto";
import type { ComicChapter, ComicDetails, ComicSummary } from "@/lib/comic/types";

// 拷贝漫画 API 签名密钥（来自 venera 官方源 copy_manga.js，base64 编码）。
const SECRET_B64 = "M2FmMDg1OTAzMTEwMzJlZmUwNjYwNTUwYTA1NjNhNTM=";
export const COPY_DEFAULT_API = "api.copy2000.online";
const IMAGE_QUALITY = "1500";
// region "0" = 海外线路。
const REGION = "0";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateDeviceInfo(): string {
  return randomInt(1000000, 9999999) + "V-" + randomInt(1000, 9999);
}

function generateDevice(): string {
  const randCharA = () => String.fromCharCode(65 + randomInt(0, 25));
  const randDigit = () => String.fromCharCode(48 + randomInt(0, 9));
  return (
    randCharA() + randCharA() + randDigit() + randCharA() + "." +
    randDigit() + randDigit() + randDigit() + randDigit() + randDigit() + randDigit() + "." +
    randDigit() + randDigit() + randDigit()
  );
}

function generatePseudoid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let pseudoid = "";
  for (let i = 0; i < 16; i++) {
    pseudoid += chars.charAt(randomInt(0, chars.length - 1));
  }
  return pseudoid;
}

const DEVICE_INFO = generateDeviceInfo();
const DEVICE = generateDevice();
const PSEUDOID = generatePseudoid();

function buildHeaders(token?: string): Record<string, string> {
  const now = new Date();
  const dt = now.getFullYear() + "." + pad(now.getMonth() + 1) + "." + pad(now.getDate());
  const ts = Math.floor(now.getTime() / 1000).toString();
  const sig = crypto
    .createHmac("sha256", Buffer.from(SECRET_B64, "base64"))
    .update(ts, "utf8")
    .digest("hex");

  return {
    "User-Agent": "COPY/3.0.6",
    source: "copyApp",
    deviceinfo: DEVICE_INFO,
    dt,
    platform: "3",
    referer: "com.copymanga.app-3.0.6",
    version: "3.0.6",
    device: DEVICE,
    pseudoid: PSEUDOID,
    Accept: "application/json",
    region: REGION,
    authorization: token ? "Token " + token : "Token",
    umstring: "b4c89ca4104ea9a97750314d791520ac",
    "x-auth-timestamp": ts,
    "x-auth-signature": sig,
  };
}

let cachedApiHost: string | null = null;
let cachedAt = 0;

async function getApiHost(): Promise<string> {
  const now = Date.now();
  if (cachedApiHost && now - cachedAt < 30 * 60 * 1000) return cachedApiHost;
  try {
    const res = await fetch(
      "https://api.copy-manga.com/api/v3/system/network2?platform=3",
      { headers: buildHeaders(), cache: "no-store" },
    );
    if (res.ok) {
      const data = await res.json();
      const host = data?.results?.api?.[0]?.[0];
      if (host) {
        cachedApiHost = host;
        cachedAt = now;
        return host;
      }
    }
  } catch {
    // ignore
  }
  cachedApiHost = COPY_DEFAULT_API;
  cachedAt = now;
  return COPY_DEFAULT_API;
}

async function copyFetchJson(path: string, token?: string): Promise<any> {
  const host = await getApiHost();
  const res = await fetch("https://" + host + path, {
    headers: buildHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("拷贝漫画返回 HTTP " + res.status);
  }
  return res.json();
}

function parseSummary(item: any): ComicSummary {
  const comic = item && item.comic ? item.comic : item;
  const tags = Array.isArray(comic.theme) ? comic.theme.map((t: any) => t.name) : [];
  const author =
    Array.isArray(comic.author) && comic.author.length > 0 ? comic.author[0].name : undefined;
  return {
    id: comic.path_word,
    title: comic.name,
    author,
    cover: comic.cover,
    tags,
  };
}

export async function getHomeIndex(): Promise<Record<string, ComicSummary[]>> {
  const data = (await copyFetchJson("/api/v3/h5/homeIndex")).results;
  return {
    "推荐": (data.recComics?.list ?? []).map(parseSummary),
    "热门": (data.hotComics ?? []).map(parseSummary),
    "最新": (data.newComics ?? []).map(parseSummary),
    "完结": (data.finishComics?.list ?? []).map(parseSummary),
    "今日排行": (data.rankDayComics?.list ?? []).map(parseSummary),
    "本周排行": (data.rankWeekComics?.list ?? []).map(parseSummary),
    "本月排行": (data.rankMonthComics?.list ?? []).map(parseSummary),
  };
}

export type ComicPage = {
  comics: ComicSummary[];
  total: number;
  page: number;
};

export async function getCategoryComics(
  theme: string,
  ordering: string,
  top: string,
  page: number,
): Promise<ComicPage> {
  const offset = (page - 1) * 30;
  const url = "/api/v3/comics?limit=30&offset=" + offset + "&ordering=" + ordering + "&theme=" + theme + "&top=" + top;
  const data = (await copyFetchJson(url)).results;
  return {
    comics: (data.list ?? []).map(parseSummary),
    total: data.total ?? 0,
    page,
  };
}

export async function search(keyword: string, qType: string, page: number): Promise<ComicPage> {
  const offset = (page - 1) * 30;
  const url =
    "/api/v3/search/comic?limit=30&offset=" + offset + "&q=" + encodeURIComponent(keyword) + "&q_type=" + qType;
  const data = (await copyFetchJson(url)).results;
  return {
    comics: (data.list ?? []).map(parseSummary),
    total: data.total ?? 0,
    page,
  };
}

export type CopyComicDetails = ComicDetails & { subId: string };

export async function getComicInfo(pathWord: string): Promise<CopyComicDetails> {
  const results = (await copyFetchJson("/api/v3/comic2/" + pathWord + "?platform=3")).results ?? {};
  const c = results.comic ?? {};
  const groups = results.groups ?? {};
  const chapters: ComicChapter[] = [];

  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (!group || !group.path_word) continue; // 跳过空分组
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const chData = (
        await copyFetchJson(
          "/api/v3/comic/" + pathWord + "/group/" + group.path_word + "/chapters?limit=100&offset=" + offset + "&platform=3",
        )
      ).results ?? {};
      const list: any[] = Array.isArray(chData.list) ? chData.list : [];
      for (const e of list) {
        if (!e || !e.uuid) continue; // 过滤脏章节
        chapters.push({
          id: e.uuid,
          title: e.name ?? "未命名",
          comicId: pathWord,
          section: group.name ?? "",
          slot: String(chapters.length),
        });
      }
      offset += 100;
      if (offset >= (chData.total ?? 0)) break;
    }
  }

  const authors = Array.isArray(c.author)
    ? c.author.filter((a: any) => a && a.name).map((a: any) => a.name)
    : [];
  const tags = Array.isArray(c.theme)
    ? c.theme.filter((t: any) => t && t.name).map((t: any) => t.name)
    : [];

  return {
    id: pathWord,
    title: c.name ?? "",
    author: authors.length > 0 ? authors.join(", ") : undefined,
    cover: c.cover ?? "",
    tags,
    description: c.brief ?? "",
    updateTime: c.datetime_updated ?? "",
    chapters,
    subId: c.uuid ?? "",
  };
}

export async function getChapterImages(comicId: string, chapterId: string): Promise<string[]> {
  const results = (
    await copyFetchJson("/api/v3/comic/" + comicId + "/chapter2/" + chapterId + "?platform=3")
  ).results;
  const contents: string[] = (results.chapter.contents ?? []).map((e: any) => e.url);
  const orders: number[] = results.chapter.words ?? [];
  const hd = contents.map((url) =>
    url.replace(/([./])c\d+x\.[a-zA-Z]+$/, "$1c" + IMAGE_QUALITY + "x.webp"),
  );
  const images = new Array(hd.length).fill("");
  for (let i = 0; i < hd.length; i++) {
    images[orders[i]] = hd[i];
  }
  return images;
}
