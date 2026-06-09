"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { ToolStatus } from "@/lib/tools/detect";

export function ToolsStatus() {
  const t = useT();
  const [tools, setTools] = useState<ToolStatus[] | null>(null);

  useEffect(() => {
    void fetch("/api/tools")
      .then((r) => (r.ok ? r.json() : { tools: [] }))
      .then((j: { tools?: ToolStatus[] }) => setTools(j.tools ?? []))
      .catch(() => {});
  }, []);

  if (!tools) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("tools.section")}</p>
      <ul className="space-y-1 text-sm">
        {tools.map((tool) => (
          <li key={tool.id} className="flex items-center gap-2">
            <span className={tool.available ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400"}>
              {tool.available ? "✓" : "✗"}
            </span>
            <span>{tool.label}</span>
            {tool.path ? <span className="truncate text-xs text-neutral-400">{tool.path}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
