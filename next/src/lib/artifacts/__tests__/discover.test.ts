import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mimeForExt, listArtifacts } from "../discover";
import { ensureWorkdir } from "../workdir";

let root: string;
const prev = process.env.HTML_ANYTHING_WORK_ROOT;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ha-disc-"));
  process.env.HTML_ANYTHING_WORK_ROOT = root;
});
afterEach(() => {
  if (prev === undefined) delete process.env.HTML_ANYTHING_WORK_ROOT;
  else process.env.HTML_ANYTHING_WORK_ROOT = prev;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("mimeForExt", () => {
  it("maps known extensions, falls back to octet-stream", () => {
    expect(mimeForExt("a.mp4")).toBe("video/mp4");
    expect(mimeForExt("a.gif")).toBe("image/gif");
    expect(mimeForExt("a.png")).toBe("image/png");
    expect(mimeForExt("a.pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(mimeForExt("a.unknownext")).toBe("application/octet-stream");
  });
});

describe("listArtifacts", () => {
  it("returns [] when out/ is missing", () => {
    expect(listArtifacts("task1")).toEqual([]);
  });
  it("lists files in out/ (recursively) with name/relPath/size/mime", () => {
    const { outDir } = ensureWorkdir("task1");
    fs.writeFileSync(path.join(outDir, "video.mp4"), "abc");
    fs.mkdirSync(path.join(outDir, "sub"));
    fs.writeFileSync(path.join(outDir, "sub", "thumb.png"), "xy");
    const arts = listArtifacts("task1").sort((a, b) => a.relPath.localeCompare(b.relPath));
    expect(arts).toEqual([
      { name: "thumb.png", relPath: path.join("sub", "thumb.png"), size: 2, mime: "image/png" },
      { name: "video.mp4", relPath: "video.mp4", size: 3, mime: "video/mp4" },
    ]);
  });
});
