import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TOOLS, detectTools } from "../detect";

let dir: string;
const prevPath = process.env.PATH;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ha-tools-"));
  const bin = path.join(dir, "ffmpeg");
  fs.writeFileSync(bin, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(bin, 0o755);
  process.env.PATH = dir;
});
afterEach(() => {
  process.env.PATH = prevPath;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("detectTools", () => {
  it("finds a tool present on PATH (stub ffmpeg) with its resolved path", () => {
    const tools = detectTools();
    expect(tools.map((t) => t.id).sort()).toEqual(["ffmpeg", "node", "playwright"]);
    const ff = tools.find((t) => t.id === "ffmpeg")!;
    expect(ff.available).toBe(true);
    expect(ff.path).toBe(path.join(dir, "ffmpeg"));
    for (const t of tools) expect(typeof t.available).toBe("boolean");
  });
  it("TOOLS covers node/ffmpeg/playwright", () => {
    expect(TOOLS.map((t) => t.id)).toEqual(["node", "ffmpeg", "playwright"]);
  });
});
