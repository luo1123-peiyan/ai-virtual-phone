"use client";
// 番茄钟主界面：环形倒计时 + 角色陪伴 + 白噪音混音 + 统计/番茄树。

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
  shortBreak: "短休息",
  longBreak: "长休息",
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

  // 白噪音引擎：跟随设置里的开关/音量
  useEffect(() => {
    if (!noiseEngineRef.current) noiseEngineRef.current = new WhiteNoiseEngine();
    const engine = noiseEngineRef.current;
    for (const ch of settings.whiteNoise) {
      engine.setChannel(ch.id, ch.enabled ? ch.volume : 0);
    }
  }, [settings.whiteNoise]);

  useEffect(() => () => {
    noiseEngineRef.current?.dispose();
    noiseEngineRef.current = null;
  }, []);

  const {
    phase, remaining, running, round, completedFocus, chat, progress,
    start, pause, resume, stop, sendUserMessage,
  } = usePomodoro({ settings, taskLabel });

  const companion = useMemo(
    () => characters.find((c) => c.id === settings.companionCharacterId) || null,
    [characters, settings.companionCharacterId],
  );

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length]);

  const toggleNoise = (id: WhiteNoiseId) => {
    setSettings((s) => ({
      ...s,
      whiteNoise: s.whiteNoise.map((ch) => (ch.id === id ? { ...ch, enabled: !ch.enabled } : ch)),
    }));
  };
  const setNoiseVolume = (id: WhiteNoiseId, volume: number) => {
    setSettings((s) => ({
      ...s,
      whiteNoise: s.whiteNoise.map((ch) => (ch.id === id ? { ...ch, volume } : ch)),
    }));
  };

  const todayCount = getTodayPomodoroCount() + completedFocus;
  const streak = getStreakDays();
  const dailyStats = useMemo(() => aggregateDailyStats(7), [completedFocus, tab]);
  const maxCount = Math.max(1, ...dailyStats.map((d) => d.count));

  // ── 环形进度 ──
  const R = 130;
  const C = 2 * Math.PI * R;
  const dash = C * (1 - progress);
  const ringColor = phase === "focus" ? "#FF6B6B" : phase === "idle" ? "#BDBDBD" : "#34C759";

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void sendUserMessage(text);
  };

  return (
    <PageShell title="番茄钟" onBack={onClose} className="pomodoro-shell">
      {/* Tab 切换 */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", justifyContent: "center", flexWrap: "wrap" }}>
        {(["timer", "noise", "stats", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "6px 14px", borderRadius: 999, border: "none", fontSize: 13,
              background: tab === t ? "#FF6B6B" : "rgba(0,0,0,0.06)",
              color: tab === t ? "#fff" : "#555", cursor: "pointer",
            }}
          >
            {{ timer: "计时", noise: "白噪音", stats: "统计", settings: "设置" }[t]}
          </button>
        ))}
      </div>

      {tab === "timer" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 16px 20px" }}>
          {/* 陪伴角色头像 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, minHeight: 28 }}>
            {companion && (
              <>
                {companion.avatar
                  ? <img src={companion.avatar} alt={companion.name} style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
                  : <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#7a6080", color: "#fff", display: "grid", placeItems: "center", fontSize: 13 }}>{companion.name.charAt(0)}</span>}
                <span style={{ fontSize: 13, color: "#666" }}>{companion.name} · {PHASE_LABEL[phase]}</span>
              </>
            )}
            {!companion && <span style={{ fontSize: 13, color: "#999" }}>{PHASE_LABEL[phase]}（未选陪伴角色）</span>}
          </div>

          {/* 环形倒计时 */}
          <div style={{ position: "relative", width: 300, height: 300 }}>
            <svg width={300} height={300} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={150} cy={150} r={R} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={14} />
              <circle
                cx={150} cy={150} r={R} fill="none" stroke={ringColor} strokeWidth={14}
                strokeLinecap="round" strokeDasharray={C} strokeDashoffset={dash}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 0.4s" }}
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 48, fontWeight: 600, letterSpacing: 1, color: "#333" }}>
                {phase === "idle" ? fmt(settings.focusMinutes * 60) : fmt(remaining)}
              </div>
              <div style={{ fontSize: 13, color: "#999", marginTop: 4 }}>
                第 {round} 轮 · 今日🍅 {todayCount}
              </div>
            </div>
          </div>

          {/* 任务标签 */}
          <input
            value={taskLabel}
            onChange={(e) => setTaskLabel(e.target.value)}
            placeholder="这一轮想做什么？（如：画稿）"
            style={{ marginTop: 12, width: "85%", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)", fontSize: 14, textAlign: "center" }}
          />

          {/* 控制按钮 */}
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            {phase === "idle" ? (
              <button type="button" onClick={start} style={btnPrimary}>开始专注</button>
            ) : (
              <>
                {running
                  ? <button type="button" onClick={pause} style={btnSecondary}>暂停</button>
                  : <button type="button" onClick={resume} style={btnPrimary}>继续</button>}
                <button type="button" onClick={stop} style={btnDanger}>结束</button>
              </>
            )}
          </div>

          {/* 番茄树 */}
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", maxWidth: 280 }}>
            {Array.from({ length: todayCount }).map((_, i) => (
              <span key={i} style={{ fontSize: 20 }}>🍅</span>
            ))}
          </div>

          {/* 陪伴对话 */}
          {companion && (
            <div style={{ width: "100%", marginTop: 16 }}>
              <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "4px 4px" }}>
                {chat.map((m) => (
                  <div key={m.id} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                    <div style={{
                      padding: "7px 11px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.4,
                      background: m.role === "user" ? "#FF6B6B" : "rgba(0,0,0,0.06)",
                      color: m.role === "user" ? "#fff" : "#333",
                    }}>{m.text}</div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                  placeholder={`对${companion.name}说点什么…`}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 20, border: "1px solid rgba(0,0,0,0.1)", fontSize: 14 }}
                />
                <button type="button" onClick={handleSend} style={{ ...btnPrimary, padding: "8px 16px" }}>发送</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "noise" && (
        <div style={{ padding: "8px 16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, color: "#999", textAlign: "center" }}>可同时开启多个叠加混音</p>
          {settings.whiteNoise.map((ch) => {
            const meta = WHITE_NOISE_META[ch.id];
            return (
              <div key={ch.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 12, background: ch.enabled ? "rgba(255,107,107,0.08)" : "rgba(0,0,0,0.03)" }}>
                <button type="button" onClick={() => toggleNoise(ch.id)} style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer", opacity: ch.enabled ? 1 : 0.4 }}>{meta.icon}</button>
                <span style={{ width: 56, fontSize: 14, color: "#444" }}>{meta.label}</span>
                <input
                  type="range" min={0} max={1} step={0.05} value={ch.volume}
                  onChange={(e) => setNoiseVolume(ch.id, Number(e.target.value))}
                  disabled={!ch.enabled}
                  style={{ flex: 1 }}
                />
              </div>
            );
          })}
        </div>
      )}

      {tab === "stats" && (
        <div style={{ padding: "12px 16px 24px" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <StatCard label="今日番茄" value={`${todayCount}`} />
            <StatCard label="连续打卡" value={`${streak} 天`} />
          </div>
          <p style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>近 7 天</p>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140 }}>
            {dailyStats.map((d) => (
              <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 11, color: "#666" }}>{d.count || ""}</div>
                <div style={{
                  width: "70%", height: `${(d.count / maxCount) * 100}%`, minHeight: d.count ? 4 : 0,
                  background: "#FF6B6B", borderRadius: 4, transition: "height 0.3s",
                }} />
                <div style={{ fontSize: 10, color: "#999" }}>{d.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div style={{ padding: "12px 16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <NumberRow label="专注时长（分钟）" value={settings.focusMinutes} min={1} max={120}
            onChange={(v) => setSettings((s) => ({ ...s, focusMinutes: v }))} />
          <NumberRow label="短休息（分钟）" value={settings.shortBreakMinutes} min={1} max={60}
            onChange={(v) => setSettings((s) => ({ ...s, shortBreakMinutes: v }))} />
          <NumberRow label="长休息（分钟）" value={settings.longBreakMinutes} min={1} max={90}
            onChange={(v) => setSettings((s) => ({ ...s, longBreakMinutes: v }))} />
          <NumberRow label="几轮后长休息" value={settings.roundsBeforeLongBreak} min={2} max={8}
            onChange={(v) => setSettings((s) => ({ ...s, roundsBeforeLongBreak: v }))} />

          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 12 }}>
            <label style={{ fontSize: 14, color: "#444", display: "block", marginBottom: 6 }}>陪伴角色</label>
            <select
              value={settings.companionCharacterId ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, companionCharacterId: e.target.value || null }))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)", fontSize: 14 }}
            >
              <option value="">不选（纯计时）</option>
              {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <ToggleRow label="角色主动陪伴发消息" checked={settings.companionEnabled}
            onChange={(v) => setSettings((s) => ({ ...s, companionEnabled: v }))} />
          <NumberRow label="主动发消息间隔（分钟, 0=不主动）" value={settings.companionIntervalMinutes} min={0} max={30}
            onChange={(v) => setSettings((s) => ({ ...s, companionIntervalMinutes: v }))} />
          <ToggleRow label="对话同步到聊天记录" checked={settings.syncToChat}
            onChange={(v) => setSettings((s) => ({ ...s, syncToChat: v }))} />
          <ToggleRow label="专注沉淀进角色记忆库" checked={settings.syncToMemory}
            onChange={(v) => setSettings((s) => ({ ...s, syncToMemory: v }))} />

          <button type="button" onClick={() => setSettings({ ...DEFAULT_POMODORO_SETTINGS })}
            style={{ ...btnSecondary, marginTop: 4 }}>恢复默认设置</button>
        </div>
      )}
    </PageShell>
  );
}

const btnPrimary: React.CSSProperties = { padding: "10px 28px", borderRadius: 999, border: "none", background: "#FF6B6B", color: "#fff", fontSize: 15, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: "10px 28px", borderRadius: 999, border: "none", background: "rgba(0,0,0,0.08)", color: "#555", fontSize: 15, cursor: "pointer" };
const btnDanger: React.CSSProperties = { padding: "10px 28px", borderRadius: 999, border: "none", background: "rgba(211,47,47,0.12)", color: "#D32F2F", fontSize: 15, cursor: "pointer" };

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, padding: "14px", borderRadius: 14, background: "rgba(255,107,107,0.08)", textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 600, color: "#FF6B6B" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function NumberRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 14, color: "#444", flex: 1 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} style={stepBtn}>−</button>
        <span style={{ width: 36, textAlign: "center", fontSize: 15 }}>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} style={stepBtn}>+</button>
      </div>
    </div>
  );
}

const stepBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.06)", fontSize: 18, cursor: "pointer", color: "#555" };

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 14, color: "#444" }}>{label}</span>
      <button type="button" onClick={() => onChange(!checked)} style={{
        width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", position: "relative",
        background: checked ? "#FF6B6B" : "rgba(0,0,0,0.15)", transition: "background 0.2s",
      }}>
        <span style={{
          position: "absolute", top: 3, left: checked ? 23 : 3, width: 20, height: 20, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}
