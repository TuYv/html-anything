# Huashu Design → html-anything 集成设计

**状态**: 已批准（设计层），待出 Phase 1 实施计划
**日期**: 2026-06-08
**目标**: 分三期把 [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design) 的能力集成进 html-anything，最终覆盖「设计知识层 + 可编辑 PPTX + 动画/MP4 + 带解说长视频」。每期独立可验证、可回退。

---

## 1. 架构约束（决定一切取舍）

已对照真实代码确认（非沙箱推断）：

1. **产物模型 = 内联 HTML**。`agents/invoke.ts` 在 cwd 用 `bypassPermissions` spawn 本地 agent CLI，stdout 流进 iframe `srcdoc`；所有导出在浏览器侧（juice / modern-screenshot）。
2. **无 daemon / 无服务进程铁律**。`export/remotion.ts` 明写禁止服务器渲染 mp4 / 长进程；视频策略是「导出 Remotion 工程 zip，用户本地 render」。
3. **`templates/shared.ts` 硬禁文件系统工具**。`SHARED_DESIGN_DIRECTIVES` 禁 Write/Edit/MultiEdit/Bash/任何文件系统工具，要求纯 HTML 输出到 stdout（第一个字符必须是 `<`）。→ 与 huashu 的资产下载 / 视频 pipeline 直接冲突，**Phase 3 必须分叉 prompt 组装**。

**逃生通道**: app 已经在 cwd 里用 `bypassPermissions` 驱动本地 agent CLI，agent 自身能跑任意脚本（playwright / ffmpeg）。所以 huashu 的视频流水线**不需要塞进 Next 服务器**——它在 agent 的 shell 里跑，和今天 huashu 装在 Claude Code 里一模一样。html-anything 只需做两件事：把脚本/知识送到 cwd，再把 agent 写到 cwd 的产物（MP4/GIF/PPTX）捞出来展示。

**现成设施**: marketplace（`skills/install.ts`）已能从公开 GitHub 装「根目录 SKILL.md」布局的 skill（huashu-design 正是此布局）。gap：install 目前只拷 `SKILL.md` + `example.{html,md}`，会丢掉 huashu 赖以工作的 `references/`（24 篇）、`scripts/`（15 个）、`assets/`（BGM/SFX）。

---

## 2. 能力分类与契合度

| 能力 | 产出 | 与内联-HTML 模型契合度 | Phase |
|------|------|------------------------|-------|
| 反 AI slop / 8px 网格 / CJK 字体 / 真实数据 | prompt 知识 | ✅ 部分已在 `shared.ts` | 1 |
| 品牌资产协议 + 事实验证先行 | prompt + 工具 | ⚠️ 与「禁文件系统工具」冲突，知识版进 1，下载版进 3 | 1 / 3 |
| 设计方向顾问（三套逻辑 → 3 版） | HTML | ✅ 映射为「单 HTML 内并排 3 变体」 | 1 |
| 5 维评审（雷达图 + Keep/Fix/Quick Wins） | HTML | ✅ 纯 HTML 产出 | 1 |
| 40 风格库（网页 20 + PPT 20） | prompt 知识 | ✅ 注入顾问 / 评审 skill 的内嵌附录 | 1 |
| 可编辑 PPTX（html2pptx 保文本框） | `.pptx` | ⚠️ 与现有 `export/deck.ts` + pptxgenjs 重叠 | 2 |
| 动画 → MP4/GIF（Stage+Sprite / playwright 逐帧 / ffmpeg） | MP4/GIF | ❌ 需新「非 HTML artifact」子系统 | 3 |
| 带解说长视频（TTS 配音 + 字幕 + 混音） | MP4 + 音轨 | ❌ 最复杂，依赖上一条 + TTS 服务 | 3 |

---

## 3. Phase 1 — 设计知识层（可实施，零新依赖，路径 B 原生移植）

huashu 的招牌价值「看起来像大厂设计团队」本质是 **prompt 纪律**，不是代码。原生化它，不碰任何子系统架构。

### 3.1 增强 `templates/shared.ts`
在现有 `SHARED_DESIGN_DIRECTIVES` 里追加 huashu 纪律：
- **反 AI slop 黑名单**：禁默认紫蓝渐变、禁全 emoji 标题、禁居中 hero 套路、禁 lorem。
- **品牌呈现纪律（知识版）**：Phase 1 不下载 logo，只约束「用户给了品牌色 / logo / 字体就必须用上，不得自创」。
- **事实验证提示（非强制）**：app 不控 agent 工具集，故只能提示「涉及可验证事实时优先用真实数据、不臆造数字」。

实现要点：单一字符串常量追加，**不改 `assemblePrompt` 签名**；加约束关键词的单测（验证新指令出现在装配后的 prompt 里）。

### 3.2 新 skill `design-advisor/`
`scenario: design`。**关键映射**：huashu 的「并行 3 个 agent 出 3 版」落成 **一个 HTML 内并排 3 个差异化方向的 `<section>`**（每个标风格名 + 适用场景 + 色板 + 字体样张）。完美贴 iframe 模型，零架构改动。配 `example.html`。

### 3.3 新 skill `design-review/`
输出评审报告 HTML：5 维雷达图（纯 CSS/SVG 内联绘制，禁外链图）+ Keep / Fix / Quick Wins 三栏。维度命名沿用 huashu `references/critique-guide.md`（实现时抓取确认）。

### 3.4 40 风格库
**不新建 design-system 子系统**（代码里不存在该构造，YAGNI）。把 huashu `references/` 里的风格清单蒸馏成精简速查，作为 3.2 / 3.3 两个 SKILL.md 的内嵌附录。可选增量：挑 3–5 个高价值风格做独立原型 skill。

### Phase 1 改动面 / 回退
- 改动：`shared.ts` 一处追加 + 2 个纯数据 skill 文件夹（`loader.ts` 自动扫描，**无 TS 改动**）。
- 不碰：`invoke` / `export` / `store` / API 路由 / `scenarios.ts`（design 键已存在）。
- 回退 = 删两个文件夹 + revert `shared.ts` 一处。

---

## 4. Phase 2 — 产物子系统地基 + 可编辑 PPTX（设计 altitude）

- **非 HTML artifact 概念**：扩展 `argv.ts` 的 `rescueHtmlFromToolUse` 思路成 `rescueArtifactFromToolUse`，或约定 agent 写 cwd 下 `out/`，API 扫目录返回文件清单 → 结果区「文件卡片」（下载 + 适配预览）。app 不转码，只发现 + 暴露（守无 daemon 铁律）。
- **本地工具链探测**：仿 `agents/detect.ts` 的 PATH 扫描，探 `node` / `ffmpeg` / `playwright`，Settings 展示并置灰缺失能力。
- **可编辑 PPTX**：倾向方案 (a)——浏览器/Node 侧用现有 `pptxgenjs` 从 deck 结构化数据直接生成保文本框 PPTX，留在现有 export 架构内、零本地依赖；(b) vendor huashu `html2pptx.js` 由 agent 跑，作为备选。

---

## 5. Phase 3 — 动画→MP4/GIF + 长视频（设计 altitude，路径 A+C 合流）

- **prompt 组装分叉（关键）**：新增 `assemblePromptPipeline`（或给 `assemblePrompt` 加 `mode: "html" | "pipeline"`）。pipeline 模式**不注入**「禁文件系统工具」，改注入「可用 Bash 在 cwd 生成 MP4/GIF/音频，产物写 `out/`」。仅对 `scenario: video`（taxonomy 已支持）开启，沿用 agent 自身 `bypassPermissions` 边界，不新增攻击面。
- **vendor 脚本**：扩展 `install.ts` 拷 `references/` `scripts/` `assets/`（守大小上限），或随 app bundle huashu 所需 `scripts/`。agent 跑 `render-video.js`（playwright 逐帧）+ ffmpeg（插帧 / 调色 / GIF palette）→ MP4/GIF 进 Phase 2 的 artifact 面板（`<video>` 预览 + 下载）。
- **长视频最后做**：TTS（doubao `tts-doubao.mjs`）+ 字幕 + `mix-voiceover.sh`。需 TTS key → Settings 配置项（**红线：不硬编码 key**）。

---

## 6. 验收

| Phase | 验收标准 |
|-------|----------|
| 1 | picker 出现 `design-advisor` / `design-review` 两个新 skill；能产出「并排 3 变体 / 评审报告」HTML；`shared.ts` 新约束单测通过 |
| 2 | deck 能导出可编辑文本框 PPTX；非 HTML 产物在结果区出现文件卡片 |
| 3 | 视频 skill 在工具链就绪时产出 MP4/GIF 并在面板预览 / 下载 |

**执行顺序**: Phase 1 全程跑通并合并 → Phase 2 → Phase 3（在 2 的 artifact 地基稳定后）。每期各走 spec → plan → 实现。

---

## 7. 血缘备注

html-anything README 自述站在四个开源肩膀上，其一即 `alchaincyf/huashu-md-html`（huashu-design 前身 / 同作者）。`shared.ts` 现有的反 slop / CJK / 8px / 真实数据约束正源自此。血缘链：Claude Design → huashu(-md-html / -design) → html-anything 的 SKILL 约束。本集成是把同源能力的「纵深」补回 app 侧。
