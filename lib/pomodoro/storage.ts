// lib/pomodoro/storage.ts
// 番茄钟的设置、每日统计与番茄记录持久化（localStorage / kv-db）。

import { kvGet, kvSet, registerKvMigration, registerDynamicPrefix } from "../kv-db";
import type { PomodoroSettings, PomodoroRecord, PomodoroDailyStat, PomodoroReward } from "./types";
import { DEFAULT_POMODORO_SETTINGS, REWARD_POOL } from "./types";

const SETTINGS_KEY = "ai_phone_pomodoro_settings_v1";
const RECORDS_KEY = "ai_phone_pomodoro_records_v1";
const REWARDS_KEY = "ai_phone_pomodoro_rewards_v1";
const MAX_RECORDS = 500;
const MAX_REWARDS = 999;

registerKvMigration(SETTINGS_KEY);
registerKvMigration(RECORDS_KEY);
registerKvMigration(REWARDS_KEY);

// ── 设置 ──

export function loadPomodoroSettings(): PomodoroSettings {
  if (typeof window === "undefined") return { ...DEFAULT_POMODORO_SETTINGS };
  try {
    const raw = kvGet(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_POMODORO_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PomodoroSettings>;
    // 合并白噪音默认，防止新增音轨在旧数据里缺失
    const whiteNoise = DEFAULT_POMODORO_SETTINGS.whiteNoise.map((def) => {
      const saved = parsed.whiteNoise?.find((w) => w.id === def.id);
      return saved ? { ...def, ...saved } : def;
    });
    return { ...DEFAULT_POMODORO_SETTINGS, ...parsed, whiteNoise };
  } catch {
    return { ...DEFAULT_POMODORO_SETTINGS };
  }
}

export function savePomodoroSettings(settings: PomodoroSettings): void {
  if (typeof window === "undefined") return;
  kvSet(SETTINGS_KEY, JSON.stringify(settings));
}

// ── 番茄记录 ──

export function loadPomodoroRecords(): PomodoroRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = kvGet(RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is PomodoroRecord =>
        Boolean(r) &&
        typeof (r as PomodoroRecord).id === "string" &&
        typeof (r as PomodoroRecord).completedAt === "string",
    );
  } catch {
    return [];
  }
}

export function addPomodoroRecord(record: PomodoroRecord): PomodoroRecord[] {
  const records = loadPomodoroRecords();
  const next = [record, ...records].slice(0, MAX_RECORDS);
  if (typeof window !== "undefined") {
    kvSet(RECORDS_KEY, JSON.stringify(next));
  }
  return next;
}

// ── 统计聚合 ──

function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 按天聚合最近 N 天的统计（含今天，倒序：今天在最后一项） */
export function aggregateDailyStats(days = 7): PomodoroDailyStat[] {
  const records = loadPomodoroRecords();
  const byDate = new Map<string, PomodoroDailyStat>();
  for (const r of records) {
    const key = localDateKey(r.completedAt);
    const cur = byDate.get(key) || { date: key, count: 0, totalSeconds: 0 };
    cur.count += 1;
    cur.totalSeconds += r.focusSeconds;
    byDate.set(key, cur);
  }

  const result: PomodoroDailyStat[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDateKey(d.toISOString());
    result.push(byDate.get(key) || { date: key, count: 0, totalSeconds: 0 });
  }
  return result;
}

/** 今天已完成的番茄数（用于番茄树） */
export function getTodayPomodoroCount(): number {
  const todayKey = localDateKey(new Date().toISOString());
  return loadPomodoroRecords().filter((r) => localDateKey(r.completedAt) === todayKey).length;
}

/** 连续打卡天数 */
export function getStreakDays(): number {
  const records = loadPomodoroRecords();
  if (records.length === 0) return 0;
  const dates = new Set(records.map((r) => localDateKey(r.completedAt)));
  let streak = 0;
  const cursor = new Date();
  // 今天没打卡时，从昨天开始算连续
  if (!dates.has(localDateKey(cursor.toISOString()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dates.has(localDateKey(cursor.toISOString()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
