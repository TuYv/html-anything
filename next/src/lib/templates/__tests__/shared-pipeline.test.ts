import { describe, it, expect } from "vitest";
import {
  SHARED_DESIGN_DIRECTIVES,
  SHARED_DESIGN_RULES,
  assemblePromptPipeline,
  assembleForSkill,
} from "../shared";

describe("SHARED_DESIGN_RULES 抽取（非回归）", () => {
  it("rules 含设计纪律但不含 HTML 输出契约", () => {
    expect(SHARED_DESIGN_RULES).toContain("设计准则");
    expect(SHARED_DESIGN_RULES).toContain("盘古之白");
    expect(SHARED_DESIGN_RULES).toContain("反 AI slop");
    expect(SHARED_DESIGN_RULES).not.toContain("禁止使用 Write");
  });
  it("HTML 模式 directives 仍含禁令 + 纪律（不回归）", () => {
    expect(SHARED_DESIGN_DIRECTIVES).toContain("禁止使用 Write");
    expect(SHARED_DESIGN_DIRECTIVES).toContain("盘古之白");
    expect(SHARED_DESIGN_DIRECTIVES).toContain("反 AI slop");
    expect(SHARED_DESIGN_DIRECTIVES).toContain("品牌呈现纪律");
    expect(SHARED_DESIGN_DIRECTIVES).toContain("事实优先");
  });
});

describe("assemblePromptPipeline", () => {
  it("解禁工具、指示写 out/ + ffmpeg、保留设计纪律、含内容", () => {
    const out = assemblePromptPipeline({ body: "【Skill】测试", content: "你好世界", format: "markdown" });
    expect(out).not.toContain("禁止使用 Write");
    expect(out).toContain("out/");
    expect(out).toContain("ffmpeg");
    expect(out).toContain("playwright");
    expect(out).toContain("盘古之白"); // 设计纪律保留
    expect(out).toContain("【Skill】测试");
    expect(out).toContain("你好世界");
  });
});

describe("assembleForSkill 路由", () => {
  it("scenario=video → pipeline（无禁令）", () => {
    const out = assembleForSkill({ scenario: "video", body: "B" }, "C", "markdown");
    expect(out).not.toContain("禁止使用 Write");
    expect(out).toContain("ffmpeg");
  });
  it("scenario=design → HTML 模式（有禁令）", () => {
    const out = assembleForSkill({ scenario: "design", body: "B" }, "C", "markdown");
    expect(out).toContain("禁止使用 Write");
  });
});
