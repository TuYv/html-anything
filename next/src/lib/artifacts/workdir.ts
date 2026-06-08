import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Per-task working directory under `~/.html-anything/work/<taskId>/`. The agent
 * runs here (isolated from the app source tree) and writes deliverables to
 * `out/`. Overridable via `HTML_ANYTHING_WORK_ROOT` (used by tests).
 */
function workRoot(): string {
  return process.env.HTML_ANYTHING_WORK_ROOT || path.join(os.homedir(), ".html-anything", "work");
}

/** Allow only kebab/underscore/alnum ids — the first guard against traversal. */
export function sanitizeTaskId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error("invalid task id (must match [A-Za-z0-9_-])");
  }
  return id;
}

export function taskWorkdir(taskId: string): string {
  return path.join(workRoot(), sanitizeTaskId(taskId));
}

export function taskOutDir(taskId: string): string {
  return path.join(taskWorkdir(taskId), "out");
}

export function ensureWorkdir(taskId: string): { dir: string; outDir: string } {
  const dir = taskWorkdir(taskId);
  const outDir = path.join(dir, "out");
  fs.mkdirSync(outDir, { recursive: true });
  return { dir, outDir };
}

export function removeWorkdir(taskId: string): void {
  fs.rmSync(taskWorkdir(taskId), { recursive: true, force: true });
}

/**
 * Resolve a client-supplied relative path against the task's `out/` dir.
 * Returns the absolute path iff it stays inside `out/`; otherwise `null`.
 * Throws if the task id itself is invalid.
 */
export function safeResolveInOut(taskId: string, relPath: string): string | null {
  const outDir = taskOutDir(taskId);
  const resolved = path.resolve(outDir, relPath);
  if (resolved !== outDir && !resolved.startsWith(outDir + path.sep)) return null;
  return resolved;
}
