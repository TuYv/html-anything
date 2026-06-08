import fs from "node:fs";
import path from "node:path";
import { taskOutDir } from "./workdir";

export type Artifact = {
  /** Base filename. */
  name: string;
  /** Path relative to `out/` (POSIX-or-native sep; used as the `path` query). */
  relPath: string;
  /** Bytes. */
  size: number;
  /** Best-effort MIME from the extension. */
  mime: string;
};

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

export function mimeForExt(name: string): string {
  return MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

/** List files in the task's `out/` dir, recursively (max depth 3). */
export function listArtifacts(taskId: string): Artifact[] {
  const outDir = taskOutDir(taskId);
  const out: Artifact[] = [];
  const walk = (dir: string, rel: string, depth: number): void => {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const abs = path.join(dir, ent.name);
      const relPath = rel ? path.join(rel, ent.name) : ent.name;
      if (ent.isDirectory()) {
        walk(abs, relPath, depth + 1);
      } else if (ent.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(abs).size;
        } catch {
          continue;
        }
        out.push({ name: ent.name, relPath, size, mime: mimeForExt(ent.name) });
      }
    }
  };
  walk(outDir, "", 0);
  return out;
}
