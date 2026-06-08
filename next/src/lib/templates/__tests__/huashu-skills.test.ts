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
    expect(loaded?.body).toMatch(/3 个.*方向|三个.*方向/);
  });

  it("design-advisor 附带 example.html 预览", () => {
    expect(loadSkill("design-advisor")?.exampleHtml).toBeTruthy();
  });

  it("design-review 在 design 场景下可见", () => {
    const skill = listSkills().find((s) => s.id === "design-review");
    expect(skill).toBeTruthy();
    expect(skill?.scenario).toBe("design");
  });

  it("design-review 的 body 指示 5 维评分 + 雷达图 + Keep/Fix/Quick Wins", () => {
    const loaded = loadSkill("design-review");
    expect(loaded).not.toBeNull();
    expect(loaded?.body).toContain("雷达图");
    expect(loaded?.body).toContain("Keep —");
    expect(loaded?.body).toContain("Fix —");
    expect(loaded?.body).toContain("Quick Wins —");
  });

  it("design-review 附带 example.html 预览", () => {
    expect(loadSkill("design-review")?.exampleHtml).toBeTruthy();
  });
});
