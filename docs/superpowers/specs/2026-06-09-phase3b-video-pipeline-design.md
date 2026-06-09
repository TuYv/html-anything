# Phase 3b 设计：视频 Pipeline（Video Pipeline）

**状态**: 已批准（设计层），待出实施计划
**日期**: 2026-06-09
**上游**: `docs/superpowers/specs/2026-06-08-huashu-integration-design.md` §5 + Phase 3 拆分（3a 产物地基已合并）。本期在 3a 之上，让 `scenario: video` 的 skill 真正产出 MP4/GIF。

---

## 1. 背景与现状（已对照真实代码）

- **agent 今天已具备运行 shell/写文件的能力**：`agents/argv.ts` 给 claude 传 `-p --permission-mode bypassPermissions`、给 codex 传 `exec --sandbox … sandbox_workspace_write.network_access=true`。结合 3a，agent 跑在隔离 workdir（`~/.html-anything/work/<taskId>/`）里。**它本就能跑 ffmpeg/playwright、写文件——当前唯一阻止视频的是 prompt**：`shared.ts` 的 `SHARED_DESIGN_DIRECTIVES` 禁文件系统工具、要求纯 HTML→stdout。
- **3a 产物子系统已就绪**：agent 写到 `out/` 的文件会被 `/api/artifacts` 发现、经沙箱端点服务、在结果区以产物卡片呈现（`video/*` 用 `<video controls>` 内联预览）。3b 直接复用，**不**再碰产物侧。
- **分叉点**：`convert/route.ts:105` 非 edit 路径无条件 `assemblePrompt({ body: skill.body, content, format })`。`skill`（`LoadedSkill`）带 `scenario`。
- **探测范式**：`agents/detect.ts` 的 `resolveOnPath` 已可复用做工具探测。

**安全 posture**：3b **不**给 agent 新增 OS 权限——它只是对 `scenario: video` 的 skill **停止注入「禁用工具」**，并主动指示渲染。能力既存、workdir 已隔离、`scenario:video` 即作用域。用户已选择「自然解禁、不加额外开关」。

---

## 2. 三条已确认决策

1. **MP4 为主交付物**（`<video>` 内联可播），GIF 可选附带。
2. **缺工具 → 非阻塞提醒**，不禁用 skill。
3. **真实渲染只能人工冒烟**；自动化覆盖 prompt 分叉 + 工具探测 + skill 发现。

---

## 3. 模块结构（隔离、单一职责）

### 3.1 `templates/shared.ts` — 新增 `assemblePromptPipeline`
与 `assemblePrompt` 并列的第二个装配器，供「产文件而非产 HTML」的 scenario 用。它注入一段 **pipeline 前缀**（取代 `SHARED_DESIGN_DIRECTIVES` 的「禁工具 / 纯 HTML stdout」部分），保留 huashu 设计纪律：

- 「你运行在一个**隔离工作目录（当前 cwd）**里，**可以**使用 Bash / Write / Read / playwright / ffmpeg / node。」
- 「把最终交付物写到 `cwd/out/`：主产物为 **MP4**（H.264，`<video>` 可播），可另附一个 GIF 预览。」
- 「渲染完成后，在助手回复正文里**只**打印一段简短中文小结（做了什么 + 产物文件名）；**禁止**把二进制 / base64 / 整段日志打印出来。」
- 保留：真实数据、反 AI slop、CJK 字体、8px 网格等设计纪律（从现有共享纪律里抽出「设计准则 + 内容真实性 + 反 slop」复用，仅去掉「禁工具 / 纯 HTML」）。

签名与 `assemblePrompt` 一致：`assemblePromptPipeline(opts: { body: string; content: string; format: string }): string`。

> 实现要点（避免 DRY 违反）：把 `shared.ts` 里「设计纪律」正文抽成一个可复用常量 `SHARED_DESIGN_RULES`，`SHARED_DESIGN_DIRECTIVES`（HTML 模式）和 pipeline 前缀都引用它，各自只加自己的「输出契约」段。

### 3.2 `lib/tools/detect.ts` — 本地工具链探测
- `type ToolDef = { id: "node" | "ffmpeg" | "playwright"; label: string; bins: string[] }`。
- `TOOLS: ToolDef[]`（`ffmpeg`→`["ffmpeg"]`；`node`→`["node"]`；`playwright`→`["playwright", "npx"]`——playwright 常经 `npx playwright`，故 `npx` 视为可用回退）。
- `type ToolStatus = { id: string; label: string; available: boolean; path?: string }`。
- `detectTools(): ToolStatus[]` —— 用 `agents/detect.ts` 导出的 `resolveOnPath` 逐个探测，命中即 `available:true` + `path`。纯函数式（PATH 扫描），喂临时 PATH 即可单测。

### 3.3 `app/api/tools/route.ts` — `GET /api/tools`
`runtime="nodejs"`、`dynamic="force-dynamic"`。返回 `{ tools: detectTools() }`。无入参、无副作用、按需。

### 3.4 `templates/skills/video-motion/`（首个视频 skill）
- `SKILL.md` 前言：`scenario: video`、`category` 视频类、`aspect_hint 16:9`、`emoji 🎬`、`tags ["video","motion","mp4"]`。**body 为 pipeline 风格指令**（被 §3.1 的 pipeline 前缀包裹）：
  1. 按【用户内容】生成一个 **1920×1080 的动画 HTML**（CSS keyframes 时间线；单文件、Tailwind CDN、真实内容）。
  2. 写一个 playwright 脚本：无头载入该 HTML，按时间线时长以 ~30fps 逐帧 `screenshot`。
  3. 用 ffmpeg 把帧序列合成 `out/<slug>.mp4`（H.264、yuv420p、`<video>` 可播）；可选 `out/<slug>.gif`（palette 优化）。
  4. 清理中间帧；回复正文只打印中文小结 + 产物文件名。
- `example.md`：一个示例 brief（如「为某产品做一支 15s 的特性介绍短片」）。
- （**无** example.html —— 视频 skill 的预览是产物 MP4，不是静态 HTML。）

---

## 4. 接线

### 4.1 `convert/route.ts` — scenario 分叉
非 edit 路径（约 102-104 行）改为：
```ts
prompt = skill.scenario === "video"
  ? assemblePromptPipeline({ body: skill.body, content, format })
  : assemblePrompt({ body: skill.body, content, format });
```
其余（workdir cwd、SSE、taskId 校验）不变。edit 路径（diff-edit）保持原样（视频不走 diff-edit）。

### 4.2 缺工具非阻塞提醒（客户端）
- 客户端拉一次 `GET /api/tools`，存入 store（或局部 state）。
- 当**当前 skill 的 scenario === "video"** 且 `ffmpeg` 或 `playwright` 不可用时，结果区/工具栏显示一条非阻塞 banner：「视频渲染需要 ffmpeg + playwright，本机未检测到 X / Y —— 产物可能生成失败」。可用则不显示。**不**禁用转换按钮。

---

## 5. 数据流

用户选 `video-motion` → Convert（带 taskId）→ 路由检测 `scenario:video` → `assemblePromptPipeline` → agent 在隔离 workdir 跑：生成动画 HTML、playwright 抓帧、ffmpeg 合成 → 写 `out/x.mp4` → SSE `done` → 客户端拉 `/api/artifacts` → 产物卡片 `<video>` 内联播放 + 下载。缺工具时提前给非阻塞提醒。

---

## 6. 测试策略

| 层 | 工具 | 覆盖 |
|----|------|------|
| prompt 分叉 | vitest | `assemblePromptPipeline`：**不含**「禁止使用 Write」类禁令；**含** `out/`、`ffmpeg`、MP4 指引、用户内容；保留设计纪律（如 `盘古之白`）。并测 `SHARED_DESIGN_RULES` 抽取后 `assemblePrompt`（HTML 模式）仍含禁令 + 纪律（不回归）|
| 工具探测 | vitest | `detectTools`：注入临时 PATH（含/不含某工具的桩 bin）→ 断言 available/path；`/api/tools` handler 返回结构 |
| skill 发现 | vitest | `video-motion` 被 loader 发现、`scenario==="video"` |
| 真实渲染 | **人工冒烟** | 跑 `video-motion`，确认 `out/` 出 MP4、产物卡片内联播放、下载可用。**自动化无法覆盖**（需 agent CLI + ffmpeg + playwright）|
| e2e（可选） | Playwright | 计划阶段定：可断言「选 video skill 时 UI 出现缺工具 banner」之类的纯前端行为，不实际渲染 |

---

## 7. 范围 / 非目标

- **不做**：TTS / 配音 / 字幕 / BGM 混音（全在 3c）；huashu 的转场/调色高级脚本（v1 让 agent 自写最小 render）；vendored 渲染脚本（YAGNI，先用 agent 自写验证 pipeline）。
- **不做**：服务端渲染 / daemon（铁律）——渲染全在 agent 的 shell。
- **复用**：3a 的 workdir / 产物发现 / 文件服务 / 卡片，原样不动。

---

## 8. 改动面 / 回退

- **新增**：`lib/tools/detect.ts`、`app/api/tools/route.ts`、`templates/skills/video-motion/{SKILL.md,example.md}` + 测试。
- **改**：`templates/shared.ts`（抽 `SHARED_DESIGN_RULES` + 加 `assemblePromptPipeline`）、`convert/route.ts`（scenario 分叉）、Settings（工具链面板）、结果区/工具栏（缺工具 banner）+ 客户端拉 `/api/tools`。
- **不碰**：invoke 核心、3a 产物模块、其它 export/skills。
- 回退 = 删新文件 + revert 分叉/面板/banner/抽取。

---

## 9. 验收

- 选 `video-motion`、给一段真实内容、Convert（本机有 ffmpeg+playwright）：`out/` 出一个可播的 MP4，结果区产物卡片内联播放 + 下载可用。
- 本机缺 ffmpeg/playwright 时，选 video skill 出现非阻塞提醒；非视频 skill 不受影响、行为不变。
- `assemblePromptPipeline` 不含工具禁令、含 out/+ffmpeg 指引；HTML 模式 `assemblePrompt` 抽取后不回归（仍含禁令 + 纪律）。
- `detectTools` / `/api/tools` / `video-motion` 发现 的单测通过。

---

## 10. 与 3c 的边界

3b 交付「`scenario:video` skill 能经 agent 在隔离 workdir 产出 MP4/GIF 并在 UI 呈现」。3c 在此之上加：TTS 配音（doubao，需 key → Settings，红线不硬编码）、字幕、`mix-voiceover` 混音 → 带解说长视频。3c 复用 3b 的 pipeline prompt + 3a 的产物呈现。
