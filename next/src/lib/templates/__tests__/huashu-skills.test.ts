import { describe, it, expect } from "vitest";
import { listSkills, loadSkill } from "../loader";

describe("huashu phase-1 skills — 可被 loader 发现", () => {
  it("design-advisor 在 design 场景下可见", () => {
    const skill = listSkills().find((s) => s.id === "design-advisor");
    expect(skill).toBeTruthy();
    expect(skill?.scenario).toBe("design");
  });

  it("design-advisor 的 body 指示一屏并排 3 个方向", () => {
    const loaded = loadSkill("design-advisor");
    expect(loaded).not.toBeNull();
    expect(loaded?.body).toMatch(/并排|并列/);
    expect(loaded?.body).toContain("3");
  });
});
