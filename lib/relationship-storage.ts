// lib/relationship-storage.ts
import { kvGet, kvSet, registerDynamicPrefix } from "./kv-db";

const RELATIONSHIP_PREFIX = "ai_phone_relationship:";
registerDynamicPrefix(RELATIONSHIP_PREFIX);

export type RelationshipLevel = {
    /** 关系名称，如 陌生 / 朋友 / 暧昧 / 恋人 */
    name: string;
    /** 好感度下限（达到即进入该等级）；最后一个等级可省略 min 表示无限上探 */
    min: number;
};

export type RelationshipMarkerEvent = {
    /** 触发的标记文本，如 恋人 */
    marker: string;
    /** 触发时间 ISO */
    at: string;
    /** 触发原因：ai（AI 在回复中输出了关系标记）/ manual（用户手动调整） */
    source: "ai" | "manual";
    /** 触发时好感度快照（可能为空） */
    affection?: number;
};

export type RelationshipState = {
    sessionId: string;
    /** 当前等级名称 */
    level: string;
    /** 等级历史，按时间倒序（首个为当前） */
    history: RelationshipMarkerEvent[];
};

export type RelationshipConfig = {
    /** 等级表（需按 min 升序）；空 = 未启用，用默认表 */
    levels: RelationshipLevel[];
    /** AI 表白判定输出标记的动作说明，写进提示词 */
    systemHint: string;
};

export const DEFAULT_RELATIONSHIP_LEVELS: RelationshipLevel[] = [
    { name: "陌生", min: 0 },
    { name: "熟人", min: 16 },
    { name: "朋友", min: 40 },
    { name: "知心", min: 60 },
    { name: "暧昧", min: 75 },

    { name: "恋人", min: 95 },
];

export const DEFAULT_RELATIONSHIP_SYSTEM_HINT =
    "关系规则：当你主动确认关系或接受对方确认（表白、答应在一起等）时，在本条回复末尾输出【关系确认：<等级名>】标记；除此之外不要输出该标记。未输出标记视为关系不变。";

export const RELATIONSHIP_MARKER_RE = /【关系确认[:：]\s*([^】\r\n]{1,24})】/;

function stateKey(sessionId: string): string {
    return `${RELATIONSHIP_PREFIX}${sessionId}`;
}
function configKey(sessionId: string): string {
    return `${RELATIONSHIP_PREFIX}${sessionId}:config`;
}

export function normalizeLevels(levels: unknown): RelationshipLevel[] {
    if (!Array.isArray(levels)) return [];
    const out: RelationshipLevel[] = [];
    for (const item of levels) {
        if (!item || typeof item !== "object") continue;
        const raw = item as Partial<RelationshipLevel>;
        const name = typeof raw.name === "string" ? raw.name.trim() : "";
        const min = Number(raw.min);
        if (!name || !Number.isFinite(min)) continue;
        out.push({ name, min });
    }
    out.sort((a, b) => a.min - b.min);
    return out;
}

export function loadRelationshipConfig(sessionId: string): RelationshipConfig {
    const raw = typeof window === "undefined" ? null : kvGet(configKey(sessionId));
    if (!raw) {
        return { levels: [], systemHint: "" };
    }
    try {
        const parsed = JSON.parse(raw) as Partial<RelationshipConfig>;
        return {
            levels: normalizeLevels(parsed.levels),
            systemHint: typeof parsed.systemHint === "string" ? parsed.systemHint : "",
        };
    } catch {
        return { levels: [], systemHint: "" };
    }
}

export function saveRelationshipConfig(sessionId: string, config: RelationshipConfig): void {
    if (typeof window === "undefined") return;
    kvSet(configKey(sessionId), JSON.stringify(config));
}

export function effectiveRelationshipLevels(sessionId: string): RelationshipLevel[] {
    const custom = loadRelationshipConfig(sessionId).levels;
    return custom.length > 0 ? custom : DEFAULT_RELATIONSHIP_LEVELS;
}

export function loadRelationshipState(sessionId: string): RelationshipState {
    const raw = typeof window === "undefined" ? null : kvGet(stateKey(sessionId));
    if (raw) {
        try {
            const parsed = JSON.parse(raw) as Partial<RelationshipState>;
            if (typeof parsed.level === "string") {
                return {
                    sessionId,
                    level: parsed.level,
                    history: Array.isArray(parsed.history) ? parsed.history.filter(h => h && typeof h.marker === "string") : [],
                };
            }
        } catch { /* fallthrough */ }
    }
    // 默认取等级表最低档
    const level = effectiveRelationshipLevels(sessionId)[0]?.name || "陌生";
    return { sessionId, level, history: [] };
}

export function saveRelationshipState(state: RelationshipState): void {
    if (typeof window === "undefined") return;
    kvSet(stateKey(state.sessionId), JSON.stringify(state));
}

/** 根据好感度推导当前等级（无每日上限，直接对照等级表） */
export function levelFromAffection(levels: RelationshipLevel[], affection: number): string {
    let current = levels[0]?.name || "陌生";
    for (const lv of levels) {
        if (affection >= lv.min) current = lv.name;
    }
    return current;
}

/** 记录一次关系变更（越级跳转或 AI 标记） */
export function recordRelationshipChange(
    state: RelationshipState,
    marker: string,
    source: "ai" | "manual",
    affection?: number,
): RelationshipState {
    const event: RelationshipMarkerEvent = { marker, at: new Date().toISOString(), source, affection };
    return {
        ...state,
        level: marker,
        history: [event, ...state.history].slice(0, 200),
    };
}

/** 从一条 AI 回复文本中提取关系确认标记 */
export function extractRelationshipMarker(aiText: string): string | null {
    if (!aiText) return null;
    const match = aiText.match(RELATIONSHIP_MARKER_RE);
    const value = match?.[1]?.trim();
    return value || null;
}

/** 生成注入提示词的关系行（每轮对话拼进 system prompt） */
export function buildRelationshipPromptLine(sessionId: string, affection?: number): string {
    const state = loadRelationshipState(sessionId);
    const config = loadRelationshipConfig(sessionId);
    const hint = config.systemHint || DEFAULT_RELATIONSHIP_SYSTEM_HINT;
    const levels = effectiveRelationshipLevels(sessionId);
    const ladder = levels.map(l => `${l.name}(${l.min})`).join(" / ");
    const affectionPart = Number.isFinite(affection) ? `，当前好感度约 ${affection}` : "";
    return `【关系系统】你与用户当前关系：${state.level}${affectionPart}。关系等级：${ladder}。${hint}`;
}
