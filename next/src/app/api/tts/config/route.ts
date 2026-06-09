import { NextRequest, NextResponse } from "next/server";
import { readTtsConfig, writeTtsConfig, deleteTtsConfig, publicTtsConfig } from "@/lib/tts/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(publicTtsConfig(await readTtsConfig()));
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid JSON", { status: 400 });
  }
  try {
    const pub = await writeTtsConfig(body as Record<string, string>);
    return NextResponse.json(pub);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "save failed" },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  return NextResponse.json(await deleteTtsConfig());
}
