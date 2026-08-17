// lib/pomodoro/llm-bridge.ts
// 复用 float 现有的 API 配置与绑定级联，为番茄钟角色陪伴提供一个
// 简单的「发一批消息拿一段文本」的调用函数。省钱、失败静默回退。

import { simpleLLMCall } from "../api-helpers";
import { loadApiConfigs, loadBindingConfig, resolveBinding } from "../settings-storage";
import type { ApiConfig } from "../settings-types";

/** 按「角色 → 聊天 app」的绑定级联解析出该用哪个 API 配置 */
function resolveApiConfigForCharacter(characterId?: string): ApiConfig | null {
  try {
    const configs = loadApiConfigs();
    if (configs.length === 0) return null;
    const binding = loadBindingConfig();
    const slot = resolveBinding(binding, characterId, "chat");
    if (slot.apiConfigId) {
      const found = configs.find((c) => c.id === slot.apiConfigId);
      if (found) return found;
    }
    if (binding.globalDefaults.apiConfigId) {
      const found = configs.find((c) => c.id === binding.globalDefaults.apiConfigId);
      if (found) return found;
    }
    return configs[0];
  } catch {
    return null;
  }
}

export type PomodoroLlmFn = (
  messages: { role: string; content: string }[],
  options?: { maxTokens?: number },
) => Promise<string>;

/**
 * 构造一个绑定了角色 API 配置的 LLM 调用函数。
 * 若没有任何可用配置，返回 null，调用方会自动回退到预设文案。
 */
export function makePomodoroLlm(characterId?: string): PomodoroLlmFn | null {
  const config = resolveApiConfigForCharacter(characterId);
  if (!config) return null;
  return async (messages, options) => {
    const res = await simpleLLMCall(config, messages, {
      temperature: 0.9,
      max_tokens: options?.maxTokens ?? 120,
    });
    if (res.error || !res.content) throw new Error(res.error || "empty");
    return res.content;
  };
}
