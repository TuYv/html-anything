"use client";

import { useStore, selectActiveTask } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { Artifact } from "@/lib/artifacts/discover";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileUrl(taskId: string, a: Artifact): string {
  return `/api/artifacts/file?task=${encodeURIComponent(taskId)}&path=${encodeURIComponent(a.relPath)}`;
}

export function ArtifactCards() {
  const t = useT();
  const task = useStore(selectActiveTask);
  const artifacts = task?.artifacts ?? [];
  if (!task || artifacts.length === 0) return null;

  return (
    <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
      <p className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("artifacts.section")} · {artifacts.length}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {artifacts.map((a) => {
          const url = fileUrl(task.id, a);
          return (
            <li key={a.relPath} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
              {a.mime.startsWith("image/") ? (
                <img
                  src={url}
                  alt={a.name}
                  className="mb-2 max-h-40 w-full rounded-lg object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : a.mime.startsWith("video/") ? (
                <video
                  src={url}
                  controls
                  className="mb-2 max-h-40 w-full rounded-lg"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm" title={a.name}>{a.name}</span>
                <span className="shrink-0 text-xs text-neutral-400">{humanSize(a.size)}</span>
              </div>
              <a
                href={url}
                download={a.name}
                className="mt-2 inline-block rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
              >
                {t("artifacts.download")}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
