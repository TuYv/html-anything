# Huashu Phase 1 — 设计知识层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 huashu-design 的设计纪律原生移植进 html-anything：强化共享指令（反 AI slop / 品牌纪律 / 事实优先），并新增 `design-advisor`（一屏并排 3 个设计方向）与 `design-review`（5 维评审报告）两个 skill。

**Architecture:** 路径 B「原生移植知识」。零新依赖、零子系统。改动只有两类：(1) 在 `next/src/lib/templates/shared.ts` 的单一字符串常量里追加指令；(2) 在 `next/src/lib/templates/skills/` 下新增两个纯数据 skill 文件夹。`loader.ts` 自动扫描磁盘——加文件夹即加 skill，无需任何 TS 注册改动。`scenario: design` 与 `assemblePrompt` 自动给新 skill 套上共享指令，均已存在。

**Tech Stack:** Next.js 16 / React 19 / TypeScript（strict）/ vitest（happy-dom）/ Tailwind v3 Play CDN（skill 产出侧）。

**Spec:** `docs/superpowers/specs/2026-06-08-huashu-integration-design.md` §3。

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `next/src/lib/templates/shared.ts` | 所有 skill 共享的设计指令前缀 | 修改：在 `SHARED_DESIGN_DIRECTIVES` 末尾追加 3 个新指令块 |
| `next/src/lib/templates/__tests__/shared.test.ts` | 锁定新指令存在且被 `assemblePrompt` 注入 | 新建 |
| `next/src/lib/templates/skills/design-advisor/SKILL.md` | 顾问 skill 的 frontmatter + prompt body | 新建 |
| `next/src/lib/templates/skills/design-advisor/example.md` | 顾问 skill 的示例输入 | 新建 |
| `next/src/lib/templates/skills/design-advisor/example.html` | picker 内联预览（种子版，可后续用真实运行替换） | 新建 |
| `next/src/lib/templates/skills/design-review/SKILL.md` | 评审 skill 的 frontmatter + prompt body | 新建 |
| `next/src/lib/templates/skills/design-review/example.md` | 评审 skill 的示例输入 | 新建 |
| `next/src/lib/templates/skills/design-review/example.html` | picker 内联预览（种子版） | 新建 |
| `next/src/lib/templates/__tests__/huashu-skills.test.ts` | 锁定两个新 skill 被 loader 发现且 body 含关键指令 | 新建 |

**回退**：删两个文件夹 + 两个新测试文件，`git checkout -- shared.ts`。

**命令速查**（在仓库根运行）：
- 单测：`pnpm -F @html-anything/next test`
- 类型检查：`pnpm -F @html-anything/next typecheck`
- 形状守卫：`pnpm exec tsx scripts/guard.ts`
- 开发预览：`pnpm -F @html-anything/next dev`

---

## Task 1: 强化共享指令（反 slop / 品牌 / 事实优先）

**Files:**
- Modify: `next/src/lib/templates/shared.ts`（在 `SHARED_DESIGN_DIRECTIVES` 模板字符串末尾、闭合反引号前追加）
- Test: `next/src/lib/templates/__tests__/shared.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `next/src/lib/templates/__tests__/shared.test.ts`：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- shared.test.ts`
Expected: FAIL —「含反 AI slop 黑名单」等用例报错，因为字符串里还没有这些词。

- [ ] **Step 3: 在 `shared.ts` 追加三个指令块**

打开 `next/src/lib/templates/shared.ts`，找到 `【内容真实性】` 块之后、模板字符串闭合的反引号 `` ` `` 之前（即第 36 行 `盘古之白` 那段与第 38 行空行之间），插入以下内容：

```
【反 AI slop — 一眼假的设计直接判不合格】
- 禁止全屏紫→蓝/靛线性渐变铺底 (purple/indigo/violet gradient 是 AI 生成最强信号)。如需渐变, 只允许基于主色的低饱和微变化。
- 禁止用 emoji 当标题图标 (🚀✨🔥 开头的 H1/H2), 禁止每个 bullet 前挂一个 emoji。图标改用内联 SVG / 几何色块。
- 禁止「居中大标题 + 副标题 + 两个按钮」的万能 hero 当唯一首屏; 首屏必须服务于真实内容结构。
- 禁止 lorem ipsum / "Your text here" / "示例文本" / 占位图床 (placeholder.com / via.placeholder)。
- 禁止整页都是等宽圆角卡片网格 (3×N 灰副标题卡) 这种偷懒统一版式; 版式要随内容语义变化。

【品牌呈现纪律】
- 用户若提供了品牌色 / logo / 指定字体, **必须原样采用**, 不得自创配色或替换字体。
- 用户未提供品牌资产时, 按上面【设计准则】克制选色选字, 保持单一主色。
- 不杜撰品牌名 / slogan / 客户 logo 墙 / 虚构奖项。

【事实优先 (尽力而非强制)】
- 涉及可验证事实 (数据、日期、名称、引用) 时, 优先使用【用户内容】里的真实信息, 不臆造数字、不伪造统计。
- 用户内容不足以支撑某个图表 / 数据点时, 宁可省略该模块, 也不要填充假数据凑版面。
```

> 注意：这段文本嵌在模板字符串内，其中没有反引号或 `${`，可安全直接粘贴，无需转义。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- shared.test.ts`
Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add next/src/lib/templates/shared.ts next/src/lib/templates/__tests__/shared.test.ts
git commit -m "feat(templates): add huashu anti-slop, brand & fact directives to shared prompt"
```

---

## Task 2: 新增 `design-advisor` skill（并排 3 个设计方向）

**Files:**
- Create: `next/src/lib/templates/skills/design-advisor/SKILL.md`
- Create: `next/src/lib/templates/skills/design-advisor/example.md`
- Create: `next/src/lib/templates/skills/design-advisor/example.html`
- Test: `next/src/lib/templates/__tests__/huashu-skills.test.ts`（本任务新建，Task 3 续写）

- [ ] **Step 1: 写失败测试**

新建 `next/src/lib/templates/__tests__/huashu-skills.test.ts`：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- huashu-skills.test.ts`
Expected: FAIL —「design-advisor 在 design 场景下可见」报 `skill` 为 undefined（文件夹还不存在）。

- [ ] **Step 3: 创建 `SKILL.md`**

新建 `next/src/lib/templates/skills/design-advisor/SKILL.md`：

```markdown
---
name: design-advisor
zh_name: "设计方向顾问"
en_name: "Design Advisor"
emoji: "🎨"
description: "一屏并排 3 个差异化设计方向, 每个带风格名/定位/适用场景/色板/字体样张, 供你选型"
category: design
scenario: design
aspect_hint: "16:9"
recommended: 3
tags: ["design", "advisor", "concept", "variants"]
example_format: "markdown"
example_name: "设计方向顾问 示例"
example_tagline: "一个 brief → 3 个可选方向"
---

【模板: 设计方向顾问 Design Advisor】
【意图】拿到一份设计 brief, 不直接出成品, 而是先给 **3 个差异化的设计方向**并排对照, 帮用户选型。这是 huashu「三套逻辑并行」的单文件落地: 不开 3 个 agent, 而是在**同一个 HTML 内并排 3 列**。

【硬性结构】
- 顶部: 一行主题条 = 用户 brief 的提炼 (主题 + 目标受众 + 一句话目标)。
- 中部: 一个 3 列等高栅格 (桌面 `grid-cols-3`, 窄屏堆叠), **并排**呈现 3 个方向。三个方向必须**显著不同**, 不能是同一套配色的微调。每列从上到下包含:
  1. 方向编号 + 风格名 (例: 「方向 A · 瑞士国际主义」)。
  2. 一句话定位 + 适用场景 (什么品牌/什么场合适合用)。
  3. 色板: 4 个色块横排 (主色/中性 ×2/强调), 每块下标十六进制值。
  4. 字体样张: 用该方向的字体真实渲染一行标题 + 两行正文 (中文优先 Noto Sans/Serif SC, 英文 Inter/Manrope 等)。
  5. 一个该风格的迷你组件示意 (一个按钮 + 一张小卡片), 用该方向的圆角/投影/边框语言。
- 底部: 「选型建议」——3-5 行, 说明每个方向分别适合什么场景, 给一个默认推荐。

【方向取材】
- 根据 brief 的调性, 从这些原型里挑 3 个**反差大**的: 瑞士极简 / 编辑杂志 / 现代科技暗色 / 新拟物柔和 / 野性粗野主义 (brutalist) / 高奢留白 / 复古印刷 / 玻璃拟态。挑选要贴 brief, 不是随机。
- 严禁 3 个方向都长一样 (都是浅灰卡片网格 = 失败)。

【设计细节】
- 整页自身也要克制好看: 8px 网格, 不用纯黑纯白, 列与列之间清晰分隔。
- 色板与字体样张必须是**真的**用到了对应颜色/字体, 不是文字描述。
```

- [ ] **Step 4: 创建 `example.md`**

新建 `next/src/lib/templates/skills/design-advisor/example.md`：

```markdown
为国产精品咖啡品牌「野生豆」做落地页设计方向探索。

- 受众: 一二线城市 Z 世代、城市游牧、远程工作者。
- 主打: single-origin 单一产地、低咖啡因、自带便携手冲装备。
- 调性: 年轻、有态度、户外/手作感, 但不能廉价或杂乱。
- 已有品牌色倾向: 苔藓绿 + 燕麦米白, logo 是一颗手绘咖啡豆。

请给我 3 个差异化的设计方向对比, 帮我决定主视觉走哪条路。
```

- [ ] **Step 5: 创建 `example.html`（种子预览）**

新建 `next/src/lib/templates/skills/design-advisor/example.html`（自包含、可双击打开；后续可用真实运行产出替换为更精致版本）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>设计方向顾问 · 野生豆</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Noto+Sans+SC:wght@400;700&family=Noto+Serif+SC:wght@600&display=swap" rel="stylesheet" />
<style>body{font-family:'Noto Sans SC','Inter',sans-serif;background:#fafafa;color:#0a0a0a}</style>
</head>
<body class="p-8">
  <header class="mb-8">
    <p class="text-sm tracking-widest text-neutral-500">设计方向顾问</p>
    <h1 class="text-2xl font-bold">野生豆 · 精品咖啡落地页 — 3 个方向</h1>
    <p class="text-neutral-600">受众: 城市游牧 Z 世代 · 目标: 单一产地 / 低咖啡因 / 户外手作感</p>
  </header>
  <main class="grid gap-6 md:grid-cols-3">
    <section class="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p class="text-xs text-neutral-400">方向 A</p>
      <h2 class="text-lg font-bold">瑞士极简</h2>
      <p class="mt-1 text-sm text-neutral-600">克制网格 · 适合强调产地与数据可信</p>
      <div class="mt-4 flex gap-2">
        <span class="h-8 w-8 rounded" style="background:#3f5e3a"></span>
        <span class="h-8 w-8 rounded" style="background:#f4efe2"></span>
        <span class="h-8 w-8 rounded" style="background:#0a0a0a"></span>
        <span class="h-8 w-8 rounded" style="background:#d97742"></span>
      </div>
      <p class="mt-4 font-serif text-xl" style="font-family:'Noto Serif SC'">单一产地的清醒</p>
      <button class="mt-3 rounded-lg bg-[#3f5e3a] px-4 py-2 text-sm text-white">立即选购</button>
    </section>
    <section class="rounded-none border-2 border-black bg-[#f4efe2] p-5">
      <p class="text-xs">方向 B</p>
      <h2 class="text-lg font-black uppercase">Brutalist 野性</h2>
      <p class="mt-1 text-sm">粗边框 · 适合强调态度与户外感</p>
      <div class="mt-4 flex gap-2">
        <span class="h-8 w-8" style="background:#2f3a22"></span>
        <span class="h-8 w-8" style="background:#e7dcc4"></span>
        <span class="h-8 w-8" style="background:#c2410c"></span>
        <span class="h-8 w-8" style="background:#111"></span>
      </div>
      <p class="mt-4 text-xl font-black">WILD BEAN / 野生豆</p>
      <button class="mt-3 border-2 border-black bg-[#c2410c] px-4 py-2 text-sm font-bold text-white">GET YOURS</button>
    </section>
    <section class="rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-5 text-neutral-100">
      <p class="text-xs text-neutral-500">方向 C</p>
      <h2 class="text-lg font-bold">现代科技暗色</h2>
      <p class="mt-1 text-sm text-neutral-400">暗背景 · 适合强调便携装备与精密手冲</p>
      <div class="mt-4 flex gap-2">
        <span class="h-8 w-8 rounded-lg" style="background:#7fae6f"></span>
        <span class="h-8 w-8 rounded-lg" style="background:#1c1c1c"></span>
        <span class="h-8 w-8 rounded-lg" style="background:#fafafa"></span>
        <span class="h-8 w-8 rounded-lg" style="background:#d97742"></span>
      </div>
      <p class="mt-4 text-xl font-bold">精密到每一克</p>
      <button class="mt-3 rounded-lg bg-[#7fae6f] px-4 py-2 text-sm font-medium text-black">探索装备</button>
    </section>
  </main>
  <footer class="mt-8 rounded-xl bg-white p-5 text-sm text-neutral-700 shadow-sm">
    <strong>选型建议:</strong> 主推 <em>方向 A 瑞士极简</em> — 最能承载「单一产地 + 可信数据」叙事; 若想强化户外态度走 B; 主打装备精密感走 C。
  </footer>
</body>
</html>
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- huashu-skills.test.ts`
Expected: PASS（design-advisor 两个用例绿；design-review 用例尚未添加）。

- [ ] **Step 7: 提交**

```bash
git add next/src/lib/templates/skills/design-advisor next/src/lib/templates/__tests__/huashu-skills.test.ts
git commit -m "feat(skills): add design-advisor skill (3 side-by-side design directions)"
```

---

## Task 3: 新增 `design-review` skill（5 维评审报告）

**Files:**
- Create: `next/src/lib/templates/skills/design-review/SKILL.md`
- Create: `next/src/lib/templates/skills/design-review/example.md`
- Create: `next/src/lib/templates/skills/design-review/example.html`
- Test: `next/src/lib/templates/__tests__/huashu-skills.test.ts`（续写 Task 2 文件）

- [ ] **Step 1: 在 `huashu-skills.test.ts` 追加失败测试**

在 `next/src/lib/templates/__tests__/huashu-skills.test.ts` 的 `describe` 块内，追加：

```ts
  it("design-review 在 design 场景下可见", () => {
    const skill = listSkills().find((s) => s.id === "design-review");
    expect(skill).toBeTruthy();
    expect(skill?.scenario).toBe("design");
  });

  it("design-review 的 body 指示 5 维评分 + 雷达图 + Keep/Fix/Quick Wins", () => {
    const loaded = loadSkill("design-review");
    expect(loaded).not.toBeNull();
    expect(loaded?.body).toContain("雷达图");
    expect(loaded?.body).toContain("Keep");
    expect(loaded?.body).toContain("Fix");
    expect(loaded?.body).toContain("Quick Wins");
  });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- huashu-skills.test.ts`
Expected: FAIL —「design-review 在 design 场景下可见」报 undefined。

- [ ] **Step 3: 创建 `SKILL.md`**

新建 `next/src/lib/templates/skills/design-review/SKILL.md`：

```markdown
---
name: design-review
zh_name: "设计评审报告"
en_name: "Design Review"
emoji: "🔍"
description: "对一份设计/页面做 5 维评分 + 纯 SVG 雷达图 + Keep/Fix/Quick Wins 清单"
category: design
scenario: design
aspect_hint: "auto"
recommended: 4
tags: ["design", "review", "critique", "audit"]
example_format: "markdown"
example_name: "设计评审报告 示例"
example_tagline: "5 维打分 + 整改清单"
---

【模板: 设计评审报告 Design Review】
【意图】像资深设计总监一样, 对【用户内容】里描述或粘贴的设计 (一段描述、一份 HTML、或一张截图的文字转述) 做结构化评审, 产出一页可直接发给团队的评审报告 HTML。

【五个评审维度 (每个 0-100 打分, 并给一句话依据)】
1. 视觉层级 Hierarchy — 重点是否一眼可见, 主次是否分明。
2. 排版 Typography — 字体搭配、字号阶梯、行高与可读性。
3. 色彩与对比 Color & Contrast — 配色克制度、对比度 (≥4.5)、品牌一致性。
4. 留白与网格 Spacing & Grid — 8px 节奏、对齐、呼吸感。
5. 内容真实性与信息密度 Content & Density — 是否真数据、密度是否合适、有无 AI slop 痕迹。

【硬性结构】
- 顶部: 被评审对象标题 + 一行总评 + 一个总分 (5 维平均)。
- 雷达图: 用**纯内联 SVG 画五边形雷达图** (不引入任何图表库 / 不引外链图片), 5 个轴对应 5 个维度, 顶点按各自分数定位, 填充半透明主色。每个轴端标注维度名 + 分数。
- 维度明细: 5 行, 每行 = 维度名 + 分数条 + 一句话依据。
- 三栏清单 (桌面 `grid-cols-3`):
  - ✅ Keep — 做对了、要保留的 (引用具体维度)。
  - 🛠 Fix — 必须修的硬伤 (引用具体维度, 给出怎么改)。
  - ⚡ Quick Wins — 低成本高收益的快速优化 (可立刻动手的)。
- 每条清单项末尾用括号标注它关联的维度, 例: (色彩与对比)。

【设计细节】
- 报告本身也要好看且专业: 8px 网格, 单一主色, 不用纯黑纯白, 分数用色彩编码 (低分暖红, 高分主色)。
- 雷达图必须是真的 SVG 多边形, 顶点坐标随分数变化, 不是一张静态装饰图。
```

- [ ] **Step 4: 创建 `example.md`**

新建 `next/src/lib/templates/skills/design-review/example.md`：

```markdown
请评审我们 SaaS 产品的定价页。现状描述:

- 顶部一个居中大标题「Simple, transparent pricing 🚀」配紫蓝渐变背景。
- 三个等宽圆角卡片 (Free / Pro / Enterprise), 每个卡片副标题是灰色 lorem ipsum 占位文案。
- 每个功能点前面都有一个 emoji (✅✨🔥)。
- 主按钮和卡片边框都是浅灰, 对比偏弱, 价格数字和「/月」字号一样大。
- 没有任何真实客户数据或用量信息。

帮我打分并给出整改清单。
```

- [ ] **Step 5: 创建 `example.html`（种子预览）**

新建 `next/src/lib/templates/skills/design-review/example.html`（自包含；含真实 SVG 五边形雷达图）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>设计评审报告 · 定价页</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{font-family:'Noto Sans SC',system-ui,sans-serif;background:#fafafa;color:#0a0a0a}</style>
</head>
<body class="p-8">
  <header class="mb-6">
    <p class="text-sm tracking-widest text-neutral-500">设计评审报告</p>
    <h1 class="text-2xl font-bold">SaaS 定价页 · 总评 52 / 100</h1>
    <p class="text-neutral-600">一句话: 信息结构清楚, 但配色与文案有明显 AI slop 痕迹, 对比偏弱。</p>
  </header>
  <section class="mb-6 flex flex-wrap items-center gap-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
    <svg viewBox="0 0 220 220" class="h-56 w-56">
      <polygon points="110,20 199,84 165,189 55,189 21,84" fill="none" stroke="#e5e7eb" />
      <polygon points="110,65 156,98 138,162 82,162 64,98" fill="#3f5e3a33" stroke="#3f5e3a" stroke-width="2" />
      <text x="110" y="14" text-anchor="middle" font-size="10">层级 70</text>
      <text x="205" y="86" font-size="10">排版 60</text>
      <text x="165" y="205" text-anchor="middle" font-size="10">色彩 35</text>
      <text x="55" y="205" text-anchor="middle" font-size="10">留白 55</text>
      <text x="2" y="86" font-size="10">内容 40</text>
    </svg>
    <div class="space-y-2 text-sm">
      <div><span class="inline-block w-28">视觉层级</span><span class="font-bold text-[#3f5e3a]">70</span> — 三档结构清楚, 但价格与单位同字号削弱重点。</div>
      <div><span class="inline-block w-28">排版</span><span class="font-bold">60</span> — 字阶单一, 缺正文层级。</div>
      <div><span class="inline-block w-28">色彩与对比</span><span class="font-bold text-red-600">35</span> — 紫蓝渐变 + 浅灰边框, 对比 &lt;4.5。</div>
      <div><span class="inline-block w-28">留白与网格</span><span class="font-bold">55</span> — 卡片内边距不齐 8px 节奏。</div>
      <div><span class="inline-block w-28">内容真实性</span><span class="font-bold text-red-600">40</span> — lorem ipsum + 无真实用量数据。</div>
    </div>
  </section>
  <section class="grid gap-4 md:grid-cols-3">
    <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h3 class="mb-2 font-bold text-[#3f5e3a]">✅ Keep</h3>
      <ul class="list-disc space-y-1 pl-4 text-sm text-neutral-700">
        <li>三档定价结构清晰易扫读。(视觉层级)</li>
        <li>响应式卡片栅格基础稳。(留白与网格)</li>
      </ul>
    </div>
    <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h3 class="mb-2 font-bold text-red-600">🛠 Fix</h3>
      <ul class="list-disc space-y-1 pl-4 text-sm text-neutral-700">
        <li>换掉紫蓝渐变, 用单一品牌主色 + 中性底。(色彩与对比)</li>
        <li>lorem ipsum 全部换成真实卖点文案。(内容真实性)</li>
        <li>价格数字放大, 「/月」缩小弱化。(视觉层级)</li>
      </ul>
    </div>
    <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h3 class="mb-2 font-bold text-amber-600">⚡ Quick Wins</h3>
      <ul class="list-disc space-y-1 pl-4 text-sm text-neutral-700">
        <li>去掉功能点前的 emoji, 改用统一 SVG 勾。(排版)</li>
        <li>主按钮描边加深到对比 ≥4.5。(色彩与对比)</li>
        <li>给推荐档加一条主色顶边突出。(视觉层级)</li>
      </ul>
    </div>
  </section>
</body>
</html>
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- huashu-skills.test.ts`
Expected: PASS（4 个用例全绿）。

- [ ] **Step 7: 提交**

```bash
git add next/src/lib/templates/skills/design-review next/src/lib/templates/__tests__/huashu-skills.test.ts
git commit -m "feat(skills): add design-review skill (5-dimension critique report)"
```

---

## Task 4: 全量验证 + 人工冒烟

**Files:** 无新增；仅运行验证命令。

- [ ] **Step 1: 全量单测**

Run: `pnpm -F @html-anything/next test`
Expected: PASS — 全部测试绿（含既有 `refresh.test.ts` 不回归）。

- [ ] **Step 2: 类型检查**

Run: `pnpm -F @html-anything/next typecheck`
Expected: 无类型错误（本期未改任何类型，应干净通过）。

- [ ] **Step 3: 形状守卫**

Run: `pnpm exec tsx scripts/guard.ts`
Expected: PASS — 没有把 app 源码加回根 `src/`、没有把 Playwright 测试放进 `next/`，符合工作区形状约束。

- [ ] **Step 4: 人工冒烟（dev server）**

Run: `pnpm -F @html-anything/next dev`，浏览器打开 picker：
- 在「设计 design」场景过滤下，确认出现 `🎨 设计方向顾问` 与 `🔍 设计评审报告` 两张卡片，且各自显示 `example.html` 内联预览。
- 用 `design-advisor` 的 `example.md` 作为输入跑一次转换：产出的 HTML 应是**一屏并排 3 个明显不同的方向**（不是同一配色微调）。
- 用 `design-review` 的 `example.md` 跑一次：产出应含**一个真实 SVG 五边形雷达图** + Keep/Fix/Quick Wins 三栏。
- 随手跑一个**既有** deck skill，确认强化后的 `shared.ts` 没有破坏正常产出（无紫蓝渐变默认、无 emoji 标题）。

> 若某个新 skill 的真实产出明显优于种子 `example.html`，把该真实输出保存覆盖对应的 `example.html`，让 picker 预览更精致（提交时附带）。

- [ ] **Step 5: 收尾提交（如有 example.html 替换）**

```bash
git add next/src/lib/templates/skills/design-advisor/example.html next/src/lib/templates/skills/design-review/example.html
git commit -m "chore(skills): refresh design-advisor/design-review previews from real runs"
```

---

## Self-Review

- **Spec §3.1（强化 shared.ts）** → Task 1 ✅（反 slop / 品牌纪律 / 事实优先三块 + 注入单测）。
- **Spec §3.2（design-advisor，3 变体并排映射）** → Task 2 ✅（SKILL.md 明确「同一 HTML 内并排 3 列」）。
- **Spec §3.3（design-review，5 维 + 雷达 + Keep/Fix/Quick Wins）** → Task 3 ✅。
- **Spec §3.4（40 风格库不建子系统，蒸馏为内嵌附录）** → 已落进 design-advisor 的「方向取材」原型清单；未新建 design-system 子系统（YAGNI 守住）。
- **Spec §3 改动面/回退** → Task 4 形状守卫 + 文件清单 + 回退说明覆盖。
- **类型一致性**：仅用既有导出 `listSkills` / `loadSkill` / `SHARED_DESIGN_DIRECTIVES` / `assemblePrompt`，签名未变更，无新类型。
- **占位符扫描**：无 TODO/TBD；所有 code step 给出完整可粘贴内容。`example.html` 为真实可运行文件而非占位（Task 4 提供可选的真实运行替换路径）。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-08-huashu-phase1-design-knowledge.md`. 两种执行方式：**

**1. Subagent-Driven（推荐）** — 每个 Task 派一个全新 subagent，任务间我来 review，迭代快。

**2. Inline Execution** — 在本会话内用 executing-plans 批量执行，带检查点暂停给你 review。

**先决条件**：Phase 1 要落到一个干净分支上，但当前 `feat/wechat-computed-style-export` 有未提交的 WeChat 导出改动。开工前需先决定如何处理（见对话中的分支选项）。
