// components/chat/relationship-section.tsx —— 关系系统管理页（原生 PageShell UI）
import { useMemo, useState } from "react";
import {
    loadRelationshipState,
    saveRelationshipState,
    saveRelationshipConfig,
    loadRelationshipConfig,
    recordRelationshipChange,
    effectiveRelationshipLevels,
    type RelationshipLevel,
} from "@/lib/relationship-storage";

const BEHAVIOR_LIMIT = 600;

export function RelationshipManagerSection({
    sessionId,
    onChange,
}: {
    sessionId: string;
    onChange?: () => void;
}) {
    return <Inner key={sessionId} sessionId={sessionId} onChange={onChange} />;
}

function Inner({ sessionId, onChange }: { sessionId: string; onChange?: () => void }) {
    const [tick, setTick] = useState(0);
    const [customName, setCustomName] = useState("");
    const [editing, setEditing] = useState<string | null>(null);
    const [draftBehavior, setDraftBehavior] = useState("");

    const config = useMemo(() => {
        void tick;
        return loadRelationshipConfig(sessionId);
    }, [sessionId, tick]);

    const state = useMemo(() => {
        void tick;
        return loadRelationshipState(sessionId);
    }, [sessionId, tick]);

    const levels: RelationshipLevel[] = useMemo(() => {
        void tick;
        return effectiveRelationshipLevels(sessionId);
    }, [sessionId, tick]);

    const bump = () => {
        setTick(t => t + 1);
        onChange?.();
    };

    const switchTo = (name: string) => {
        saveRelationshipState(recordRelationshipChange(loadRelationshipState(sessionId), name, "manual"));
        bump();
    };

    const applyCustom = () => {
        const n = customName.trim();
        if (!n) return;
        switchTo(n);
        setCustomName("");
    };

    const toggleEnabled = () => {
        const cur = loadRelationshipConfig(sessionId);
        const base = cur.levels.length > 0 ? cur.levels : effectiveRelationshipLevels(sessionId);
        saveRelationshipConfig(sessionId, {
            levels: base,
            systemHint: cur.systemHint,
            enabled: cur.enabled === false,
        });
        bump();
    };

    const beginEdit = (lv: RelationshipLevel) => {
        setEditing(lv.name);
        setDraftBehavior(lv.behavior || "");
    };

    const saveBehavior = () => {
        if (!editing) return;
        const base = levels.map(l => ({ ...l }));
        const idx = base.findIndex(l => l.name === editing);
        if (idx >= 0) {
            const text = draftBehavior.trim().slice(0, BEHAVIOR_LIMIT);
            base[idx] = text ? { ...base[idx], behavior: text } : { name: base[idx].name, min: base[idx].min };
        }
        const cur = loadRelationshipConfig(sessionId);
        saveRelationshipConfig(sessionId, { levels: base, systemHint: cur.systemHint, enabled: cur.enabled });
        setEditing(null);
        bump();
    };

    const enabled = config.enabled !== false;

    return (
        <div className="page-menu chat-info-menu">
            {/* 开关 */}
            <div className="menu-group">
                <button className="menu-item" onClick={toggleEnabled}>
                    <div className="menu-label-group">
                        <span className="menu-label">关系影响对话</span>
                        <span className="menu-desc">
                            {enabled ? "已开启：当前关系会改变 TA 的说话方式" : "已关闭：关系只作标签，不注入提示词"}
                        </span>
                    </div>
                    <div className="menu-right">
                        <span className="menu-desc mr-1">{enabled ? "开" : "关"}</span>
                    </div>
                </button>
            </div>

            {/* 当前关系 + 切换 */}
            <div className="menu-group">
                <div className="menu-item" style={{ cursor: "default" }}>
                    <div className="menu-label-group">
                        <span className="menu-label">当前关系</span>
                        <span className="menu-desc">点下面任意一条直接切换</span>
                    </div>
                    <div className="menu-right">
                        <span className="menu-label">{state.level}</span>
                    </div>
                </div>
                {levels.map(lv => (
                    <button key={lv.name} className="menu-item" onClick={() => switchTo(lv.name)}>
                        <div className="menu-label-group">
                            <span className="menu-label">{lv.name}</span>
                            <span className="menu-desc">
                                好感度 ≥ {lv.min}
                                {lv.behavior ? " · 已设行为" : " · 未设行为"}
                            </span>
                        </div>
                        <div className="menu-right">
                            {state.level === lv.name && (
                                <span className="menu-desc mr-1" style={{ color: "var(--c-icon-active,#ff7aa2)" }}>
                                    ✓
                                </span>
                            )}
                            <button
                                type="button"
                                className="ui-btn ui-btn-ghost !px-2.5 !py-1 !text-[11px]"
                                onClick={e => {
                                    e.stopPropagation();
                                    beginEdit(lv);
                                }}
                            >
                                行为
                            </button>
                        </div>
                    </button>
                ))}
            </div>

            {/* 自定义关系 */}
            <div className="menu-group">
                <div className="menu-item" style={{ cursor: "default" }}>
                    <div className="menu-label-group">
                        <span className="menu-label">自定义关系</span>
                        <span className="menu-desc">输入任意关系名，直接设为当前关系</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-4 pb-3">
                    <input
                        type="text"
                        value={customName}
                        onChange={e => setCustomName(e.target.value)}
                        placeholder="如：未婚夫 / 师尊 / 宿敌"
                        className="ui-input flex-1 min-w-0"
                    />
                    <button
                        type="button"
                        disabled={!customName.trim()}
                        onClick={applyCustom}
                        className="ui-btn ui-btn-primary shrink-0"
                    >
                        设为当前
                    </button>
                </div>
            </div>

            {/* 行为编辑弹层 */}
            {editing !== null && (
                <div className="fixed inset-0 z-[10020] flex items-end justify-center bg-black/45 sm:items-center">
                    <div className="flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-[var(--c-page-body-bg)] text-[var(--c-text)] shadow-2xl sm:rounded-2xl">
                        <div className="px-5 pb-2 pt-4">
                            <div className="font-bold text-[var(--c-text-title)]">「{editing}」的行为规范</div>
                            <div className="menu-desc">
                                这段文字会原样注入提示词，决定该关系下 TA 的称呼、主动程度和肢体距离
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 pb-3">
                            <textarea
                                value={draftBehavior}
                                onChange={e => setDraftBehavior(e.target.value.slice(0, BEHAVIOR_LIMIT))}
                                rows={8}
                                placeholder="例如：直白、黏、占有欲外露。用亲昵称呼，主动撒娇，会吃醋会护短。"
                                className="ui-input w-full resize-none leading-6"
                            />
                            <div className="menu-desc mt-1 text-right">
                                {draftBehavior.length}/{BEHAVIOR_LIMIT}
                            </div>
                        </div>
                        <div className="flex gap-2 px-4 pb-4">
                            <button className="ui-btn ui-btn-ghost flex-1" onClick={() => setEditing(null)}>
                                取消
                            </button>
                            <button className="ui-btn ui-btn-primary flex-1" onClick={saveBehavior}>
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
