// lib/pomodoro/types.ts
// 番茄钟功能的核心类型定义。

export type PomodoroPhase = "idle" | "focus" | "shortBreak" | "longBreak";

/** 内置白噪音音轨 id（程序化合成，不依赖外部音频文件） */
export type WhiteNoiseId =
  | "rain"        // 雨声
  | "heavyRain"   // 大雨
  | "ocean"       // 海浪
  | "fireplace"   // 壁炉噼啪
  | "cafe"        // 咖啡厅环境音
  | "forest"      // 森林
  | "whiteNoise"; // 纯白噪音

export type WhiteNoiseChannel = {
  id: WhiteNoiseId;
  enabled: boolean;
  volume: number; // 0-1
};

export type PomodoroSettings = {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  roundsBeforeLongBreak: number;
  // ── 角色陪伴 ──
  companionCharacterId: string | null;
  companionEnabled: boolean;
  /** 专注期间角色主动发消息的间隔（分钟）。0 = 不主动发 */
  companionIntervalMinutes: number;
  /** 是否把专注对话同步进与角色的聊天记录 */
  syncToChat: boolean;
  /** 是否把专注事件沉淀进角色记忆库 */
  syncToMemory: boolean;
  // ── 白噪音 ──
  /** 白噪音总开关（关闭时所有音轨都静音） */
  noiseMasterEnabled: boolean;
  /** 白噪音总音量 0-1 */
  noiseMasterVolume: number;
  whiteNoise: WhiteNoiseChannel[];
};

export const WHITE_NOISE_META: Record<WhiteNoiseId, { label: string; icon: string }> = {
  rain: { label: "小雨", icon: "🌧️" },
  heavyRain: { label: "大雨", icon: "⛈️" },
  ocean: { label: "海浪", icon: "🌊" },
  fireplace: { label: "壁炉", icon: "🔥" },
  cafe: { label: "咖啡厅", icon: "☕" },
  forest: { label: "森林", icon: "🌲" },
  whiteNoise: { label: "白噪音", icon: "📻" },
};

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 4,
  companionCharacterId: null,
  companionEnabled: true,
  companionIntervalMinutes: 9,
  syncToChat: true,
  syncToMemory: true,
  noiseMasterEnabled: true,
  noiseMasterVolume: 0.8,
  whiteNoise: [
    { id: "rain", enabled: false, volume: 0.6 },
    { id: "heavyRain", enabled: false, volume: 0.6 },
    { id: "ocean", enabled: false, volume: 0.6 },
    { id: "fireplace", enabled: false, volume: 0.6 },
    { id: "cafe", enabled: false, volume: 0.5 },
    { id: "forest", enabled: false, volume: 0.6 },
    { id: "whiteNoise", enabled: false, volume: 0.4 },
  ],
};

/** 单次完成的专注番茄记录（用于统计与番茄树） */
export type PomodoroRecord = {
  id: string;
  taskLabel: string;
  characterId: string | null;
  focusSeconds: number;
  completedAt: string; // ISO
  round: number;       // 第几轮
};

/** 某天的聚合统计 */
export type PomodoroDailyStat = {
  date: string;        // YYYY-MM-DD
  count: number;       // 完成的番茄数
  totalSeconds: number;
};

/** 连续奖励：每完成一个番茄发一枚可收集的小物件 */
export type PomodoroReward = {
  id: string;
  itemId: string;   // 物件种类 id
  emoji: string;
  name: string;
  earnedAt: string; // ISO
};

/** 奖励池（带权重，越可爱越稀有）。奖励按完成量掉落，不按连续签到，断一天也不清零。 */
export const REWARD_POOL: { itemId: string; emoji: string; name: string; weight: number }[] = [
  { itemId: "plant", emoji: "🪴", name: "小盆栽", weight: 22 },
  { itemId: "book", emoji: "📗", name: "小书本", weight: 20 },
  { itemId: "candle", emoji: "🕯️", name: "香薰蜡烛", weight: 16 },
  { itemId: "cup", emoji: "🧋", name: "奶茶", weight: 14 },
  { itemId: "star", emoji: "⭐", name: "小星星", weight: 12 },
  { itemId: "cat", emoji: "🐱", name: "小猫咪", weight: 8 },
  { itemId: "crystal", emoji: "🔮", name: "水晶球", weight: 5 },
  { itemId: "cake", emoji: "🍰", name: "小蛋糕", weight: 3 },
];
