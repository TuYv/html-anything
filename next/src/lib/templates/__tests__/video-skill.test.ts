import { describe, it, expect } from "vitest";
import { listSkills, loadSkill } from "../loader";
import { assembleForSkill } from "../shared";

describe("video-motion skill", () => {
  it("可被 loader 发现且 scenario=video", () => {
    const s = listSkills().find((x) => x.id === "video-motion");
    expect(s).toBeTruthy();
    expect(s?.scenario).toBe("video");
  });
  it("经 assembleForSkill 走 pipeline（解禁工具）", () => {
    const loaded = loadSkill("video-motion");
    expect(loaded).not.toBeNull();
    const prompt = assembleForSkill(loaded!, "把这段内容做成短片", "markdown");
    expect(prompt).not.toContain("禁止使用 Write");
    expect(prompt).toContain("ffmpeg");
    expect(prompt).toContain("out/");
  });
});
