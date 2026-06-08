import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureWorkdir } from "@/lib/artifacts/workdir";
import { GET as listGET, DELETE as listDELETE } from "../route";
import { GET as fileGET } from "../file/route";

let root: string;
const prev = process.env.HTML_ANYTHING_WORK_ROOT;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ha-route-"));
  process.env.HTML_ANYTHING_WORK_ROOT = root;
});
afterEach(() => {
  if (prev === undefined) delete process.env.HTML_ANYTHING_WORK_ROOT;
  else process.env.HTML_ANYTHING_WORK_ROOT = prev;
  fs.rmSync(root, { recursive: true, force: true });
});

const req = (url: string) => new Request(url);

describe("GET /api/artifacts", () => {
  it("lists artifacts for a task", async () => {
    const { outDir } = ensureWorkdir("task1");
    fs.writeFileSync(path.join(outDir, "a.mp4"), "abc");
    const res = await listGET(req("http://x/api/artifacts?task=task1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { artifacts: Array<{ name: string }> };
    expect(body.artifacts.map((a) => a.name)).toEqual(["a.mp4"]);
  });
  it("400 on invalid task id", async () => {
    const res = await listGET(req("http://x/api/artifacts?task=../etc"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/artifacts/file", () => {
  it("streams a file with its mime", async () => {
    const { outDir } = ensureWorkdir("task1");
    fs.writeFileSync(path.join(outDir, "a.txt"), "hello");
    const res = await fileGET(req("http://x/api/artifacts/file?task=task1&path=a.txt"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-length")).toBe("5");
    expect(await res.text()).toBe("hello");
  });
  it("404 on traversal / missing / bad path", async () => {
    ensureWorkdir("task1");
    for (const p of ["../../etc/passwd", "/etc/passwd", "nope.txt"]) {
      const res = await fileGET(req(`http://x/api/artifacts/file?task=task1&path=${encodeURIComponent(p)}`));
      expect(res.status).toBe(404);
    }
  });
  it("400 on invalid task id", async () => {
    const res = await fileGET(req("http://x/api/artifacts/file?task=..&path=a.txt"));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/artifacts", () => {
  it("removes the task workdir", async () => {
    const { dir } = ensureWorkdir("task1");
    expect(fs.existsSync(dir)).toBe(true);
    const res = await listDELETE(req("http://x/api/artifacts?task=task1"));
    expect(res.status).toBe(200);
    expect(fs.existsSync(dir)).toBe(false);
  });
});
