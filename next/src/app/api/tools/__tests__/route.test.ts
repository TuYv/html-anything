import { describe, expect, it } from "vitest";
import { GET } from "../route";

describe("GET /api/tools", () => {
  it("returns a tools array with id/label/available", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: Array<{ id: string; available: boolean }> };
    expect(body.tools.map((t) => t.id).sort()).toEqual(["ffmpeg", "node", "playwright"]);
    for (const t of body.tools) expect(typeof t.available).toBe("boolean");
  });
});
