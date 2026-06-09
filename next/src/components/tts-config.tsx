"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

type PublicTtsConfig = {
  configured: boolean;
  endpoint: string;
  model: string;
  voice: string;
  apiKeyMask: string;
};

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function TtsConfig() {
  const t = useT();
  const [cfg, setCfg] = useState<PublicTtsConfig | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [voice, setVoice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/tts/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: PublicTtsConfig | null) => {
        if (!j) return;
        setCfg(j);
        setEndpoint(j.endpoint);
        setModel(j.model);
        setVoice(j.voice);
        setApiKey(j.configured ? j.apiKeyMask : "");
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/tts/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint, apiKey, model, voice }),
      });
      if (r.ok) {
        const j = (await r.json()) as PublicTtsConfig;
        setCfg(j);
        setApiKey(j.configured ? j.apiKeyMask : "");
      }
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    const r = await fetch("/api/tts/config", { method: "DELETE" });
    if (r.ok) {
      const j = (await r.json()) as PublicTtsConfig;
      setCfg(j);
      setEndpoint("");
      setApiKey("");
      setModel("");
      setVoice("");
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("tts.section")}</p>
      <input className={inputCls} placeholder={t("tts.endpoint")} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
      <input className={inputCls} type="password" placeholder={t("tts.apiKey")} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      <div className="flex gap-2">
        <input className={inputCls} placeholder={t("tts.model")} value={model} onChange={(e) => setModel(e.target.value)} />
        <input className={inputCls} placeholder={t("tts.voice")} value={voice} onChange={(e) => setVoice(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
          {t("tts.save")}
        </button>
        {cfg?.configured ? (
          <button onClick={clear} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700">
            {t("tts.clear")}
          </button>
        ) : null}
      </div>
      <p className="text-xs text-neutral-400">{t("tts.hint")}</p>
    </div>
  );
}
