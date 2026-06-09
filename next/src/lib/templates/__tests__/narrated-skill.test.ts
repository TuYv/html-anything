import { describe, it, expect } from "vitest";
import { listSkills, loadSkill } from "../loader";
import { assembleForSkill } from "../shared";

describe("video-narrated skill", () => {
  it("可被 loader 发现且 scenario=video", () => {
    const s = listSkills().find((x) => x.id === "video-narrated");
    expect(s).toBeTruthy();
    expect(s?.scenario).toBe("video");
  });
  it("body 指示 TTS 配音 + 优雅降级 + SRT, 经 pipeline 装配", () => {
    const loaded = loadSkill("video-narrated");
    expect(loaded).not.toBeNull();
    expect(loaded?.body).toContain("TTS_API_KEY");
    expect(loaded?.body).toContain(".srt");
    const prompt = assembleForSkill(loaded!, "做一支带解说的短片", "markdown");
    expect(prompt).not.toContain("禁止使用 Write");
    expect(prompt).toContain("ffmpeg");
  });
});
