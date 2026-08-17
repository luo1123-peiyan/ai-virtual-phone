// lib/pomodoro/use-pomodoro.ts
"use client";
// 番茄钟核心计时逻辑：阶段流转、倒计时、完成记录、角色陪伴触发。

import { useCallback, useEffect, useRef, useState } from "react";
import type { Character } from "../character-types";
import { loadCharacters } from "../character-storage";
import { resolveUserIdentity } from "../settings-storage";
import type { PomodoroPhase, PomodoroSettings, PomodoroReward } from "./types";
import { addPomodoroRecord, grantPomodoroReward } from "./storage";
import {
  requestCompanionMessage,
  recordFocusMemory,
  type CompanionMoment,
} from "./companion";
import { makePomodoroLlm } from "./llm-bridge";
import { ensureCharacterSession, appendPomodoroChatMessage } from "./chat-sync";

export type CompanionChatItem = {
  id: string;
  role: "assistant" | "user";
  text: string;
  at: number;
};

type UsePomodoroArgs = {
  settings: PomodoroSettings;
  taskLabel: string;
};

function phaseDurationSec(phase: PomodoroPhase, s: PomodoroSettings): number {
  switch (phase) {
    case "focus": return Math.max(1, Math.round(s.focusMinutes * 60));
    case "shortBreak": return Math.max(1, Math.round(s.shortBreakMinutes * 60));
    case "longBreak": return Math.max(1, Math.round(s.longBreakMinutes * 60));
    default: return 0;
  }
}

export function usePomodoro({ settings, taskLabel }: UsePomodoroArgs) {
  const [phase, setPhase] = useState<PomodoroPhase>("idle");
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [round, setRound] = useState(1); // 当前第几轮 focus（1-based）
  const [completedFocus, setCompletedFocus] = useState(0); // 本次会话累计完成的 focus 数
  const [chat, setChat] = useState<CompanionChatItem[]>([]);
  const [lastReward, setLastReward] = useState<PomodoroReward | null>(null);

  // 后台可靠计时：记录当前阶段应结束的绝对时间戳，避免 setInterval 在后台被节流导致走时不准
  const phaseEndsAtRef = useRef<number | null>(null);

  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const taskRef = useRef(taskLabel);
  useEffect(() => { taskRef.current = taskLabel; }, [taskLabel]);

  const sessionIdRef = useRef<string>(`pomo_${Date.now()}`);
  const chatSessionIdRef = useRef<string | null>(null);
  const companionTimerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const getCompanion = useCallback((): Character | null => {
    const id = settingsRef.current.companionCharacterId;
    if (!id) return null;
    return loadCharacters().find((c) => c.id === id) || null;
  }, []);

  const userName = useCallback((): string => {
    const id = settingsRef.current.companionCharacterId || undefined;
    return resolveUserIdentity(id, "chat")?.name || "你";
  }, []);

  const pushCompanionSays = useCallback((text: string) => {
    if (!text?.trim()) return;
    setChat((prev) => [...prev, { id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, role: "assistant", text: text.trim(), at: Date.now() }]);
    if (settingsRef.current.syncToChat && chatSessionIdRef.current) {
      appendPomodoroChatMessage(chatSessionIdRef.current, "assistant", text.trim());
    }
  }, []);

  const triggerCompanion = useCallback(async (moment: CompanionMoment) => {
    const s = settingsRef.current;
    if (!s.companionEnabled) return;
    const character = getCompanion();
    if (!character) return;
    const llm = s.companionIntervalMinutes > 0 || moment !== "midway" ? makePomodoroLlm(character.id) : null;
    const text = await requestCompanionMessage(character, moment, llm);
    pushCompanionSays(text);
  }, [getCompanion, pushCompanionSays]);

  /** 用户在番茄钟里给角色发消息 */
  const sendUserMessage = useCallback(async (text: string) => {
    const clean = text?.trim();
    if (!clean) return;
    setChat((prev) => [...prev, { id: `u_${Date.now()}`, role: "user", text: clean, at: Date.now() }]);
    const s = settingsRef.current;
    if (s.syncToChat && chatSessionIdRef.current) {
      appendPomodoroChatMessage(chatSessionIdRef.current, "user", clean);
    }
    const character = getCompanion();
    if (!character || !s.companionEnabled) return;
    const llm = makePomodoroLlm(character.id);
    const reply = await requestCompanionMessage(character, "midway", llm, clean);
    pushCompanionSays(reply);
  }, [getCompanion, pushCompanionSays]);

  const clearCompanionTimer = useCallback(() => {
    if (companionTimerRef.current) {
      window.clearInterval(companionTimerRef.current);
      companionTimerRef.current = null;
    }
  }, []);

  const scheduleCompanion = useCallback(() => {
    clearCompanionTimer();
    const s = settingsRef.current;
    if (!s.companionEnabled || s.companionIntervalMinutes <= 0) return;
    const intervalMs = s.companionIntervalMinutes * 60 * 1000;
    companionTimerRef.current = window.setInterval(() => {
      void triggerCompanion("midway");
    }, intervalMs);
  }, [clearCompanionTimer, triggerCompanion]);

  const enterPhase = useCallback((next: PomodoroPhase) => {
    setPhase(next);
    const dur = phaseDurationSec(next, settingsRef.current);
    setRemaining(dur);
    phaseEndsAtRef.current = next === "idle" ? null : Date.now() + dur * 1000;
    if (next === "focus") {
      scheduleCompanion();
      void triggerCompanion("start");
    } else {
      clearCompanionTimer();
      if (next === "shortBreak" || next === "longBreak") {
        void triggerCompanion("breakStart");
      }
    }
  }, [scheduleCompanion, clearCompanionTimer, triggerCompanion]);

  /** 开始整个番茄钟会话 */
  const start = useCallback(() => {
    sessionIdRef.current = `pomo_${Date.now()}`;
    const s = settingsRef.current;
    if (s.syncToChat && s.companionCharacterId) {
      chatSessionIdRef.current = ensureCharacterSession(s.companionCharacterId);
    }
    setRound(1);
    setCompletedFocus(0);
    setChat([]);
    setRunning(true);
    enterPhase("focus");
  }, [enterPhase]);

  const pause = useCallback(() => { setRunning(false); clearCompanionTimer(); }, [clearCompanionTimer]);
  const resume = useCallback(() => {
    setRunning(true);
    if (phase === "focus") scheduleCompanion();
  }, [phase, scheduleCompanion]);

  const finishSessionMemory = useCallback((focusCount: number) => {
    const s = settingsRef.current;
    const character = getCompanion();
    if (!s.syncToMemory || !character || focusCount <= 0) return;
    recordFocusMemory({
      characterId: character.id,
      characterName: character.name,
      userName: userName(),
      sessionId: sessionIdRef.current,
      taskLabel: taskRef.current,
      totalMinutes: Math.round(focusCount * s.focusMinutes),
      rounds: focusCount,
    });
  }, [getCompanion, userName]);

  const stop = useCallback(() => {
    setRunning(false);
    clearCompanionTimer();
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    setCompletedFocus((c) => { finishSessionMemory(c); return c; });
    setPhase("idle");
    setRemaining(0);
  }, [clearCompanionTimer, finishSessionMemory]);

  /** 阶段结束时的流转 */
  const advancePhase = useCallback(() => {
    const s = settingsRef.current;
    if (phase === "focus") {
      // 记录一个完成的番茄
      const character = getCompanion();
      addPomodoroRecord({
        id: `rec_${Date.now()}`,
        taskLabel: taskRef.current,
        characterId: character?.id ?? null,
        focusSeconds: phaseDurationSec("focus", s),
        completedAt: new Date().toISOString(),
        round,
      });
      // 连续奖励：完成一个番茄掉落一枚可收集小物件
      const reward = grantPomodoroReward();
      if (reward) setLastReward(reward);
      const done = completedFocus + 1;
      setCompletedFocus(done);
      void triggerCompanion("nearEnd");
      const isLong = done % s.roundsBeforeLongBreak === 0;
      enterPhase(isLong ? "longBreak" : "shortBreak");
    } else {
      // 休息结束 → 下一轮 focus
      setRound((r) => r + 1);
      enterPhase("focus");
    }
  }, [phase, round, completedFocus, getCompanion, triggerCompanion, enterPhase]);

  // 倒计时 tick：以绝对结束时间戳为准计算剩余，后台被节流也不会走时不准
  useEffect(() => {
    if (!running || phase === "idle") return;
    if (phaseEndsAtRef.current == null) {
      phaseEndsAtRef.current = Date.now() + phaseDurationSec(phase, settingsRef.current) * 1000;
    }
    let advanced = false;
    const syncFromClock = () => {
      const endsAt = phaseEndsAtRef.current;
      if (endsAt == null) return;
      const secLeft = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setRemaining(secLeft);
      if (secLeft <= 0 && !advanced) {
        advanced = true;
        window.setTimeout(() => advancePhase(), 0);
      }
    };
    syncFromClock();
    tickRef.current = window.setInterval(syncFromClock, 1000);
    // 回到前台时立刻对表，纠正后台节流造成的偏差
    const onVisible = () => { if (document.visibilityState === "visible") syncFromClock(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running, phase, advancePhase]);

  useEffect(() => () => {
    clearCompanionTimer();
    if (tickRef.current) window.clearInterval(tickRef.current);
  }, [clearCompanionTimer]);

  const totalSec = phaseDurationSec(phase, settings);
  const progress = totalSec > 0 ? 1 - remaining / totalSec : 0;

  return {
    phase, remaining, running, round, completedFocus, chat, progress,
    lastReward, clearLastReward: () => setLastReward(null),
    start, pause, resume, stop, sendUserMessage,
  };
}
