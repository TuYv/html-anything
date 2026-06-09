import { resolveOnPath } from "@/lib/agents/detect";

export type ToolId = "node" | "ffmpeg" | "playwright";
export type ToolDef = { id: ToolId; label: string; bins: string[] };

export const TOOLS: ToolDef[] = [
  { id: "node", label: "Node.js", bins: ["node"] },
  { id: "ffmpeg", label: "FFmpeg", bins: ["ffmpeg"] },
  // playwright is commonly invoked via `npx playwright`; treat npx as a fallback.
  { id: "playwright", label: "Playwright", bins: ["playwright", "npx"] },
];

export type ToolStatus = { id: ToolId; label: string; available: boolean; path?: string };

/** Probe each tool on PATH. First matching bin wins. */
export function detectTools(): ToolStatus[] {
  return TOOLS.map((t) => {
    for (const bin of t.bins) {
      const p = resolveOnPath(bin);
      if (p) return { id: t.id, label: t.label, available: true, path: p };
    }
    return { id: t.id, label: t.label, available: false };
  });
}
