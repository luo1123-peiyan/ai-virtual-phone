// lib/pomodoro/companion.ts
// 番茄钟角色陪伴：
//  1) 向指定角色请求一条主动陪伴消息（真 AI 生成，失败时回退到预设文案）
//  2) 把专注对话写进与角色的聊天记录
//  3) 把专注事件沉淀进角色记忆库（复用共创投影事件机制）

import type { Character } from "../character-types";
import { recordCoCreateProjectionEvent } from "../cocreate-memory";

export type CompanionMoment = "start" | "midway" | "nearEnd" | "breakStart" | "complete";

// ── 预设文案库（AI 不可用 / 省钱时回退） ──

const FALLBACK_LINES: Record<CompanionMoment, string[]> = {
  start: [
    "开始啦，我在旁边陪着你，加油哦~",
    "专注时间到，我就坐你旁边，别分心~",
    "来，我们一起认真这一会儿，我盯着你呢。",
  ],
  midway: [
    "专注得好认真，我都看呆了。",
    "做得很好，要不要动一动肩膀？",
    "我一直在这儿，你安心做你的。",
    "喝口水吧，别渴着了。",
  ],
  nearEnd: [
    "快啦，再坚持一小会儿就能休息了~",
    "最后一点点，撑住，我陪你到最后。",
    "马上就好，你今天真的很棒。",
  ],
  breakStart: [
    "辛苦啦！起来伸个懒腰，我给你揉揉肩。",
    "休息时间~ 靠过来歇会儿，别看屏幕了。",
    "这一轮结束了，乖，喝口热的。",
  ],
  complete: [
    "全部完成啦！我家小朋友太厉害了。",
    "收工！今天专注得漂亮，抱一个。",
    "结束咯，你做到了，我很骄傲。",
  ],
};

export function pickFallbackLine(moment: CompanionMoment): string {
  const lines = FALLBACK_LINES[moment];
  return lines[Math.floor(Math.random() * lines.length)];
}

// ── 组装给 AI 的提示词 ──

function buildSystemPrompt(character: Character): string {
  const persona = character.persona?.trim() || "";
  const personality = character.personality?.trim() || "";
  return [
    `你正在扮演「${character.name}」，陪伴用户使用番茄钟专注学习/工作。`,
    persona ? `【人设】${persona}` : "",
    personality ? `【性格】${personality}` : "",
    "要求：以第一人称、口语化地发一条【很短】的陪伴消息（30字以内），",
    "贴合角色性格，像恋人/伙伴在旁边陪读，不要旁白、不要动作描写括号、不要emoji堆砌。",
  ]
    .filter(Boolean)
    .join("\n");
}

const MOMENT_HINT: Record<CompanionMoment, string> = {
  start: "用户刚开始一轮专注，给一句开场的鼓励。",
  midway: "用户正在专注中，给一句陪伴或关心（喝水/坐姿/眼睛）。",
  nearEnd: "这轮专注快结束了，给一句撑住的鼓励。",
  breakStart: "专注结束进入休息，给一句放松/关心的话。",
  complete: "用户完成了全部番茄钟，给一句祝贺和宠溺。",
};

type ChatCompletionFn = (
  messages: { role: string; content: string }[],
  options?: { maxTokens?: number },
) => Promise<string>;

/**
 * 请求一条角色陪伴消息。
 * @param llm   实际调用 LLM 的函数（由 UI 层注入，复用 float 现有的聊天引擎/中转站配置）
 * @param userText 若用户刚发了消息，则带上，让角色回应；否则为空即主动发
 */
export async function requestCompanionMessage(
  character: Character,
  moment: CompanionMoment,
  llm: ChatCompletionFn | null,
  userText?: string,
): Promise<string> {
  if (!llm) return pickFallbackLine(moment);
  try {
    const system = buildSystemPrompt(character);
    const userPrompt = userText?.trim()
      ? `用户对你说：「${userText.trim()}」。请以${character.name}的身份自然地回一句短消息。`
      : MOMENT_HINT[moment];
    const reply = await llm(
      [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      { maxTokens: 120 },
    );
    const cleaned = reply?.trim();
    return cleaned || pickFallbackLine(moment);
  } catch {
    return pickFallbackLine(moment);
  }
}

// ── 记忆沉淀 ──

/**
 * 番茄钟结束后，把这次专注写成一条角色记忆事件。
 * 复用共创的投影事件机制（recordCoCreateProjectionEvent），
 * 它会被记忆系统按角色汇总进长期/核心记忆。
 */
export function recordFocusMemory(params: {
  characterId: string;
  characterName: string;
  userName: string;
  sessionId: string;
  taskLabel: string;
  totalMinutes: number;
  rounds: number;
}): void {
  const { characterId, characterName, userName, sessionId, taskLabel, totalMinutes, rounds } = params;
  if (!characterId) return;
  const taskText = taskLabel?.trim() ? `「${taskLabel.trim()}」` : "专注任务";
  const memory = `${userName}用番茄钟完成了${taskText}，共专注 ${totalMinutes} 分钟、${rounds} 个番茄钟，全程由${characterName}陪伴。`;
  recordCoCreateProjectionEvent({
    sessionId,
    characterId,
    title: "番茄钟陪伴专注",
    partnerName: characterName,
    userName,
    memory,
  });
}
