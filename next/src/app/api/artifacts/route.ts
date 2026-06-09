import { listArtifacts } from "@/lib/artifacts/discover";
import { removeWorkdir, sanitizeTaskId } from "@/lib/artifacts/workdir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function taskParam(url: string): string | null {
  const raw = new URL(url).searchParams.get("task") ?? "";
  try {
    return sanitizeTaskId(raw);
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const task = taskParam(req.url);
  if (!task) return new Response("invalid task id", { status: 400 });
  return Response.json({ artifacts: listArtifacts(task) });
}

export async function DELETE(req: Request): Promise<Response> {
  const task = taskParam(req.url);
  if (!task) return new Response("invalid task id", { status: 400 });
  removeWorkdir(task);
  return Response.json({ ok: true });
}
