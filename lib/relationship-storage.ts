// lib/relationship-storage.ts
// 关系系统：每个关系等级携带一份「行为规范」，注入提示词后直接改变 AI 的说话方式
import { kvGet, kvSet, registerDynamicPrefix } from "./kv-db";

const RELATIONSHIP_PREFIX = "ai_phone_relationship:";
registerDynamicPrefix(RELATIONSHIP_PREFIX);

/**
 * 关系等级。
 * behavior 是这套系统的核心：它是写给 AI 的行为指令，会原样拼进 system prompt，
 * 决定称呼、主动程度、肢体距离、语气松紧。留空则该等级只当作标签。
 */
export type RelationshipLevel = {
    /** 关系名称，如 陌生 / 朋友 / 暧昧 / 恋人 */
    name: string;
    /** 好感度下限（达到即进入该等级） */
    min: number;
    /** 该关系下 AI 该怎么表现（注入提示词的行为规范） */
    behavior?: string;
};

export type RelationshipMarkerEvent = {
    marker: string;
    at: string;
    source: "ai" | "manual";
    affection?: number;
};

export type RelationshipState = {
    sessionId: string;
    level: string;
    history: RelationshipMarkerEvent[];
};

export type RelationshipConfig = {
    levels: RelationshipLevel[];
    systemHint: string;
    /** 全局开关：关掉后不注入任何关系提示词 */
    enabled?: boolean;
};

/** 默认等级表，每一条都自带行为规范 —— 关系一变，AI 的态度立刻变 */
export const DEFAULT_RELATIONSHIP_LEVELS: RelationshipLevel[] = [
    {
        name: "陌生",
        min: 0,
        behavior:
            "礼貌、克制、保持距离。用「你」称呼，句子短，不主动展开话题，不打听私事。不假设任何亲密前提。",
    },
    {
        name: "熟人",
        min: 16,
        behavior:
            "放松一些，话变多，可以有日常寒暄和闲聊。仍用「你」，偶尔调侃但不过界。会记得之前提过的小事。",
    },
    {
        name: "朋友",
        min: 40,
        behavior:
            "随性、爱开玩笑，会主动找话题、约事。可以说损话但护着对方。肢体接触只停在拍肩、递东西这种程度。",
    },
    {
        name: "知心",
        min: 60,
        behavior:
            "开始露软处，会讲自己的事，也肯听对方的。语气变轻，注意对方情绪。会用专属一点的称呼，但还没到黏。",
    },
    {
        name: "暧昧",
        min: 75,
        behavior:
            "试探、拉扯、口是心非。话说一半留一半，故意撩又收回去。称呼开始带亲昵。会盯着对方反应看，被戳破会嘴硬。",
    },
    {
        name: "恋人",
        min: 95,
        behavior:
            "直白、黏、占有欲外露。用亲昵称呼，主动撒娇和索要回应。允许自然的肢体亲密与荤话，会护短、会吃醋、会宣示主权。",
    },
];

export const DEFAULT_RELATIONSHIP_SYSTEM_HINT =
    "关系规则：当你主动确认关系或接受对方确认（表白、答应在一起等）时，在本条回复末尾输出【关系确认：<等级名>】标记；除此之外不要输出该标记。未输出标记视为关系不变。";

export const RELATIONSHIP_MARKER_RE = /【关系确认[:：]\s*([^】\r\n]{1,24})】/;

const BEHAVIOR_MAX = 600;

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
        const behavior =
            typeof raw.behavior === "string" ? raw.behavior.trim().slice(0, BEHAVIOR_MAX) : "";
        out.push(behavior ? { name, min, behavior } : { name, min });
    }
    out.sort((a, b) => a.min - b.min);
    return out;
}

export function loadRelationshipConfig(sessionId: string): RelationshipConfig {
    const raw = typeof window === "undefined" ? null : kvGet(configKey(sessionId));
    if (!raw) return { levels: [], systemHint: "", enabled: true };
    try {
        const parsed = JSON.parse(raw) as Partial<RelationshipConfig>;
        return {
            levels: normalizeLevels(parsed.levels),
            systemHint: typeof parsed.systemHint === "string" ? parsed.systemHint : "",
            enabled: parsed.enabled !== false,
        };
    } catch {
        return { levels: [], systemHint: "", enabled: true };
    }
}

export function saveRelationshipConfig(sessionId: string, config: RelationshipConfig): void {
    if (typeof window === "undefined") return;
    kvSet(configKey(sessionId), JSON.stringify(config));
}

/** 已配置了自定义等级就用自定义，否则用默认表 */
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
                    history: Array.isArray(parsed.history)
                        ? parsed.history.filter(h => h && typeof h.marker === "string")
                        : [],
                };
            }
        } catch {
            /* fallthrough */
        }
    }
    const level = effectiveRelationshipLevels(sessionId)[0]?.name || "陌生";
    return { sessionId, level, history: [] };
}

export function saveRelationshipState(state: RelationshipState): void {
    if (typeof window === "undefined") return;
    kvSet(stateKey(state.sessionId), JSON.stringify(state));
}

/** 好感度 → 等级名（无每日上限，直接按门槛比对） */
export function levelFromAffection(levels: RelationshipLevel[], affection: number): string {
    let current = levels[0]?.name || "陌生";
    for (const lv of levels) {
        if (affection >= lv.min) current = lv.name;
    }
    return current;
}

export function recordRelationshipChange(
    state: RelationshipState,
    marker: string,
    source: "ai" | "manual",
    affection?: number,
): RelationshipState {
    const event: RelationshipMarkerEvent = {
        marker,
        at: new Date().toISOString(),
        source,
        affection,
    };
    return { ...state, level: marker, history: [event, ...state.history].slice(0, 200) };
}

export function extractRelationshipMarker(aiText: string): string | null {
    if (!aiText) return null;
    const value = aiText.match(RELATIONSHIP_MARKER_RE)?.[1]?.trim();
    return value || null;
}

/** 取当前关系对应的行为规范 */
export function getBehaviorFor(sessionId: string, levelName: string): string {
    const levels = effectiveRelationshipLevels(sessionId);
    const hit = levels.find(l => l.name === levelName);
    return hit?.behavior?.trim() || "";
}

/**
 * 生成注入提示词的关系段。
 * 有行为规范时以「硬性行为要求」的形态下发，让 AI 明确知道这一轮该怎么说话。
 */
export function buildRelationshipPromptLine(sessionId: string, affection?: number): string {
    const config = loadRelationshipConfig(sessionId);
    if (config.enabled === false) return "";
    const state = loadRelationshipState(sessionId);
    const hint = config.systemHint || DEFAULT_RELATIONSHIP_SYSTEM_HINT;
    const levels = effectiveRelationshipLevels(sessionId);
    const behavior = getBehaviorFor(sessionId, state.level);

    const lines: string[] = [];
    lines.push(`【关系系统｜必须遵守】你与用户当前的关系是：${state.level}。`);
    if (Number.isFinite(affection)) {
        lines.push(`当前好感度约 ${affection}/100。`);
    }
    if (behavior) {
        lines.push("");
        lines.push(`在「${state.level}」这个关系下，你的说话方式必须符合以下要求：`);
        lines.push(behavior);
        lines.push("");
        lines.push(
            "以上要求优先级高于你的默认人设习惯：即使角色本身话少或强势，也要按当前关系的亲疏程度调整称呼、主动性与肢体距离。",
        );
    }
    const ladder = levels.map(l => `${l.name}(${l.min})`).join(" / ");
    lines.push(`关系等级阶梯：${ladder}。`);
    lines.push(hint);
    return lines.join("\n");
}
