import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  sanitizeTaskId,
  taskWorkdir,
  taskOutDir,
  ensureWorkdir,
  removeWorkdir,
  safeResolveInOut,
} from "../workdir";

let root: string;
const prev = process.env.HTML_ANYTHING_WORK_ROOT;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ha-work-"));
  process.env.HTML_ANYTHING_WORK_ROOT = root;
});
afterEach(() => {
  if (prev === undefined) delete process.env.HTML_ANYTHING_WORK_ROOT;
  else process.env.HTML_ANYTHING_WORK_ROOT = prev;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("sanitizeTaskId", () => {
  it("accepts kebab/underscore/alnum", () => {
    expect(sanitizeTaskId("t_1a2b-XYZ")).toBe("t_1a2b-XYZ");
  });
  it("rejects traversal / separators / empty", () => {
    for (const bad of ["..", "../x", "a/b", "a\\b", "a.b", "", "  ", "a b"]) {
      expect(() => sanitizeTaskId(bad)).toThrow();
    }
  });
});

describe("workdir paths + lifecycle", () => {
  it("taskWorkdir / taskOutDir live under the work root", () => {
    expect(taskWorkdir("task1")).toBe(path.join(root, "task1"));
    expect(taskOutDir("task1")).toBe(path.join(root, "task1", "out"));
  });
  it("ensureWorkdir creates dir + out, removeWorkdir deletes it", () => {
    const { dir, outDir } = ensureWorkdir("task1");
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(outDir)).toBe(true);
    removeWorkdir("task1");
    expect(fs.existsSync(dir)).toBe(false);
  });
  it("removeWorkdir is idempotent (no throw when dir is absent)", () => {
    expect(() => removeWorkdir("never-created")).not.toThrow();
  });
});

describe("safeResolveInOut — traversal guard", () => {
  it("resolves a normal relative path inside out/", () => {
    ensureWorkdir("task1");
    const r = safeResolveInOut("task1", "video.mp4");
    expect(r).toBe(path.join(root, "task1", "out", "video.mp4"));
  });
  it("rejects ../ escapes, absolute paths, and out-of-out joins", () => {
    ensureWorkdir("task1");
    for (const bad of ["../secret", "../../etc/passwd", "/etc/passwd", "sub/../../x"]) {
      expect(safeResolveInOut("task1", bad)).toBeNull();
    }
  });
});
