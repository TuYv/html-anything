"use client";

import { useEffect, useState } from "react";
import { useStore, selectActiveTask } from "@/lib/store";
import { getCachedTemplate } from "@/lib/templates";
import { useT } from "@/lib/i18n";
import type { ToolStatus } from "@/lib/tools/detect";

export function VideoToolsBanner() {
  const t = useT();
  const task = useStore(selectActiveTask);
  const [tools, setTools] = useState<ToolStatus[] | null>(null);

  useEffect(() => {
    void fetch("/api/tools")
      .then((r) => (r.ok ? r.json() : { tools: [] }))
      .then((j: { tools?: ToolStatus[] }) => setTools(j.tools ?? []))
      .catch(() => {});
  }, []);

  if (!task || !tools) return null;
  const tpl = getCachedTemplate(task.templateId);
  if (tpl?.scenario !== "video") return null;

  const missing = tools.filter((x) => (x.id === "ffmpeg" || x.id === "playwright") && !x.available);
  if (missing.length === 0) return null;

  return (
    <div className="border-y border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
      ⚠ {t("tools.videoMissing", { tools: missing.map((m) => m.label).join(" + ") })}
    </div>
  );
}
