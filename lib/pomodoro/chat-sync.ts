// lib/pomodoro/chat-sync.ts
// 把番茄钟专注期间的对话写进「与该角色的聊天记录」。
// 复用 float 现有的联系人/会话/消息三层结构（chat-storage）。

import {
  addChatContact,
  createOrGetSession,
  loadChatContacts,
  pushChatMessage,
} from "../chat-storage";

/**
 * 确保存在与该角色的会话，返回 sessionId。
 * 若该角色还不是联系人，会自动加为联系人（等同于聊天 app 里加好友）。
 */
export function ensureCharacterSession(characterId: string): string | null {
  if (!characterId) return null;
  try {
    let contact = loadChatContacts().find((c) => c.characterId === characterId) || null;
    if (!contact) {
      contact = addChatContact(characterId);
    }
    if (!contact) return null;
    const session = createOrGetSession(contact.id);
    return session?.id ?? null;
  } catch {
    return null;
  }
}

/** 把一条番茄钟对话写进聊天记录（role: assistant=角色, user=用户） */
export function appendPomodoroChatMessage(
  sessionId: string,
  role: "assistant" | "user",
  content: string,
): void {
  const text = content?.trim();
  if (!sessionId || !text) return;
  try {
    pushChatMessage({
      sessionId,
      role,
      content: text,
      status: role === "user" ? "read" : "sent",
      origin: "custom_app",
    });
  } catch {
    /* 同步失败不影响番茄钟本身 */
  }
}
