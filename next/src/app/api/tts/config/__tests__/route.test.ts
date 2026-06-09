import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GET, PUT, DELETE } from "../route";

let dir: string;
const prev = process.env.HTML_ANYTHING_USER_STATE_DIR;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ha-tts-route-"));
  process.env.HTML_ANYTHING_USER_STATE_DIR = dir;
});
afterEach(() => {
  if (prev === undefined) delete process.env.HTML_ANYTHING_USER_STATE_DIR;
  else process.env.HTML_ANYTHING_USER_STATE_DIR = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

const putReq = (body: unknown) =>
  new Request("http://x/api/tts/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/tts/config", () => {
  it("PUT saves + GET returns masked (no plaintext key)", async () => {
    const put = await PUT(putReq({ endpoint: "https://x/v1/audio/speech", apiKey: "secret123" }) as never);
    expect(put.status).toBe(200);
    const putBody = await put.json();
    expect(putBody.configured).toBe(true);
    expect(JSON.stringify(putBody)).not.toContain("secret123");

    const get = await GET();
    const getBody = await get.json();
    expect(getBody.configured).toBe(true);
    expect(JSON.stringify(getBody)).not.toContain("secret123");
  });

  it("PUT with missing apiKey → 400", async () => {
    const res = await PUT(putReq({ endpoint: "https://x", apiKey: "" }) as never);
    expect(res.status).toBe(400);
  });

  it("DELETE clears config", async () => {
    await PUT(putReq({ endpoint: "https://x", apiKey: "k" }) as never);
    const del = await DELETE();
    const body = await del.json();
    expect(body.configured).toBe(false);
  });
});
