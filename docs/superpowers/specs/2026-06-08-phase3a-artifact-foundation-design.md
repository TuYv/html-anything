# Phase 3a 设计：产物子系统地基（Artifact Foundation）

**状态**: 已批准（设计层），待出实施计划
**日期**: 2026-06-08
**上游**: `docs/superpowers/specs/2026-06-08-huashu-integration-design.md` §5 的拆分。Phase 3（动画→MP4/GIF + 长视频）经 brainstorming 判定为多子系统，拆为：

- **3a（本期）** — 产物子系统地基：每任务 workdir + `out/` 产物发现 + 沙箱文件服务端 + UI 产物卡片。独立可用可测，不碰视频。
- **3b** — 视频 pipeline：prompt 组装分叉（`scenario: video` 解禁文件系统工具）+ 工具链探测（ffmpeg/playwright/node）+ 首个视频 skill + vendored 脚本 → MP4/GIF，经 3a 呈现。
- **3c** — 带解说长视频：TTS + 字幕 + 混音，依赖 3b。

**安全 posture 备注**：3a **只发现并呈现**文件，不改变信任边界。让 agent 跑任意 shell（ffmpeg/playwright）的 posture 变化落在 3b，届时再显式确认。

---

## 1. 背景与现状（已对照真实代码）

- `agents/invoke.ts`：`spawn(bin, argv, { cwd: opts.cwd ?? process.cwd(), … })`。输出**只**从 stdout 解析 → `delta`/`html`/`meta` 事件经 SSE 流回 iframe `srcdoc`。**写到磁盘的二进制文件对当前模型不可见** —— 这是核心 gap。
- `app/api/convert/route.ts` 与 `app/api/draft/route.ts`：`cwd` 来自请求 **body**，而客户端目前**不传** cwd（`use-convert.ts` 只把 agent 上报的 `cwd` meta 渲染进日志，不设置它）。所以 agent 实际跑在 Next 服务的 `process.cwd()`（`next/` 目录）—— 无隔离。
- `~/.html-anything/` 已是既定本地约定（deploy config、marketplace skills 都在此，chmod 600）。
- 铁律「no daemon / no 服务端长进程 / no 服务端渲染」（`export/remotion.ts` 引 CONTRIBUTING）。3a 全是按需同步 fs 扫描 + 无状态 GET，**不引入 watcher / 长进程**。

---

## 2. 三条已确认的关键决策

1. **所有生成都切到隔离 workdir**（不只视频）：比今天跑在 app 源码树里更安全；纯 HTML skill 不写文件 → 无产物卡片 → 现有 UX 不变。
2. **发现与 SSE 解耦**：客户端收到 `done` 后再 `GET /api/artifacts?task=<id>`，而不是把产物塞进 SSE 流。
3. **清理走任务删除**：任务从历史删除时删对应 workdir。

---

## 3. 模块结构（隔离、单一职责）

### 3.1 `next/src/lib/artifacts/workdir.ts`
- `sanitizeTaskId(id: string): string` — 仅允许 `[A-Za-z0-9_-]`；其余（含 `.`、`/`、`\`、空）一律拒（抛或返回 null）。挡路径穿越的第一道闸。
- `taskWorkdir(taskId: string): string` — `path.join(homedir(), ".html-anything", "work", sanitizeTaskId(taskId))`。
- `taskOutDir(taskId: string): string` — `path.join(taskWorkdir(taskId), "out")`。
- `ensureWorkdir(taskId: string): { dir: string; outDir: string }` — `mkdir -p` 两者，返回路径。
- `removeWorkdir(taskId: string): void` — `rm -rf` 该任务 workdir（清理用）。

### 3.2 `next/src/lib/artifacts/discover.ts`
- `type Artifact = { name: string; relPath: string; size: number; mime: string }`。
- `mimeForExt(name: string): string` — 扩展名→mime 映射表（mp4/webm/gif/png/jpg/pdf/pptx/zip/svg/txt/json…），未知 → `application/octet-stream`。
- `listArtifacts(taskId: string): Artifact[]` — 递归扫 `out/`（深度有限，比如 ≤3 层；忽略隐藏文件、目录本身）。每个文件返回 `{ name, relPath(相对 out/), size, mime }`。`out/` 不存在 → 返回 `[]`。纯 fs，喂临时目录即可单测。

---

## 4. API 路由（无 daemon：都是按需）

### 4.1 `GET /api/artifacts?task=<id>`
返回 `{ artifacts: Artifact[] }`（调 `listArtifacts`）。`task` 非法（`sanitizeTaskId` 拒）→ 400。

### 4.2 `GET /api/artifacts/file?task=<id>&path=<relPath>`
流式返回 `out/<relPath>` 文件本体 + 正确 `Content-Type`（按 `mimeForExt`）+ `Content-Disposition`（inline 给可预览类型，否则 attachment）。
**安全核心**：
- `taskId` 走 `sanitizeTaskId`。
- `path` 先 `path.resolve(outDir, relPath)`，再断言 `resolved === outDir || resolved.startsWith(outDir + path.sep)`；否则 **404**（不泄漏存在性）。挡 `../../etc/passwd`、绝对路径、符号链接逃逸（额外 `fs.realpath` 后再断言一次更稳）。
- 文件不存在 / 是目录 → 404。

### 4.3 `DELETE /api/artifacts?task=<id>`
`removeWorkdir(taskId)` → `{ ok: true }`。客户端在任务从历史删除时调用。

---

## 5. 接线 convert/draft 路由

- 两个路由的 body 增加 `taskId: string`（必填；客户端已有 store task id）。
- 路由内：`const { outDir, dir } = ensureWorkdir(taskId)`；把 `invokeAgent` 的 `cwd` 设为 `dir`（替换/忽略 body 里的 `cwd`）。
- agent 把交付物写到 `cwd/out/`（3a 不强制 agent 这么做——现有 HTML skill 不写文件；3b 的 pipeline prompt 才会指示写 `out/`）。
- SSE 不变（仍流 delta/html/meta/done）。发现独立：客户端收 `done` 后拉 `/api/artifacts`。

> 兼容性：`taskId` 设为必填会要求客户端同步传。若担心旧调用，路由对缺失 `taskId` 回 400 并在 message 里说明——但客户端在同一 PR 内更新，不留半态。

---

## 6. 客户端 / store

- `use-convert.ts`（及 draft 调用处）：请求体带上当前 `taskId`。
- store：task 模型加 `artifacts?: Artifact[]` + 一个 setter（`setTaskArtifacts(taskId, artifacts)`）。
- `done` 后：`GET /api/artifacts?task=<id>` → 存到该 task。
- 任务删除流程：调用 `DELETE /api/artifacts?task=<id>`（best-effort，失败不阻塞删除）。
- 新组件 `next/src/components/artifact-cards.tsx`：遍历 `task.artifacts`，每个一张卡 —— 文件名 + 人类可读大小 + 下载链接（`href` 指向 `/api/artifacts/file?task=…&path=…`，`download` 属性）；`image/*` 用 `<img>`、`video/*` 用 `<video controls>` 内联预览，其余仅下载。挂在结果区（预览面板下方或旁侧）。空 artifacts → 不渲染。

---

## 7. 测试

| 层 | 工具 | 覆盖 |
|----|------|------|
| 纯逻辑 | vitest | `sanitizeTaskId`（挡 `../`/绝对路径/空/`.`）；`mimeForExt`；`listArtifacts`（临时目录建 mp4/png/txt → 断言 name/relPath/size/mime、out/ 缺失返 []）|
| 安全 | vitest | 文件端点穿越守卫：`path=../../etc/passwd`、绝对路径、`out/../secret` 全部拒（直接测守卫函数或 GET handler）|
| 集成 | vitest | 调 `GET /api/artifacts` handler 喂 fixture workdir → 断言列表；调 file handler → 断言流内容 + 越界 404 |
| e2e | Playwright（可选，计划定深度）| 磁盘放 fixture 产物 + seed 任务 → 断言卡片出现、下载链接可点 |
| 人工冒烟 | — | 跑一个写 `out/hello.txt` 的简单 skill → 卡片 + 下载可用 |

---

## 8. 改动面 / 回退

- **新增**：`lib/artifacts/workdir.ts`、`lib/artifacts/discover.ts`、`app/api/artifacts/route.ts`、`app/api/artifacts/file/route.ts`、`components/artifact-cards.tsx` + 测试。
- **改**：`app/api/convert/route.ts`、`app/api/draft/route.ts`（加 `taskId` + workdir cwd）；`use-convert.ts`（传 taskId + done 后拉产物）；store（task.artifacts + setter + 删除时清理）；结果区挂 `artifact-cards`。
- **不碰**：invoke.ts 核心、skills、export/*、scenarios。
- 回退 = 删新文件 + revert 路由/客户端/store 的接线。

---

## 9. 验收

- 一个会往 `out/` 写文件的简单 skill 跑完后，结果区出现产物卡片：文件名/大小正确，点击能下载，图片/视频内联预览。
- 纯 HTML skill 跑完无产物卡片，现有 UX 不变。
- 文件端点对 `../` / 绝对路径 / 越界 `path` 一律 404；`taskId` 非法 400。
- 任务删除后对应 workdir 被清。
- 纯逻辑 + 安全 + 集成单测通过。

---

## 10. 与 3b 的边界

3a 交付「app 能给 agent 一个隔离 workdir，并发现/服务/呈现它写到 `out/` 的文件」。3b 在此之上加：①`scenario: video` 的 pipeline prompt（解禁 Bash/文件工具、指示写 `out/`）；②工具链探测 + 缺工具置灰；③首个视频 skill + vendored render/ffmpeg 脚本。3a 不依赖任何 3b 构件，可独立合并。
