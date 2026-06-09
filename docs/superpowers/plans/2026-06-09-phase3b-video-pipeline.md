# Phase 3b — Video Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. When dispatching review subagents, instruct them to use READ-ONLY git only (never `git checkout`/`switch`) — the working tree is shared.

**Goal:** 让 `scenario: video` 的 skill 经 agent 在隔离 workdir 渲染出 MP4/GIF（复用 3a 产物呈现），并在缺工具时非阻塞提醒。

**Architecture:** 在 `shared.ts` 抽出共享设计纪律 `SHARED_DESIGN_RULES`，新增第二个装配器 `assemblePromptPipeline`（解禁工具、指示写 `out/`）和按 scenario 选装配器的 `assembleForSkill`。`convert/route.ts` 用 `assembleForSkill`。新增工具链探测 + `/api/tools` + 缺工具 banner。新增 `video-motion` skill（agent 自写 playwright+ffmpeg 渲染）。真实渲染只能人工冒烟。

**Tech Stack:** Next.js route handlers · node:fs/path/os · vitest/happy-dom · zustand · i18n（`useT()` + flat Dict）。

**Spec:** `docs/superpowers/specs/2026-06-09-phase3b-video-pipeline-design.md`。

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `next/src/lib/templates/shared.ts` | 抽 `SHARED_DESIGN_RULES` + `assemblePromptPipeline` + `assembleForSkill` | 修改 |
| `next/src/lib/templates/__tests__/shared-pipeline.test.ts` | pipeline 装配 + 路由 + 非回归 | 新建 |
| `next/src/lib/tools/detect.ts` | 本地工具链探测 | 新建 |
| `next/src/lib/tools/__tests__/detect.test.ts` | 探测单测 | 新建 |
| `next/src/app/api/tools/route.ts` | `GET /api/tools` | 新建 |
| `next/src/app/api/tools/__tests__/route.test.ts` | 路由单测 | 新建 |
| `next/src/lib/templates/skills/video-motion/SKILL.md` | 首个视频 skill | 新建 |
| `next/src/lib/templates/skills/video-motion/example.md` | 示例 brief | 新建 |
| `next/src/lib/templates/__tests__/video-skill.test.ts` | skill 发现 + 经装配器走 pipeline | 新建 |
| `next/src/app/api/convert/route.ts` | 用 `assembleForSkill` | 修改 |
| `next/src/lib/i18n.ts` | `tools.section` / `tools.videoMissing` 键 | 修改 |
| `next/src/components/video-tools-banner.tsx` | 缺工具非阻塞提醒 | 新建 |
| `next/src/components/tools-status.tsx` | Settings 工具链面板 | 新建 |
| `next/src/components/preview-pane.tsx` | 挂 banner | 修改 |
| `next/src/components/settings-modal.tsx` | 挂工具链面板 | 修改 |

**命令**：单测 `pnpm -F @html-anything/next test`；类型 `pnpm -F @html-anything/next typecheck`；守卫 `pnpm exec tsx scripts/guard.ts`。

**回退**：删新文件 + revert shared/convert/i18n/preview-pane/settings-modal。

---

## Task 1: shared.ts — 抽共享纪律 + pipeline 装配器 + 路由

**Files:**
- Modify: `next/src/lib/templates/shared.ts`
- Test: `next/src/lib/templates/__tests__/shared-pipeline.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/lib/templates/__tests__/shared-pipeline.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import {
  SHARED_DESIGN_DIRECTIVES,
  SHARED_DESIGN_RULES,
  assemblePrompt,
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- shared-pipeline.test.ts`
Expected: FAIL — `SHARED_DESIGN_RULES` / `assemblePromptPipeline` / `assembleForSkill` 未导出。

- [ ] **Step 3: 重构并扩展 `shared.ts`**

打开 `next/src/lib/templates/shared.ts`。做三件事：

(a) 在 `SHARED_DESIGN_DIRECTIVES` 之前，把「设计纪律」整段抽成新常量。新增（放在文件靠前、`SHARED_DESIGN_DIRECTIVES` 之前）：

```ts
/**
 * 与输出模式无关的设计质量纪律。HTML 模式 (`SHARED_DESIGN_DIRECTIVES`) 和
 * pipeline 模式 (`PIPELINE_DIRECTIVES`) 都复用它，避免重复。
 */
export const SHARED_DESIGN_RULES = `【设计准则 — 世界级标准】
- 排版: 中文优先 \`Noto Sans SC\` / \`Noto Serif SC\`, 英文 \`Inter\` / \`Manrope\` / \`SF Pro\` 风格。
- 色彩: 使用 1 个主色 + 2 个中性色 + 至多 1 个强调色; 大胆留白; 不使用纯黑纯白 (#000/#fff), 改用 \`#0a0a0a\` / \`#fafafa\`。
- 网格: 8 px 基线; 段落最大宽度 65 ch; 标题与正文有清晰的层级。
- 微观细节: 圆角统一 (rounded-xl/2xl), 投影柔和 (shadow-sm/lg), 边框 1px \`#e5e7eb\` / \`#262626\`。
- 动效: 仅在必要处使用 \`transition-all\` 或入场 fade-in; 不要喧宾夺主。
- 无障碍: 颜色对比度 ≥ 4.5; 重要交互有 focus 态。

【内容真实性】
- **必须使用用户提供的真实数据**, 不要编造、不要 lorem ipsum、不要 "Your text here"。
- 如果用户数据是结构化数据 (CSV/JSON), 请提取关键洞察并以图表/表格呈现。
- 中文与英文混排时, 中英文之间留半角空格 (盘古之白)。

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
- 用户内容不足以支撑某个图表 / 数据点时, 宁可省略该模块, 也不要填充假数据凑版面。`;
```

(b) 把 `SHARED_DESIGN_DIRECTIVES` 改为引用 `SHARED_DESIGN_RULES`（删掉它内部从「【设计准则】」到「…凑版面。」那一整段，替换为 `${SHARED_DESIGN_RULES}`）。改后它是：

```ts
export const SHARED_DESIGN_DIRECTIVES = `
你是世界级的视觉设计师 + 资深前端工程师。请输出一份**自包含的单文件 HTML**，要求：

【内容驱动数量 — 最高优先级, 覆盖模板里的任何数字】
- 模板只定义"可用版面 / 风格 / 配色 / 字体 / 组件库", **不定义** slide / 帧 / 卡片 / section 的数量。
- 输出的 slide / frame / card / section 数量**完全由【用户内容】的实际长度和信息结构决定**。必须**完整覆盖**用户内容的每一个要点、章节、数据组, **不许总结、压缩、丢弃信息**。
- 如果模板正文里写了类似"挑 6-10 张组成 deck / 输出 6-10 帧 / 3-6 张卡片"的数字, **一律视为短示例下的参考下限, 不是上限**。短内容可以低于该范围, 长内容应远超该范围 — 用户给了 12k 字符的内容, 输出 4-6 张是**严重错误**。
- 模板里的"22 个锁死版面 / 10 个磁带式版面 / N 个 layout"指的是**可复用的版式池**, 同一个版式允许在不同内容上多次出现 (例如 KPI Tower 可以连续用 3 次承载不同章节的数据), 不是页数上限。
- 推荐做法: 先把【用户内容】按语义切成若干段 (章节标题 / 论点 / 数据组 / 列表项 / 步骤), 每一段 → 至少一个独立的 slide / section / card, 然后再从模板的版式池里给每一段挑最合适的版面。宁可多页也不要把多个独立要点硬塞进一页。

【硬性技术要求】
- **禁止使用 Write / Edit / MultiEdit / Bash / Create / 任何文件系统工具**。不要把 HTML 写到任何 \`.html\` 文件里。前端直接捕获你的 stdout 文本, 文件落盘由前端负责。
- 直接把完整的 HTML 文档作为助手回复的正文流式输出。不要先说"我来生成"、"已输出至 …"之类的话。
- 文档以 \`<!DOCTYPE html>\` 开头, 末尾以 \`</html>\` 结束。
- 在 \`<head>\` 中通过 CDN 引入 Tailwind v3 Play (https://cdn.tailwindcss.com) 与所需的 Google Fonts。
- 不要引用任何外部图片 URL（除非你能保证 URL 长期有效；优先使用 CSS / SVG 内联绘制）。
- 必要的脚本（图表、动画）通过 jsdelivr CDN 引入；保持单文件可双击打开即用。
- 输出**纯 HTML**, 不要用 markdown 代码围栏包裹, 不要任何解释性文字。第一个字符必须是 \`<\`。

${SHARED_DESIGN_RULES}

`;
```

(c) 在 `assemblePrompt` 函数之后，新增 pipeline 指令常量 + 两个新函数：

```ts
/**
 * Pipeline 模式前缀：用于「产文件而非产 HTML」的 scenario（如 video）。与
 * `SHARED_DESIGN_DIRECTIVES` 互斥——它解禁文件系统/Bash 工具，指示把交付物写到
 * `out/`，复用 `SHARED_DESIGN_RULES` 的设计纪律。
 */
export const PIPELINE_DIRECTIVES = `
你是世界级的动态设计师 + 资深前端 / 视频工程师。你将**生成并渲染一支短视频**, 把产物写到工作目录。

【运行环境 — 与纯 HTML 模式不同】
- 你运行在一个**隔离的工作目录 (当前 cwd) 里**, 这是你的沙箱。你**可以**使用 Bash / Write / Read / playwright / ffmpeg / node 等工具。
- 把**最终交付物**写到 \`cwd/out/\` 目录: 主产物为一个 **MP4** (H.264 / yuv420p, 浏览器 <video> 可直接播放); 可选再导出一个 \`.gif\` 预览。
- 渲染过程的中间文件 (帧 png、临时脚本) 放在 cwd 根, **不要**放进 \`out/\`; 渲染完成后清理它们。
- **完成后, 在助手回复正文里只打印一段简短中文小结** (你做了什么 + 产物文件名); **禁止**打印二进制 / base64 / 整段渲染日志 / 把 MP4 内容贴出来。

【内容驱动时长与场景】
- 视频的场景数 / 时长由【用户内容】的信息结构决定, 完整覆盖每个要点, 不硬凑也不丢弃。

【推荐渲染管线】
- 先生成一个 1920×1080 的**单文件动画 HTML** (CSS keyframes 时间线驱动, 真实内容, Tailwind CDN)。
- 用 playwright 无头载入它, 按动画总时长以约 30fps 逐帧 screenshot 到一个临时帧目录。
- 用 ffmpeg 把帧序列合成 \`out/<slug>.mp4\` (加 \`-pix_fmt yuv420p\` 保证兼容); 如需 GIF, 用 palettegen / paletteuse 优化。
- 失败时在小结里说明缺什么 (例如未安装 ffmpeg / playwright)。

${SHARED_DESIGN_RULES}

`;

/** Pipeline 模式装配（产文件场景，如 video）。 */
export function assemblePromptPipeline(opts: {
  body: string;
  content: string;
  format: string;
}): string {
  return `${PIPELINE_DIRECTIVES}
${opts.body.trim()}

【输入格式】: ${opts.format}
【用户内容】:
${opts.content}
`;
}

/** 按 skill 的 scenario 选择装配器：video 走 pipeline，其余走 HTML。 */
export function assembleForSkill(
  skill: { scenario: string; body: string },
  content: string,
  format: string,
): string {
  return skill.scenario === "video"
    ? assemblePromptPipeline({ body: skill.body, content, format })
    : assemblePrompt({ body: skill.body, content, format });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- shared-pipeline.test.ts`
Expected: PASS。

并跑既有的 shared 测试确认 HTML 模式不回归：
Run: `pnpm -F @html-anything/next test -- shared.test.ts`
Expected: PASS（Phase 1 的禁令 / 纪律断言仍绿）。

- [ ] **Step 5: 提交**

```bash
git add next/src/lib/templates/shared.ts next/src/lib/templates/__tests__/shared-pipeline.test.ts
git commit -m "feat(templates): pipeline prompt assembler for file-output (video) scenarios"
```

---

## Task 2: 本地工具链探测 `lib/tools/detect.ts`

**Files:**
- Create: `next/src/lib/tools/detect.ts`
- Test: `next/src/lib/tools/__tests__/detect.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/lib/tools/__tests__/detect.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TOOLS, detectTools } from "../detect";

let dir: string;
const prevPath = process.env.PATH;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ha-tools-"));
  // a stub `ffmpeg` executable on the isolated PATH
  const bin = path.join(dir, "ffmpeg");
  fs.writeFileSync(bin, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(bin, 0o755);
  process.env.PATH = dir;
});
afterEach(() => {
  process.env.PATH = prevPath;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("detectTools", () => {
  it("lists every TOOL with availability + resolved path", () => {
    const tools = detectTools();
    expect(tools.map((t) => t.id).sort()).toEqual(["ffmpeg", "node", "playwright"]);
    const ff = tools.find((t) => t.id === "ffmpeg")!;
    expect(ff.available).toBe(true);
    expect(ff.path).toBe(path.join(dir, "ffmpeg"));
    // node is NOT on the stubbed PATH → unavailable
    expect(tools.find((t) => t.id === "node")!.available).toBe(false);
  });
  it("TOOLS covers node/ffmpeg/playwright", () => {
    expect(TOOLS.map((t) => t.id)).toEqual(["node", "ffmpeg", "playwright"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- tools/__tests__/detect.test.ts`
Expected: FAIL — module '../detect' not found.

- [ ] **Step 3: 实现 `next/src/lib/tools/detect.ts`**

```ts
import { resolveOnPath } from "@/lib/agents/detect";

export type ToolId = "node" | "ffmpeg" | "playwright";
export type ToolDef = { id: ToolId; label: string; bins: string[] };

export const TOOLS: ToolDef[] = [
  { id: "node", label: "Node.js", bins: ["node"] },
  { id: "ffmpeg", label: "FFmpeg", bins: ["ffmpeg"] },
  // playwright is commonly invoked via `npx playwright`; treat npx as a fallback.
  { id: "playwright", label: "Playwright", bins: ["playwright", "npx"] },
];

export type ToolStatus = { id: ToolId; label: string; available: boolean; path?: string };

/** Probe each tool on PATH. First matching bin wins. */
export function detectTools(): ToolStatus[] {
  return TOOLS.map((t) => {
    for (const bin of t.bins) {
      const p = resolveOnPath(bin);
      if (p) return { id: t.id, label: t.label, available: true, path: p };
    }
    return { id: t.id, label: t.label, available: false };
  });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- tools/__tests__/detect.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add next/src/lib/tools/detect.ts next/src/lib/tools/__tests__/detect.test.ts
git commit -m "feat(tools): local toolchain detection (node/ffmpeg/playwright)"
```

---

## Task 3: `GET /api/tools`

**Files:**
- Create: `next/src/app/api/tools/route.ts`
- Test: `next/src/app/api/tools/__tests__/route.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/app/api/tools/__tests__/route.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { GET } from "../route";

describe("GET /api/tools", () => {
  it("returns a tools array with id/label/available", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: Array<{ id: string; available: boolean }> };
    expect(body.tools.map((t) => t.id).sort()).toEqual(["ffmpeg", "node", "playwright"]);
    for (const t of body.tools) expect(typeof t.available).toBe("boolean");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- tools/__tests__/route.test.ts`
Expected: FAIL — module '../route' not found.

- [ ] **Step 3: 实现 `next/src/app/api/tools/route.ts`**

```ts
import { NextResponse } from "next/server";
import { detectTools } from "@/lib/tools/detect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tools = detectTools();
    return NextResponse.json({ tools, platform: process.platform });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "detection failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- tools/__tests__/route.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add next/src/app/api/tools
git commit -m "feat(tools): GET /api/tools detection endpoint"
```

---

## Task 4: `video-motion` skill

**Files:**
- Create: `next/src/lib/templates/skills/video-motion/SKILL.md`
- Create: `next/src/lib/templates/skills/video-motion/example.md`
- Test: `next/src/lib/templates/__tests__/video-skill.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/lib/templates/__tests__/video-skill.test.ts`：

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- video-skill.test.ts`
Expected: FAIL — `video-motion` 未发现。

- [ ] **Step 3: 创建 `SKILL.md`**

新建 `next/src/lib/templates/skills/video-motion/SKILL.md`：

```markdown
---
name: video-motion
zh_name: "动态短片"
en_name: "Video Motion"
emoji: "🎬"
description: "把内容做成一支 1920×1080 短视频 (MP4): agent 生成动画 HTML → playwright 抓帧 → ffmpeg 合成"
category: video
scenario: video
aspect_hint: "16:9"
recommended: 5
tags: ["video", "motion", "mp4"]
example_format: "markdown"
example_name: "动态短片 示例"
example_tagline: "一段内容 → 一支 MP4"
---

【Skill: 动态短片 Video Motion】
【意图】把【用户内容】做成一支 1920×1080 的短视频 (MP4), 适合产品介绍 / 数据故事 / 开场片。运行在 pipeline 模式 (你可用 Bash/playwright/ffmpeg, 产物写 out/)。

【动画 HTML 规格】
- 单文件 1920×1080; 用 CSS @keyframes / animation 驱动一条时间线; 每个场景一屏, 入场/出场用 fade / slide, 克制不喧宾夺主。
- 真实内容, 不 lorem; 遵守上面的设计纪律 (主色克制、8px、对比度 ≥4.5)。
- 给每个场景标注时长 (如 data-dur-ms), 或在渲染脚本里写死时间线, 方便逐帧抓取。

【渲染管线】
- 总时长建议 8-20s (随内容多少), 30fps。
- playwright 无头载入 HTML, 按时间线逐帧 screenshot 到临时帧目录 (放 cwd 根, 不进 out/)。
- ffmpeg 合成 `out/<slug>.mp4` (`-r 30 -pix_fmt yuv420p`); slug 用内容主题。
- 可选再导 `out/<slug>.gif` (前 ~6s, palettegen/paletteuse 优化)。
- 渲染完清理临时帧/脚本。

【交付】
- `out/<slug>.mp4` 必出。回复正文只打印中文小结 + 产物文件名, 不要贴日志/二进制。
- 缺 ffmpeg/playwright 时, 在小结里明确说明缺哪个。
```

- [ ] **Step 4: 创建 `example.md`**

新建 `next/src/lib/templates/skills/video-motion/example.md`：

```markdown
为我们的开源项目「Flowboard」做一支 12 秒左右的特性介绍短片。

- 一句话定位: 给小团队的可视化看板, 拖拽即用, 数据本地优先。
- 三个核心特性: ① 实时协作光标; ② 一键导出 PNG/PDF; ③ 离线可用、数据不出本机。
- 调性: 干净、利落、有科技感但不浮夸; 主色用墨绿。
- 收尾给一帧 logo + 一行 slogan「看见你的进度」。

请做成一支可发推/官网首屏的短片。
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- video-skill.test.ts`
Expected: PASS（发现 + 经装配器走 pipeline）。

- [ ] **Step 6: 提交**

```bash
git add next/src/lib/templates/skills/video-motion next/src/lib/templates/__tests__/video-skill.test.ts
git commit -m "feat(skills): add video-motion skill (agent-rendered MP4 via playwright+ffmpeg)"
```

---

## Task 5: 接线 `convert/route.ts` — 用 `assembleForSkill`

**Files:**
- Modify: `next/src/app/api/convert/route.ts`

- [ ] **Step 1: 改 import**

在 `next/src/app/api/convert/route.ts`，把
```ts
import { assemblePrompt } from "@/lib/templates/shared";
```
改为
```ts
import { assembleForSkill } from "@/lib/templates/shared";
```

- [ ] **Step 2: 改非 edit 路径的装配（约第 105 行）**

把
```ts
    prompt = assemblePrompt({ body: skill.body, content, format });
```
改为
```ts
    prompt = assembleForSkill(skill, content, format);
```
（`skill` 是 `LoadedSkill`，带 `scenario` 和 `body`，与 `assembleForSkill` 签名兼容。edit 路径 `buildEditPrompt` 保持不变——视频不走 diff-edit。）

- [ ] **Step 3: 类型检查 + 全量测试（含既有 convert 测试不回归）**

Run: `pnpm -F @html-anything/next typecheck`
Expected: 无错误（确认 `assemblePrompt` 不再被本文件引用，且 `assembleForSkill(skill, …)` 类型匹配）。

Run: `pnpm -F @html-anything/next test`
Expected: 全绿（含 convert 的 missing/invalid taskId → 400 测试；video-skill / shared-pipeline 测试）。

- [ ] **Step 4: 提交**

```bash
git add next/src/app/api/convert/route.ts
git commit -m "feat(convert): route video scenario to the pipeline assembler"
```

---

## Task 6: 缺工具 banner + Settings 工具链面板（i18n）

**Files:**
- Modify: `next/src/lib/i18n.ts`
- Create: `next/src/components/video-tools-banner.tsx`
- Create: `next/src/components/tools-status.tsx`
- Modify: `next/src/components/preview-pane.tsx`
- Modify: `next/src/components/settings-modal.tsx`

- [ ] **Step 1: 加 i18n 键**

READ `next/src/lib/i18n.ts`，找到 `Dict` 接口与 `en` / `zh-CN` 两个字典，以及一个**带参数插值**的现有键（如 `export.section.deck`，确认插值语法是 `{n}` 形式）。按同样模式新增两个键到三处（接口 + en + zhCN）：

- `"tools.section"` → en `"Local toolchain"`，zh-CN `"本地工具链"`
- `"tools.videoMissing"` → en `"Video rendering needs {tools}; not found on this machine — output may fail."`，zh-CN `"视频渲染需要 {tools}，本机未检测到——产物可能生成失败。"`

（`{tools}` 的占位符语法必须与现有带参键一致。）

- [ ] **Step 2: 创建 `next/src/components/video-tools-banner.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useStore, selectActiveTask } from "@/lib/store";
import { getCachedTemplate } from "@/lib/templates";
import { useT } from "@/lib/i18n";
import type { ToolStatus } from "@/lib/tools/detect";

export function VideoToolsBanner() {
  const t = useT();
  const task = useStore(selectActiveTask);
  const [tools, setTools] = useState<ToolStatus[] | null>(null);

  useEffect(() => {
    void fetch("/api/tools")
      .then((r) => (r.ok ? r.json() : { tools: [] }))
      .then((j: { tools?: ToolStatus[] }) => setTools(j.tools ?? []))
      .catch(() => {});
  }, []);

  if (!task || !tools) return null;
  const tpl = getCachedTemplate(task.templateId);
  if (tpl?.scenario !== "video") return null;

  const missing = tools.filter((x) => (x.id === "ffmpeg" || x.id === "playwright") && !x.available);
  if (missing.length === 0) return null;

  return (
    <div className="border-y border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
      ⚠ {t("tools.videoMissing", { tools: missing.map((m) => m.label).join(" + ") })}
    </div>
  );
}
```

> 注：`getCachedTemplate` 从 `@/lib/templates` 导出（picker 拉过模板后即有缓存；未缓存时返回 undefined → banner 不显示，fail-safe）。确认导出名（`getCachedTemplate`）与 `selectActiveTask`（从 `@/lib/store`）存在；若签名不同，按实际导出调整并报告。

- [ ] **Step 3: 创建 `next/src/components/tools-status.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { ToolStatus } from "@/lib/tools/detect";

export function ToolsStatus() {
  const t = useT();
  const [tools, setTools] = useState<ToolStatus[] | null>(null);

  useEffect(() => {
    void fetch("/api/tools")
      .then((r) => (r.ok ? r.json() : { tools: [] }))
      .then((j: { tools?: ToolStatus[] }) => setTools(j.tools ?? []))
      .catch(() => {});
  }, []);

  if (!tools) return null;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-neutral-500">{t("tools.section")}</p>
      <ul className="space-y-1 text-sm">
        {tools.map((tool) => (
          <li key={tool.id} className="flex items-center gap-2">
            <span className={tool.available ? "text-emerald-600" : "text-neutral-400"}>
              {tool.available ? "✓" : "✗"}
            </span>
            <span>{tool.label}</span>
            {tool.path ? <span className="truncate text-xs text-neutral-400">{tool.path}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: 挂载 banner（preview-pane）**

READ `next/src/components/preview-pane.tsx`。加 import：
```ts
import { VideoToolsBanner } from "./video-tools-banner";
```
在预览区**顶部**（iframe 之上、面板根容器内靠前）渲染 `<VideoToolsBanner />`（它自读 store/tools，非视频或工具齐全时返回 null）。选自然位置插入，保持布局。

- [ ] **Step 5: 挂载工具链面板（settings-modal）**

READ `next/src/components/settings-modal.tsx`。加 import：
```ts
import { ToolsStatus } from "./tools-status";
```
在设置内容里一个合适分区（例如靠近 agent 检测/通用区）渲染 `<ToolsStatus />`。选自然位置插入。

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `pnpm -F @html-anything/next typecheck`
Expected: 无错误（i18n 键缺任一 locale 会编译失败——以此确认两 locale 都加了）。

Run: `pnpm -F @html-anything/next test`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add next/src/lib/i18n.ts next/src/components/video-tools-banner.tsx next/src/components/tools-status.tsx next/src/components/preview-pane.tsx next/src/components/settings-modal.tsx
git commit -m "feat(ui): video toolchain banner + settings toolchain panel"
```

---

## Task 7: 全量验证 + 人工冒烟

**Files:** 无新增；运行验证。

- [ ] **Step 1: 全量单测**

Run: `pnpm -F @html-anything/next test`
Expected: 全绿（pipeline 装配 + detect + tools 路由 + video-skill + 既有套件无回归）。

- [ ] **Step 2: 类型检查 + 守卫**

Run: `pnpm -F @html-anything/next typecheck`（干净）
Run: `pnpm -F @html-anything/e2e typecheck`（干净）
Run: `pnpm exec tsx scripts/guard.ts`（`Guard passed.`）

- [ ] **Step 3: 人工冒烟（唯一能验证真实渲染的方式）**

`pnpm -F @html-anything/next dev`（本机需装 ffmpeg + playwright + node）：
- picker 在「视频 video」场景下出现 `🎬 动态短片`。
- 用其 `example.md`（Flowboard 短片）跑一次 Convert（选 claude 或 codex）：agent 应生成动画 HTML、抓帧、ffmpeg 合成 → 结果区产物卡片出现一个 MP4，能内联播放 + 下载。
- 临时把 ffmpeg 从 PATH 移除（或在无 ffmpeg 的机器上）选 video-motion：确认出现非阻塞缺工具 banner；选一个非视频 skill：banner 不显示、行为不变。
- Settings 里「本地工具链」面板显示 node/ffmpeg/playwright 的 ✓/✗。

> 说明：本步骤无法自动化（需真实 agent CLI + ffmpeg + playwright），是 3b 的已知验收边界，spec §6 已记。

---

## Self-Review

- **Spec §3.1（抽 SHARED_DESIGN_RULES + assemblePromptPipeline）** → Task 1 ✅；非回归由新测 + 既有 `shared.test.ts` 双保。
- **Spec §3.2 / §3.3（detectTools / /api/tools）** → Task 2 / Task 3 ✅。
- **Spec §3.4（video-motion skill）** → Task 4 ✅（pipeline 风格 body）。
- **Spec §4.1（convert scenario 分叉）** → Task 5 ✅（`assembleForSkill`，已在 Task 1 单测路由）。
- **Spec §4.2（缺工具非阻塞 banner）** → Task 6 ✅（i18n 化，video scenario + 缺 ffmpeg/playwright 才显示，不禁用）。
- **Spec §6（测试三层 + 人工冒烟硬限制）** → Task 1-4 单测 + Task 7 冒烟 ✅。
- **占位符扫描**：无 TODO/TBD；code step 均完整。banner/面板挂载点由实现者读文件落位（自包含组件）。
- **类型一致性**：`ToolStatus { id; label; available; path? }`、`assembleForSkill(skill:{scenario,body}, content, format)`、`assemblePromptPipeline({body,content,format})` 跨 Task 1/2/3/4/5/6 一致；`video-motion` 的 `scenario: video` 与 `assembleForSkill` 路由匹配。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-09-phase3b-video-pipeline.md`. 两种执行方式：**

**1. Subagent-Driven（推荐）** — 每个 Task 派全新 subagent（提示用只读 git），任务间走 spec+质量两段 review。
**2. Inline Execution** — 本会话内 executing-plans 批量执行，带检查点。

当前已在干净分支 `feat/huashu-phase3b-video-pipeline`（spec 已提交）。
