import { NextResponse } from "next/server";
import { detectTools } from "@/lib/tools/detect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tools = detectTools();
    return NextResponse.json({ tools, platform: process.platform });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "detection failed" },
      { status: 500 },
    );
  }
}
