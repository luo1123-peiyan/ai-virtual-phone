"use client";

import { useMemo, useState } from "react";
import {
  ExternalLink,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Save,
  Settings2,
  Wine,
} from "lucide-react";

import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";
import { PageShell } from "@/components/ui/page-shell";

const TAVERN_SETTINGS_KEY = "ai_phone_tavern_settings_v1";
const DEFAULT_TAVERN_URL = "http://127.0.0.1:8000";

registerKvMigration(TAVERN_SETTINGS_KEY);

type TavernSettings = {
  enabled: boolean;
  url: string;
};

type TavernAppProps = {
  onClose: () => void;
};

function loadTavernSettings(): TavernSettings {
  const raw = kvGet(TAVERN_SETTINGS_KEY);
  if (!raw) return { enabled: false, url: DEFAULT_TAVERN_URL };

  try {
    const parsed = JSON.parse(raw) as Partial<TavernSettings>;
    return {
      enabled: parsed.enabled === true,
      url: typeof parsed.url === "string" && parsed.url.trim()
        ? parsed.url.trim()
        : DEFAULT_TAVERN_URL,
    };
  } catch {
    return { enabled: false, url: DEFAULT_TAVERN_URL };
  }
}

function normalizeTavernUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function TavernApp({ onClose }: TavernAppProps) {
  const [settings, setSettings] = useState<TavernSettings>(loadTavernSettings);
  const [draftUrl, setDraftUrl] = useState(settings.url);
  const [draftEnabled, setDraftEnabled] = useState(settings.enabled);
  const [editing, setEditing] = useState(!settings.enabled);
  const [error, setError] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const [frameLoading, setFrameLoading] = useState(settings.enabled);

  const hostLabel = useMemo(() => {
    try {
      return new URL(settings.url).host;
    } catch {
      return settings.url;
    }
  }, [settings.url]);

  function openExternal(url: string) {
    const normalized = normalizeTavernUrl(url);
    if (!normalized) return;
    window.open(normalized, "_blank", "noopener,noreferrer");
  }

  function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUrl = normalizeTavernUrl(draftUrl);

    if (!normalizedUrl) {
      setError("请输入有效的 http 或 https 地址");
      return;
    }

    const next = { enabled: draftEnabled, url: normalizedUrl };
    kvSet(TAVERN_SETTINGS_KEY, JSON.stringify(next));
    setSettings(next);
    setDraftUrl(normalizedUrl);
    setError("");

    if (next.enabled) {
      setFrameLoading(true);
      setFrameKey((value) => value + 1);
      setEditing(false);
    }
  }

  function startEditing() {
    setDraftUrl(settings.url);
    setDraftEnabled(settings.enabled);
    setError("");
    setEditing(true);
  }

  if (editing || !settings.enabled) {
    return (
      <PageShell title="酒馆设置" onBack={onClose}>
        <form className="mx-auto flex min-h-full w-full max-w-md flex-col" onSubmit={saveSettings}>
          <div className="flex items-center gap-3 border-b border-black/10 px-5 py-5 dark:border-white/10">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white">
              <Wine size={23} strokeWidth={1.8} aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="text-base font-semibold">酒馆</div>
              <div className="mt-0.5 text-sm opacity-55">SillyTavern</div>
            </div>
          </div>

          <div className="border-b border-black/10 px-5 py-5 dark:border-white/10">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium" htmlFor="tavern-url">
              <Globe2 size={17} strokeWidth={1.8} aria-hidden />
              酒馆地址
            </label>
            <input
              id="tavern-url"
              className="h-11 w-full rounded-md border border-black/15 bg-black/[0.03] px-3 text-base outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15 dark:border-white/15 dark:bg-white/[0.06]"
              value={draftUrl}
              onChange={(event) => {
                setDraftUrl(event.target.value);
                if (error) setError("");
              }}
              placeholder={DEFAULT_TAVERN_URL}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          </div>

          <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 dark:border-white/10">
            <div>
              <div className="text-sm font-medium">启用酒馆</div>
              <div className="mt-0.5 text-xs opacity-50">{draftEnabled ? "已启用" : "已停用"}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draftEnabled}
              aria-label="启用酒馆"
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${draftEnabled ? "bg-rose-600" : "bg-black/20 dark:bg-white/25"}`}
              onClick={() => setDraftEnabled((value) => !value)}
            >
              <span
                className={`absolute top-0.5 size-6 rounded-full bg-white shadow-sm transition-transform ${draftEnabled ? "translate-x-[22px]" : "translate-x-0.5"}`}
              />
            </button>
          </div>

          <div className="mt-auto grid gap-3 px-5 py-5">
            <button
              type="submit"
              className="flex h-11 items-center justify-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white transition active:bg-rose-700"
            >
              <Save size={18} strokeWidth={1.8} aria-hidden />
              {draftEnabled ? "保存并进入" : "保存设置"}
            </button>
            <button
              type="button"
              className="flex h-11 items-center justify-center gap-2 rounded-md border border-black/15 px-4 text-sm font-medium transition active:bg-black/5 dark:border-white/15 dark:active:bg-white/10"
              onClick={() => openExternal(draftUrl)}
            >
              <ExternalLink size={18} strokeWidth={1.8} aria-hidden />
              在浏览器打开
            </button>
          </div>
        </form>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="酒馆"
      onBack={onClose}
      rightAction={(
        <button
          type="button"
          className="page-back-btn"
          onClick={startEditing}
          aria-label="酒馆设置"
          title="酒馆设置"
        >
          <Settings2 size={21} strokeWidth={1.7} />
        </button>
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-black/10 px-3 dark:border-white/10">
          <span className="min-w-0 truncate text-xs opacity-55">{hostLabel}</span>
          <div className="ml-3 flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-md transition active:bg-black/10 dark:active:bg-white/10"
              onClick={() => {
                setFrameLoading(true);
                setFrameKey((value) => value + 1);
              }}
              aria-label="刷新酒馆"
              title="刷新"
            >
              <RefreshCw size={18} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-md transition active:bg-black/10 dark:active:bg-white/10"
              onClick={() => openExternal(settings.url)}
              aria-label="在浏览器打开酒馆"
              title="在浏览器打开"
            >
              <ExternalLink size={18} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-white">
          {frameLoading ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white text-zinc-500">
              <LoaderCircle className="animate-spin" size={24} strokeWidth={1.7} aria-hidden />
            </div>
          ) : null}
          <iframe
            key={frameKey}
            className="h-full w-full border-0 bg-white"
            src={settings.url}
            title="SillyTavern 酒馆"
            allow="clipboard-read; clipboard-write; microphone; camera; fullscreen"
            onLoad={() => setFrameLoading(false)}
          />
        </div>
      </div>
    </PageShell>
  );
}
