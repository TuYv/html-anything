import fs from "node:fs";
import { mimeForExt } from "@/lib/artifacts/discover";
import { safeResolveInOut, sanitizeTaskId } from "@/lib/artifacts/workdir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const rawTask = url.searchParams.get("task") ?? "";
  const relPath = url.searchParams.get("path") ?? "";

  let task: string;
  try {
    task = sanitizeTaskId(rawTask);
  } catch {
    return new Response("invalid task id", { status: 400 });
  }

  const abs = safeResolveInOut(task, relPath);
  // 404 (not 403) on escape so we don't leak whether the target exists.
  if (!abs) return new Response("not found", { status: 404 });

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return new Response("not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("not found", { status: 404 });

  const name = (relPath.split(/[\\/]/).pop() || "artifact").replace(/["\r\n]/g, "");
  const mime = mimeForExt(name);
  const inline = mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/");
  const data = fs.readFileSync(abs);
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(data.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
