import { describe, expect, it } from "vitest";
import { POST } from "../route";

describe("POST /api/convert — taskId required", () => {
  it("400 when taskId is missing", async () => {
    const res = await POST(
      new Request("http://x/api/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: "claude", templateId: "deck-simple", content: "hi" }),
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("400 when taskId has invalid characters", async () => {
    const res = await POST(
      new Request("http://x/api/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: "claude", templateId: "deck-simple", content: "hi", taskId: "../evil" }),
      }) as never,
    );
    expect(res.status).toBe(400);
  });
});
