"use client";
// 番茄钟主界面：蓝白 ins 可爱风定制版
// 环形倒计时 + 角色陪伴 + 白噪音混音 + 统计/番茄树 + 收集陈列

import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import {
  loadPomodoroSettings,
  savePomodoroSettings,
  aggregateDailyStats,
  getTodayPomodoroCount,
  getStreakDays,
  aggregateRewards,
  getRewardTotal,
} from "@/lib/pomodoro/storage";
import {
  DEFAULT_POMODORO_SETTINGS,
  WHITE_NOISE_META,
  type PomodoroSettings,
  type WhiteNoiseId,
} from "@/lib/pomodoro/types";
import { WhiteNoiseEngine } from "@/lib/pomodoro/white-noise";
import { usePomodoro } from "@/lib/pomodoro/use-pomodoro";

type Props = { onClose: () => void };
type Tab = "timer" | "noise" | "stats" | "settings";

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const PHASE_LABEL: Record<string, string> = {
  idle: "待开始",
  focus: "专注中",
  shortBreak: "小憩片刻",
  longBreak: "深呼吸长休",
};

export default function PomodoroApp({ onClose }: Props) {
  const [settings, setSettings] = useState<PomodoroSettings>(() => loadPomodoroSettings());
  const [tab, setTab] = useState<Tab>("timer");
  const [taskLabel, setTaskLabel] = useState("");
  const [draft, setDraft] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);

  const noiseEngineRef = useRef<WhiteNoiseEngine | null>(null);

  useEffect(() => {
    setCharacters(loadCharacters());
  }, []);

  useEffect(() => {
    savePomodoroSettings(settings);
  }, [settings]);

  // 白噪音引擎：跟随设置总开关/总音量/各音轨
  useEffect(() => {
    if (!noiseEngineRef.current) noiseEngineRef.current = new WhiteNoiseEngine();
    const engine = noiseEngineRef.current;
    engine.setMasterVolume(settings.noiseMasterEnabled ? settings.noiseMasterVolume : 0);
    for (const ch of settings.whiteNoise) {
      const on = settings.noiseMasterEnabled && ch.enabled;
      engine.setChannel(ch.id, on ? ch.volume : 0);
    }
  }, [settings.whiteNoise, settings.noiseMasterEnabled, settings.noiseMasterVolume]);

  useEffect(() => () => {
    noiseEngineRef.current?.dispose();
    noiseEngineRef.current = null;
  }, []);

  const {
    phase, remaining, running, round, completedFocus, chat, progress,
    lastReward, clearLastReward,
    start, pause, resume, stop, sendUserMessage,
  } = usePomodoro({ settings, taskLabel });

  // 奖励弹窗自动淡出
  useEffect(() => {
    if (!lastReward) return;
    const t = window.setTimeout(() => clearLastReward(), 2800);
    return () => window.clearTimeout(t);
  }, [lastReward, clearLastReward]);

  const companion = useMemo(
    () => characters.find((c) => c.id === settings.companionCharacterId) || null,
    [characters, settings.companionCharacterId],
  );

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length]);

  const toggleNoise = (id: WhiteNoiseId) => {
    noiseEngineRef.current?.resume();
    setSettings((s) => ({
      ...s,
      whiteNoise: s.whiteNoise.map((ch) => (ch.id === id ? { ...ch, enabled: !ch.enabled } : ch)),
    }));
  };
  const setNoiseVolume = (id: WhiteNoiseId, volume: number) => {
    noiseEngineRef.current?.resume();
    setSettings((s) => ({
      ...s,
      whiteNoise: s.whiteNoise.map((ch) => (ch.id === id ? { ...ch, volume } : ch)),
    }));
  };
  const toggleNoiseMaster = () => {
    noiseEngineRef.current?.resume();
    setSettings((s) => ({ ...s, noiseMasterEnabled: !s.noiseMasterEnabled }));
  };
  const setNoiseMasterVolume = (volume: number) => {
    noiseEngineRef.current?.resume();
    setSettings((s) => ({ ...s, noiseMasterVolume: volume }));
  };

  const todayCount = getTodayPomodoroCount() + completedFocus;
  const streak = getStreakDays();
  const dailyStats = useMemo(() => aggregateDailyStats(7), [completedFocus, tab]);
  const maxCount = Math.max(1, ...dailyStats.map((d) => d.count));
  const rewards = useMemo(() => aggregateRewards(), [completedFocus, tab, lastReward]);
  const rewardTotal = getRewardTotal();

  // ── 环形进度配置 ──
  const R = 125;
  const C = 2 * Math.PI * R;
  const dash = C * (1 - progress);

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void sendUserMessage(text);
  };

  return (
    <PageShell title="☁️ 番茄专注" onBack={onClose} className="pomodoro-blue-shell">
      {/* 蓝白 ins 专属 CSS 增强 */}
      <style>{`
        .pomodoro-blue-shell {
          background: linear-gradient(180deg, #F0F6FF 0%, #FFFFFF 60%, #F5F9FF 100%) !important;
          color: #2D4356;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
        }
        .pomo-glass-card {
          background: rgba(255, 255, 255, 0.82);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(198, 221, 250, 0.6);
          box-shadow: 0 8px 24px rgba(107, 164, 232, 0.08);
          border-radius: 20px;
        }
        .pomo-btn-glow {
          box-shadow: 0 4px 14px rgba(107, 164, 232, 0.35);
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pomo-btn-glow:active {
          transform: scale(0.96);
          box-shadow: 0 2px 6px rgba(107, 164, 232, 0.2);
        }
        .pomo-input-cute {
          background: #FFFFFF;
          border: 1.5px solid #D6E6F9;
          transition: all 0.25s ease;
          box-shadow: inset 0 2px 4px rgba(107, 164, 232, 0.04);
        }
        .pomo-input-cute:focus {
          border-color: #6BA4E8;
          box-shadow: 0 0 0 3px rgba(107, 164, 232, 0.18);
          outline: none;
        }
        @keyframes pomoRewardPop {
          0% { opacity: 0; transform: translateX(-50%) translateY(-12px) scale(0.85); }
          50% { transform: translateX(-50%) translateY(2px) scale(1.02); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes pomoPulseBreath {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.015); opacity: 1; }
        }
        .pomo-timer-circle {
          filter: drop-shadow(0 6px 16px rgba(107, 164, 232, 0.2));
        }
      `}</style>

      {/* 连续奖励弹层 */}
      {lastReward && (
        <div style={{
          position: "absolute", top: 68, left: "50%", transform: "translateX(-50%)", zIndex: 60,
          display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderRadius: 999,
          background: "linear-gradient(135deg, #7BAEF0 0%, #A3C9FA 100%)", color: "#fff",
          boxShadow: "0 8px 24px rgba(107, 164, 232, 0.38)", animation: "pomoRewardPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
          border: "1.5px solid rgba(255, 255, 255, 0.8)",
        }}>
          <span style={{ fontSize: 24, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}>{lastReward.emoji}</span>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>✨ 掉落收集：{lastReward.name}</span>
            <span style={{ fontSize: 11, opacity: 0.9 }}>专注达成！小宝贝又多了一件藏品~</span>
          </div>
        </div>
      )}

      {/* ins 蓝白胶囊 Tab 导航 */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px 4px", justifyContent: "center" }}>
        <div style={{
          display: "flex", background: "rgba(214, 230, 249, 0.45)", padding: "4px",
          borderRadius: 999, gap: 4, border: "1px solid rgba(198, 221, 250, 0.7)",
        }}>
          {(["timer", "noise", "stats", "settings"] as Tab[]).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={{
                  padding: "6px 16px", borderRadius: 999, border: "none", fontSize: 13, fontWeight: active ? 600 : 500,
                  background: active ? "#6BA4E8" : "transparent",
                  color: active ? "#FFFFFF" : "#5A738E",
                  boxShadow: active ? "0 3px 10px rgba(107, 164, 232, 0.32)" : "none",
                  cursor: "pointer", transition: "all 0.25s ease",
                }}
              >
                {{ timer: "☁️ 计时", noise: "🎵 白噪音", stats: "📊 统计", settings: "⚙️ 设置" }[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 计时页 ── */}
      {tab === "timer" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 16px 24px" }}>
          {/* 陪伴角色胶囊标签 */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px 5px 6px",
            borderRadius: 999, background: "rgba(255, 255, 255, 0.85)", border: "1px solid #D9E8FA",
            boxShadow: "0 2px 8px rgba(107, 164, 232, 0.08)", marginBottom: 8, marginTop: 4,
          }}>
            {companion ? (
              <>
                {companion.avatar
                  ? <img src={companion.avatar} alt={companion.name} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", border: "1.5px solid #6BA4E8" }} />
                  : <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#6BA4E8", color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{companion.name.charAt(0)}</span>}
                <span style={{ fontSize: 12.5, color: "#3A5674", fontWeight: 600 }}>{companion.name}</span>
                <span style={{ fontSize: 11, color: "#7B9BBF", background: "#EDF5FD", padding: "2px 8px", borderRadius: 999 }}>{PHASE_LABEL[phase]}</span>
              </>
            ) : (
              <span style={{ fontSize: 12, color: "#8CA5C1", padding: "0 4px" }}>🍃 {PHASE_LABEL[phase]}（单人自习模式）</span>
            )}
          </div>

          {/* 蓝白渐变环形倒计时 */}
          <div style={{ position: "relative", width: 290, height: 290, margin: "6px 0" }}>
            <svg width={290} height={290} style={{ transform: "rotate(-90deg)" }} className="pomo-timer-circle">
              <defs>
                <linearGradient id="pomoBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#89C4F4" />
                  <stop offset="100%" stopColor="#5B93E1" />
                </linearGradient>
                <linearGradient id="pomoBreakGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#72DBD3" />
                  <stop offset="100%" stopColor="#48B3AC" />
                </linearGradient>
              </defs>
              {/* 底环 */}
              <circle cx={145} cy={145} r={R} fill="none" stroke="rgba(214, 230, 249, 0.55)" strokeWidth={13} />
              {/* 动效进度环 */}
              <circle
                cx={145} cy={145} r={R} fill="none"
                stroke={phase === "focus" ? "url(#pomoBlueGrad)" : phase === "idle" ? "#D6E5F7" : "url(#pomoBreakGrad)"}
                strokeWidth={13} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={dash}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 0.4s ease" }}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                fontSize: 50, fontWeight: 700, letterSpacing: 0.5, color: "#2B435D",
                fontVariantNumeric: "tabular-nums", textShadow: "0 2px 10px rgba(107, 164, 232, 0.15)",
              }}>
                {phase === "idle" ? fmt(settings.focusMinutes * 60) : fmt(remaining)}
              </div>
              <div style={{
                fontSize: 12.5, color: "#7B9BBF", marginTop: 4, fontWeight: 500,
                background: "rgba(235, 244, 255, 0.7)", padding: "3px 12px", borderRadius: 999,
                border: "1px solid rgba(198, 221, 250, 0.6)",
              }}>
                第 {round} 轮 · 今日 🍅 {todayCount}
              </div>
            </div>
          </div>

          {/* 任务标签输入框 */}
          <div style={{ width: "88%", maxWidth: 320, position: "relative", marginTop: 8 }}>
            <input
              value={taskLabel}
              onChange={(e) => setTaskLabel(e.target.value)}
              placeholder="☁️ 这一轮想专注做什么？（如：画画/看书）"
              className="pomo-input-cute"
              style={{
                width: "100%", padding: "10px 16px", borderRadius: 16, fontSize: 13.5,
                textAlign: "center", color: "#2C3E50", boxSizing: "border-box",
              }}
            />
          </div>

          {/* 控制按钮组 */}
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            {phase === "idle" ? (
              <button type="button" onClick={start} className="pomo-btn-glow" style={btnPrimary}>
                ✨ 开始专注
              </button>
            ) : (
              <>
                {running ? (
                  <button type="button" onClick={pause} style={btnSecondary}>
                    ⏸️ 暂停
                  </button>
                ) : (
                  <button type="button" onClick={resume} className="pomo-btn-glow" style={btnPrimary}>
                    ▶️ 继续
                  </button>
                )}
                <button type="button" onClick={stop} style={btnDanger}>
                  ⏹️ 结束
                </button>
              </>
            )}
          </div>

          {/* 今日番茄收获树 */}
          {todayCount > 0 && (
            <div className="pomo-glass-card" style={{
              marginTop: 18, padding: "8px 14px", display: "flex", flexWrap: "wrap",
              gap: 6, justifyContent: "center", maxWidth: 290,
            }}>
              {Array.from({ length: todayCount }).map((_, i) => (
                <span key={i} style={{ fontSize: 18, filter: "drop-shadow(0 2px 4px rgba(255,107,107,0.25))" }}>🍅</span>
              ))}
            </div>
          )}

          {/* 陪伴角色灵动对话气泡区 */}
          {companion && (
            <div className="pomo-glass-card" style={{ width: "94%", maxWidth: 360, marginTop: 18, padding: "12px 14px" }}>
              <div style={{
                maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column",
                gap: 8, padding: "4px 2px",
              }}>
                {chat.length === 0 && (
                  <div style={{ fontSize: 12, color: "#9FB3C8", textAlign: "center", padding: "10px 0" }}>
                    💭 {companion.name} 正在身旁默默陪着你...
                  </div>
                )}
                {chat.map((m) => (
                  <div key={m.id} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                    <div style={{
                      padding: "8px 12px", borderRadius: 14, fontSize: 13, lineHeight: 1.45,
                      background: m.role === "user" ? "linear-gradient(135deg, #6BA4E8 0%, #5B94DE 100%)" : "#FFFFFF",
                      color: m.role === "user" ? "#FFFFFF" : "#2D4356",
                      boxShadow: m.role === "user" ? "0 2px 8px rgba(107,164,232,0.3)" : "0 2px 8px rgba(107,164,232,0.06)",
                      border: m.role === "user" ? "none" : "1px solid #DDEAFC",
                    }}>
                      {m.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 8, borderTop: "1px dashed #E2EDFB" }}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                  placeholder={`💬 对${companion.name}说点什么…`}
                  className="pomo-input-cute"
                  style={{ flex: 1, padding: "8px 14px", borderRadius: 999, fontSize: 13, color: "#2D4356" }}
                />
                <button type="button" onClick={handleSend} className="pomo-btn-glow" style={{ ...btnPrimary, padding: "8px 16px", fontSize: 13 }}>
                  发送
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 白噪音页（极简 ins 蓝白卡片） ── */}
      {tab === "noise" && (
        <div style={{ padding: "12px 16px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 顶栏：白噪音总控制卡片 */}
          <div className="pomo-glass-card" style={{
            padding: "16px 18px",
            background: "linear-gradient(135deg, rgba(220,235,255,0.7) 0%, rgba(255,255,255,0.9) 100%)",
            border: "1.5px solid rgba(180, 212, 248, 0.5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: settings.noiseMasterEnabled ? 12 : 0 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#2B435D" }}>🎧 白噪音总控</div>
                <div style={{ fontSize: 12, color: "#7B9BBF", marginTop: 2 }}>
                  {settings.noiseMasterEnabled ? "自然混音流淌中 · 纯粹沉浸" : "当前已全局静音"}
                </div>
              </div>
              {/* ins 蓝白总开关 */}
              <button
                type="button"
                onClick={toggleNoiseMaster}
                style={{
                  width: 50, height: 28, borderRadius: 999, border: "none", cursor: "pointer", position: "relative",
                  background: settings.noiseMasterEnabled ? "#6BA4E8" : "rgba(0,0,0,0.12)", transition: "background 0.25s ease",
                  boxShadow: settings.noiseMasterEnabled ? "0 2px 8px rgba(107,164,232,0.4)" : "none",
                }}
              >
                <span style={{
                  position: "absolute", top: 3, left: settings.noiseMasterEnabled ? 25 : 3, width: 22, height: 22, borderRadius: "50%",
                  background: "#fff", transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                }} />
              </button>
            </div>
            {settings.noiseMasterEnabled && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
                <span style={{ fontSize: 16 }}>🌊</span>
                <input
                  type="range" min={0} max={1} step={0.05} value={settings.noiseMasterVolume}
                  onChange={(e) => setNoiseMasterVolume(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "#6BA4E8" }}
                />
                <span style={{ fontSize: 12, color: "#5A738E", width: 34, textAlign: "right", fontWeight: 600 }}>
                  {Math.round(settings.noiseMasterVolume * 100)}%
                </span>
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, color: "#8FAECB", textAlign: "center", letterSpacing: 0.5, fontWeight: 500 }}>
            ☁️ 多音轨自由叠加 · 调配属于你的治愈氛围 ☁️
          </div>

          {/* 各音轨 ins 胶囊列表 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {settings.whiteNoise.map((ch) => {
              const meta = WHITE_NOISE_META[ch.id];
              const isActive = settings.noiseMasterEnabled && ch.enabled;
              return (
                <div key={ch.id} className="pomo-glass-card" style={{
                  padding: "12px 16px",
                  background: isActive ? "rgba(235, 244, 255, 0.85)" : "rgba(255, 255, 255, 0.6)",
                  border: isActive ? "1.5px solid #A8CDFA" : "1px solid rgba(214, 230, 249, 0.6)",
                  boxShadow: isActive ? "0 4px 14px rgba(107, 164, 232, 0.12)" : "0 2px 6px rgba(0,0,0,0.02)",
                  transition: "all 0.25s ease",
                  display: "flex", flexDirection: "column", gap: isActive ? 10 : 0,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20, opacity: isActive ? 1 : 0.45, transition: "opacity 0.2s" }}>{meta.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: isActive ? "#2D4356" : "#768B9E" }}>{meta.label}</span>
                    </div>
                    {/* 单音轨 ins 胶囊开关 */}
                    <button
                      type="button"
                      onClick={() => toggleNoise(ch.id)}
                      style={{
                        width: 44, height: 24, borderRadius: 999, border: "none", cursor: "pointer", position: "relative",
                        background: ch.enabled ? "#6BA4E8" : "rgba(0,0,0,0.1)", transition: "background 0.25s ease",
                        opacity: settings.noiseMasterEnabled ? 1 : 0.5,
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 2, left: ch.enabled ? 22 : 2, width: 20, height: 20, borderRadius: "50%",
                        background: "#fff", transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                      }} />
                    </button>
                  </div>

                  {ch.enabled && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: settings.noiseMasterEnabled ? 1 : 0.45 }}>
                      <span style={{ fontSize: 11, color: "#7B9BBF", fontWeight: 500 }}>音量</span>
                      <input
                        type="range" min={0} max={1} step={0.05} value={ch.volume}
                        onChange={(e) => setNoiseVolume(ch.id, Number(e.target.value))}
                        disabled={!settings.noiseMasterEnabled}
                        style={{ flex: 1, accentColor: "#6BA4E8" }}
                      />
                      <span style={{ fontSize: 11, color: "#5A738E", width: 28, textAlign: "right", fontWeight: 600 }}>
                        {Math.round(ch.volume * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 统计页（蓝白极简卡片 + 收集展示） ── */}
      {tab === "stats" && (
        <div style={{ padding: "12px 16px 32px" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <BlueStatCard label="今日专注番茄" value={`${todayCount}`} sub="颗" icon="🍅" />
            <BlueStatCard label="连续打卡天数" value={`${streak}`} sub="天" icon="✨" />
          </div>

          <div className="pomo-glass-card" style={{ padding: "14px 16px", marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#3A5674", marginBottom: 12 }}>📈 近 7 天专注趋势</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 130 }}>
              {dailyStats.map((d) => (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 11, color: "#6BA4E8", fontWeight: 600 }}>{d.count || ""}</div>
                  <div style={{
                    width: "65%", height: `${(d.count / maxCount) * 100}%`, minHeight: d.count ? 5 : 0,
                    background: "linear-gradient(180deg, #89C4F4 0%, #5B93E1 100%)", borderRadius: "6px 6px 2px 2px",
                    boxShadow: d.count ? "0 2px 6px rgba(107,164,232,0.3)" : "none",
                    transition: "height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }} />
                  <div style={{ fontSize: 10, color: "#8CA5C1" }}>{d.date.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 蓝白 ins 收集陈列架 */}
          <div className="pomo-glass-card" style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 15 }}>🎁</span>
                <span style={{ fontSize: 13.5, color: "#2B435D", fontWeight: 700 }}>我的专注宝藏收集</span>
              </div>
              <span style={{ fontSize: 12, color: "#6BA4E8", fontWeight: 600, background: "#E8F3FF", padding: "2px 10px", borderRadius: 999 }}>
                共 {rewardTotal} 件
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {rewards.map((it) => {
                const owned = it.count > 0;
                return (
                  <div key={it.itemId} style={{
                    padding: "12px 6px", borderRadius: 16, textAlign: "center",
                    background: owned ? "linear-gradient(135deg, #FFFFFF 0%, #F0F7FF 100%)" : "rgba(240, 245, 252, 0.5)",
                    border: owned ? "1.5px solid #BDDAFC" : "1px solid rgba(214, 230, 249, 0.5)",
                    boxShadow: owned ? "0 3px 10px rgba(107, 164, 232, 0.12)" : "none",
                    position: "relative",
                  }}>
                    <div style={{
                      fontSize: 26, opacity: owned ? 1 : 0.28,
                      filter: owned ? "drop-shadow(0 2px 4px rgba(107,164,232,0.2))" : "grayscale(1)",
                    }}>
                      {it.emoji}
                    </div>
                    <div style={{ fontSize: 11, color: owned ? "#3A5674" : "#A5B8CC", marginTop: 4, fontWeight: owned ? 600 : 400 }}>
                      {it.name}
                    </div>
                    {owned && (
                      <span style={{
                        position: "absolute", top: 4, right: 4, fontSize: 10, color: "#fff", fontWeight: 700,
                        background: "linear-gradient(135deg, #6BA4E8 0%, #548DDB 100%)", borderRadius: 999,
                        padding: "1px 5px", minWidth: 15, boxShadow: "0 1px 4px rgba(107,164,232,0.3)",
                      }}>
                        {it.count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 设置页（蓝白扁平精致） ── */}
      {tab === "settings" && (
        <div style={{ padding: "12px 16px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="pomo-glass-card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            <BlueNumberRow label="专注时长（分钟）" value={settings.focusMinutes} min={1} max={120}
              onChange={(v) => setSettings((s) => ({ ...s, focusMinutes: v }))} />
            <BlueNumberRow label="短休息时长（分钟）" value={settings.shortBreakMinutes} min={1} max={60}
              onChange={(v) => setSettings((s) => ({ ...s, shortBreakMinutes: v }))} />
            <BlueNumberRow label="长休息时长（分钟）" value={settings.longBreakMinutes} min={1} max={90}
              onChange={(v) => setSettings((s) => ({ ...s, longBreakMinutes: v }))} />
            <BlueNumberRow label="几轮专注后进入长休息" value={settings.roundsBeforeLongBreak} min={2} max={8}
              onChange={(v) => setSettings((s) => ({ ...s, roundsBeforeLongBreak: v }))} />
          </div>

          <div className="pomo-glass-card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 13.5, color: "#2B435D", fontWeight: 600, display: "block", marginBottom: 6 }}>
                🌸 陪伴角色
              </label>
              <select
                value={settings.companionCharacterId ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, companionCharacterId: e.target.value || null }))}
                className="pomo-input-cute"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 12, fontSize: 13.5, color: "#2B435D" }}
              >
                <option value="">不选（单人专注）</option>
                {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <BlueToggleRow label="角色主动发消息陪伴" checked={settings.companionEnabled}
              onChange={(v) => setSettings((s) => ({ ...s, companionEnabled: v }))} />
            <BlueNumberRow label="主动发消息间隔（分钟, 0=不主动）" value={settings.companionIntervalMinutes} min={0} max={30}
              onChange={(v) => setSettings((s) => ({ ...s, companionIntervalMinutes: v }))} />
            <BlueToggleRow label="陪伴对话同步至聊天记录" checked={settings.syncToChat}
              onChange={(v) => setSettings((s) => ({ ...s, syncToChat: v }))} />
            <BlueToggleRow label="专注事件沉淀进角色记忆" checked={settings.syncToMemory}
              onChange={(v) => setSettings((s) => ({ ...s, syncToMemory: v }))} />
          </div>

          <button
            type="button"
            onClick={() => setSettings({ ...DEFAULT_POMODORO_SETTINGS })}
            style={{ ...btnSecondary, marginTop: 4, width: "100%", textAlign: "center" }}
          >
            🔄 恢复默认设置
          </button>
        </div>
      )}
    </PageShell>
  );
}

// ── 蓝白 ins 统一按钮与组件样式 ──

const btnPrimary: React.CSSProperties = {
  padding: "10px 28px", borderRadius: 999, border: "none",
  background: "linear-gradient(135deg, #6BA4E8 0%, #548DDB 100%)",
  color: "#fff", fontSize: 14.5, fontWeight: 600, cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "10px 24px", borderRadius: 999, border: "1px solid #D1E3FA",
  background: "#FFFFFF", color: "#4A6785", fontSize: 14.5, fontWeight: 600, cursor: "pointer",
};
const btnDanger: React.CSSProperties = {
  padding: "10px 24px", borderRadius: 999, border: "none",
  background: "rgba(255, 107, 107, 0.12)", color: "#E05353", fontSize: 14.5, fontWeight: 600, cursor: "pointer",
};

function BlueStatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: string }) {
  return (
    <div className="pomo-glass-card" style={{ flex: 1, padding: "14px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#4A8BE0", fontVariantNumeric: "tabular-nums" }}>
        {value} <span style={{ fontSize: 12, fontWeight: 500, color: "#8CA5C1" }}>{sub}</span>
      </div>
      <div style={{ fontSize: 11.5, color: "#7B9BBF", marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function BlueNumberRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 13.5, color: "#3A5674", flex: 1, fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} style={blueStepBtn}>−</button>
        <span style={{ width: 34, textAlign: "center", fontSize: 14.5, fontWeight: 600, color: "#2B435D" }}>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} style={blueStepBtn}>+</button>
      </div>
    </div>
  );
}

const blueStepBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, border: "1px solid #D9E8FA",
  background: "#FFFFFF", fontSize: 16, cursor: "pointer", color: "#548DDB", fontWeight: 700,
  display: "grid", placeItems: "center",
};

function BlueToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 13.5, color: "#3A5674", fontWeight: 500 }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", position: "relative",
          background: checked ? "#6BA4E8" : "rgba(0,0,0,0.1)", transition: "background 0.25s ease",
          boxShadow: checked ? "0 2px 6px rgba(107,164,232,0.3)" : "none",
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: checked ? 23 : 3, width: 20, height: 20, borderRadius: "50%",
          background: "#fff", transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }} />
      </button>
    </div>
  );
}
