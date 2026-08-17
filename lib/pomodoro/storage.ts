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

// ── 连续奖励（收集小物件） ──

export function loadPomodoroRewards(): PomodoroReward[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = kvGet(REWARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is PomodoroReward =>
        Boolean(r) &&
        typeof (r as PomodoroReward).id === "string" &&
        typeof (r as PomodoroReward).earnedAt === "string",
    );
  } catch {
    return [];
  }
}

/** 按权重随机抽一个奖励物件 */
function drawRewardItem(): { itemId: string; emoji: string; name: string } {
  const total = REWARD_POOL.reduce((sum, it) => sum + it.weight, 0);
  let roll = Math.random() * total;
  for (const it of REWARD_POOL) {
    roll -= it.weight;
    if (roll <= 0) return { itemId: it.itemId, emoji: it.emoji, name: it.name };
  }
  const fallback = REWARD_POOL[0];
  return { itemId: fallback.itemId, emoji: fallback.emoji, name: fallback.name };
}

/** 完成一个番茄，掉落一枚奖励并持久化，返回新奖励 */
export function grantPomodoroReward(): PomodoroReward | null {
  if (typeof window === "undefined") return null;
  const item = drawRewardItem();
  const reward: PomodoroReward = {
    id: `rw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    itemId: item.itemId,
    emoji: item.emoji,
    name: item.name,
    earnedAt: new Date().toISOString(),
  };
  const next = [reward, ...loadPomodoroRewards()].slice(0, MAX_REWARDS);
  kvSet(REWARDS_KEY, JSON.stringify(next));
  return reward;
}

/** 奖励总数 */
export function getRewardTotal(): number {
  return loadPomodoroRewards().length;
}

/** 按物件种类聚合奖励数量（用于展示收集陈列） */
export function aggregateRewards(): { itemId: string; emoji: string; name: string; count: number }[] {
  const rewards = loadPomodoroRewards();
  const byItem = new Map<string, { itemId: string; emoji: string; name: string; count: number }>();
  for (const r of rewards) {
    const cur = byItem.get(r.itemId) || { itemId: r.itemId, emoji: r.emoji, name: r.name, count: 0 };
    cur.count += 1;
    byItem.set(r.itemId, cur);
  }
  return REWARD_POOL.map((it) => byItem.get(it.itemId) || { itemId: it.itemId, emoji: it.emoji, name: it.name, count: 0 });
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
