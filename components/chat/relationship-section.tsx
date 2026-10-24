// 关系系统 UI 片段（聊天信息页嵌入）：等级/好感度手动调整 + 等级表自定义
import { useMemo, useState } from "react";
import { loadRelationshipState, saveRelationshipState, loadRelationshipConfig, saveRelationshipConfig, effectiveRelationshipLevels, recordRelationshipChange, levelFromAffection, type RelationshipLevel } from "@/lib/relationship-storage";

export function RelationshipManagerSection({ sessionId, onChange }: { sessionId: string; onChange?: () => void }) {
  return <RelationshipManagerSectionInner key={sessionId} sessionId={sessionId} onChange={onChange} />;
}

function RelationshipManagerSectionInner({ sessionId, onChange }: { sessionId: string; onChange?: () => void }) {
  const [state, setState] = useState(() => loadRelationshipState(sessionId));
  const [expanded, setExpanded] = useState("none" as "none" | "adjust" | "levels");
  const [customLevels, setCustomLevels] = useState<RelationshipLevel[]>(() => loadRelationshipConfig(sessionId).levels);

  const levels = useMemo(
    () => (customLevels.length > 0 ? customLevels : effectiveRelationshipLevels(sessionId)),
    [customLevels, sessionId]
  );

  const switchToLevel = (name: string) => {
    let next = recordRelationshipChange(state, name, "manual");
    saveRelationshipState(next);
    setState(next);
    onChange?.();
  };

  const setAffection = (num: number) => {
    const target = levelFromAffection(levels, num);
    let next = state;
    if (num < 0) num = 0; if (num > 100) num = 100;
    if (target !== state.level) next = recordRelationshipChange({ ...state }, target, "manual", num);
    saveRelationshipState(next);
    setState(next);
    onChange?.();
  };

  const saveLevels = () => {
    saveRelationshipConfig(sessionId, { levels: customLevels, systemHint: "" });
    setExpanded("none");
    onChange?.();
  };

  return (
    <div className="menu-group">
      {expanded === "none" && (
        <button className="menu-item" onClick={() => setExpanded("adjust")}>
          <span className="menu-label-group">
            <span className="menu-label">当前关系</span>
            <span className="menu-desc">{state.level}</span>
          </span>
          <span className="menu-right" />
        </button>
      )}
      {expanded === "adjust" && (
        <div className="menu-group">
          <div className="flex flex-wrap gap-1.5 px-8">
            {levels.map(l => (
              <button
                key={l.name}
                onClick={() => switchToLevel(l.name)}
                className={`ui-btn ${state.level === l.name ? "ui-btn-primary" : "ui-btn-ghost"} !px-3 !py-1.5 !text-[12px]`}
              >{l.name}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-8">
            <input
              type="number" min={0} max={100} placeholder="好感度 0~100"
              className="ui-input !w-24"
              onKeyDown={e => { if (e.key === "Enter") { const v = parseInt((e.target as HTMLInputElement).value, 10); if (!isNaN(v)) setAffection(v); } }}
            />
            <button className="ui-btn ui-btn-ghost !px-3 !py-1.5 !text-[12px]" onClick={() => setExpanded("none")}>收起</button>
          </div>
        </div>
      )}
      <button className="menu-item" onClick={() => setExpanded(expanded === "levels" ? "none" : "levels")}>
        <span className="menu-label-group"><span className="menu-label">关系等级表</span></span>
        <span className="menu-right">
          <span className="menu-desc mr-1">{levels.map(l => l.name).slice(0, 3).join("→")}…</span>
        </span>
      </button>
      {expanded === "levels" && (
        <div className="flex flex-col gap-1.5 px-8">
          {customLevels.map((lv, i) => (
            <div key={i} className="flex gap-1.5">
              <input
                value={lv.name}
                onChange={e => setCustomLevels(customLevels.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                className="ui-input flex-1" placeholder="名称"
              />
              <input
                type="number" value={lv.min}
                onChange={e => setCustomLevels(customLevels.map((x, j) => j === i ? { ...x, min: parseInt(e.target.value, 10) || 0 } : x))}
                className="ui-input !w-20" placeholder="min"
              />
              <button
                onClick={() => setCustomLevels(customLevels.filter((_, j) => j !== i))}
                className="ui-btn ui-btn-ghost !px-3 !py-1.5">—</button>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              className="ui-btn ui-btn-ghost !px-3 !py-1.5"
              onClick={() => setCustomLevels([...customLevels, { name: "新等级", min: 100 }])}
            >+ 添加等级</button>
            <button className="ui-btn ui-btn-primary !px-3 !py-1.5" onClick={saveLevels}>保存</button>
          </div>
        </div>
      )}
    </div>
  );
}
