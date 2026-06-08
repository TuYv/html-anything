import { describe, it, expect } from "vitest";
import { SHARED_DESIGN_DIRECTIVES, assemblePrompt } from "../shared";

describe("SHARED_DESIGN_DIRECTIVES — huashu 纪律", () => {
  it("含反 AI slop 黑名单", () => {
    expect(SHARED_DESIGN_DIRECTIVES).toContain("反 AI slop");
    expect(SHARED_DESIGN_DIRECTIVES).toContain("lorem ipsum");
  });

  it("含品牌呈现纪律", () => {
    expect(SHARED_DESIGN_DIRECTIVES).toContain("品牌呈现纪律");
  });

  it("含事实优先指令", () => {
    expect(SHARED_DESIGN_DIRECTIVES).toContain("事实优先");
    expect(SHARED_DESIGN_DIRECTIVES).toContain("不臆造数字");
  });

  it("保留既有的核心约束（不回归）", () => {
    expect(SHARED_DESIGN_DIRECTIVES).toContain("盘古之白");
    expect(SHARED_DESIGN_DIRECTIVES).toContain("禁止使用 Write / Edit");
  });

  it("assemblePrompt 把新指令注入到最终 prompt 前缀", () => {
    const out = assemblePrompt({ body: "【模板】测试", content: "你好", format: "markdown" });
    expect(out).toContain("反 AI slop");
    expect(out).toContain("品牌呈现纪律");
    expect(out).toContain("事实优先");
    expect(out).toContain("【模板】测试");
    expect(out).toContain("你好");
  });
});
