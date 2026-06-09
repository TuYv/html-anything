# Phase 3c 设计：带解说长视频（Narrated Video）

**状态**: 已批准（设计层），待出实施计划
**日期**: 2026-06-09
**上游**: Phase 3 拆分的最后一期（3a 产物地基、3b 视频 pipeline 已合并）。在 3b 之上加 TTS 配音 + 字幕，产出带解说的视频。

---

## 1. 背景与现状（已对照真实代码）

- **3b 已提供**：`scenario: video` 的 skill 走 `assemblePromptPipeline`（解禁 Bash/playwright/ffmpeg、产物写 `out/`）；工具链探测；`video-motion` skill（无声短片）。
- **3a 已提供**：隔离 workdir + 产物发现 + 沙箱文件服务 + 产物卡片（`video/*` 内联播放）。
- **既有安全密钥模式**（`lib/deploy/config.ts`）：token 存 `~/.html-anything/<provider>.json`，**chmod 0o600**；API GET 返回**掩码**版（明文永不离服务端），PUT 保存、DELETE 清除（`/api/deploy/config`）。
- **agent env**（`agents/argv.ts` `envFor(agent)`）：`{ ...process.env, …agent 专属 }`。`invoke.ts` spawn 时 `env: envFor(opts.agent)`。

**红线**：TTS key 是机密。**镜像 deploy token 的安全模型**——chmod 600 存储、掩码返回、只注入本地 agent 进程 env、绝不进 prompt / 仓库 / 日志。

---

## 2. 四条已确认决策

1. **密钥镜像 deploy token 安全模型**：chmod 600 + 掩码 + 只注入本地 agent env + 只对 `scenario: video`。
2. **通用 OpenAI-兼容 TTS**：用户填 `endpoint` + `apiKey`（+ 可选 `model` / `voice`），skill 让 agent 按 OpenAI-兼容 `/audio/speech` 调用。
3. **优雅降级**：无 key → 产出无声视频 + 小结提示去 Settings 配置；不阻塞。
4. **v1 不做 BGM 混音**；字幕产出独立 `.srt`（不强制烧录）。

---

## 3. 模块结构

### 3.1 `lib/tts/config.ts` — 安全 TTS 配置（镜像 `deploy/config.ts`）
- `type TtsConfig = { endpoint: string; apiKey: string; model?: string; voice?: string }`。
- `type PublicTtsConfig = { configured: boolean; endpoint?: string; model?: string; voice?: string; apiKeyMask?: string }`（**无明文 apiKey**）。
- `ttsConfigPath(): string` → `~/.html-anything/tts.json`（尊重既有的 config 目录覆盖逻辑，与 deploy 一致）。
- `readTtsConfig(): Promise<TtsConfig | null>`、`writeTtsConfig(cfg): Promise<void>`（写时 `mode: 0o600` + best-effort `chmodSync(file, 0o600)`）、`deleteTtsConfig(): Promise<void>`、`publicTtsConfig(cfg | null): PublicTtsConfig`（掩码）。

### 3.2 `app/api/tts/config/route.ts`（镜像 `/api/deploy/config`）
- `GET` → `publicTtsConfig(readTtsConfig())`（掩码）。
- `PUT`（body: `{ endpoint, apiKey, model?, voice? }`）→ 校验非空 endpoint + apiKey → `writeTtsConfig` → 返回掩码版。
- `DELETE` → `deleteTtsConfig` → 返回未配置的掩码版。
- 明文 key 绝不出服务端。

### 3.3 `agents/invoke.ts` — `extraEnv` 注入
- `InvokeOpts` 加 `extraEnv?: Record<string, string>`。
- spawn 时 `env: { ...envFor(opts.agent), ...(opts.extraEnv ?? {}) }`（extraEnv 覆盖在后，仅本进程）。

### 3.4 `video-narrated` skill（`scenario: video`，pipeline 模式）
SKILL.md body（被 3b 的 `PIPELINE_DIRECTIVES` 包裹）指示 agent：
1. 按【用户内容】生成 1920×1080 动画 HTML（同 video-motion 规格）。
2. 写逐场景**解说脚本**（中文，节奏与场景时长匹配）。
3. 若环境变量 `TTS_API_KEY` 非空：用 `POST $TTS_ENDPOINT`（OpenAI-兼容 `/audio/speech`，header `Authorization: Bearer $TTS_API_KEY`，body 含 `model=$TTS_MODEL`、`voice=$TTS_VOICE`、`input=<脚本>`）逐段合成配音音频。
4. 由脚本 + 时间线生成 `out/<slug>.srt` 字幕。
5. playwright+ffmpeg 渲染视频；ffmpeg 把配音轨**混入**视频（`-map` 视频 + 音频，`-shortest`）→ `out/<slug>.mp4`。
6. **优雅降级**：`TTS_API_KEY` 为空 → 产出无声 `out/<slug>.mp4` + `out/<slug>.srt`，小结里提示「在 Settings → TTS 配置密钥可加配音」。
7. 回复正文只打印中文小结 + 产物文件名；不打印 key / 二进制 / 整段日志。
配 `example.md`（一个适合解说的 brief）。

### 3.5 Settings — TTS 配置表单
新组件 `tts-config.tsx`：endpoint / model / voice / key 输入；拉 `GET /api/tts/config` 显示当前（key 掩码）；PUT 保存、DELETE 清除。镜像 deploy token 表单的交互（保存后 key 显示为掩码、可清除）。i18n 化。挂进 settings-modal。

---

## 4. 接线 `convert/route.ts` — 注入 TTS env（仅 video scenario）

非 edit 路径，在算好 `workdirCwd` 后、调 `invokeAgent` 前：
```ts
let extraEnv: Record<string, string> | undefined;
if (skill.scenario === "video") {
  const tts = await readTtsConfig();
  if (tts?.apiKey) {
    extraEnv = {
      TTS_ENDPOINT: tts.endpoint,
      TTS_API_KEY: tts.apiKey,
      ...(tts.model ? { TTS_MODEL: tts.model } : {}),
      ...(tts.voice ? { TTS_VOICE: tts.voice } : {}),
    };
  }
}
```
`invokeAgent({ …, extraEnv })`。key 只对 video scenario、只进 agent 进程 env。

---

## 5. 数据流

用户在 Settings 配好 TTS（key 存 ~/.html-anything chmod 600）→ 选 `video-narrated` → Convert（带 taskId）→ convert 检测 video scenario，读 TTS 配置注入 `extraEnv` → agent 在隔离 workdir：生成动画 HTML + 解说脚本 → 调 `$TTS_ENDPOINT` 合成配音 → 生成 SRT → 渲染 + 混音 → `out/<slug>.mp4` + `.srt` → 产物卡片内联播放 MP4 + 下载 SRT。无 key 则无声降级。

---

## 6. 测试策略

| 层 | 工具 | 覆盖 |
|----|------|------|
| 密钥存储 | vitest | `tts/config`：写时 chmod 0o600；`publicTtsConfig` 掩码（不含明文 apiKey）；read/write/delete 往返 |
| API | vitest | `/api/tts/config` GET 掩码 / PUT 保存 / DELETE 清除 |
| env 注入 | vitest | convert 对 `scenario:video` + 有 TTS 配置时注入 `TTS_API_KEY` 等；非 video / 无配置时不注入（注入逻辑抽成可测函数或测 route 行为）|
| skill 发现 | vitest | `video-narrated` 被 loader 发现、`scenario==="video"`、经 pipeline 装配 |
| 真实配音+渲染 | **人工冒烟** | 配好 TTS，跑 `video-narrated`，确认 out/ 出带声 MP4 + SRT；无 key 时出无声 MP4 + 提示。**自动化无法覆盖**（需 key+网络+ffmpeg）|

---

## 7. 范围 / 非目标

- **不做**：BGM/SFX 混音；burned-in 字幕（出独立 SRT，agent 可选烧）；多 TTS 提供方适配层（用户填 OpenAI-兼容 endpoint 即可）；proactive「TTS 未配置」banner（靠 skill 优雅降级 + Settings 表单）。
- **复用**：3a 产物呈现、3b pipeline + 工具链探测，原样不动。

---

## 8. 改动面 / 回退

- **新增**：`lib/tts/config.ts`、`app/api/tts/config/route.ts`、`templates/skills/video-narrated/{SKILL.md,example.md}`、`components/tts-config.tsx` + 测试。
- **改**：`agents/invoke.ts`（+`extraEnv`）、`app/api/convert/route.ts`（video scenario 注入 TTS env）、`i18n.ts`（TTS 表单文案）、`settings-modal.tsx`（挂 TTS 表单）。
- **不碰**：3a/3b 核心、invoke 其余逻辑、其它 skills。
- 回退 = 删新文件 + revert invoke/convert/i18n/settings。

---

## 9. 验收

- Settings 能配置/掩码显示/清除 TTS（key 落 `~/.html-anything/tts.json` chmod 600，GET 永远掩码）。
- 配好 TTS 后跑 `video-narrated`：out/ 出**带解说**的 MP4 + SRT，产物卡片内联播放、SRT 可下载。
- 未配 TTS 时跑：出无声 MP4 + SRT + 小结提示；不阻塞、不报错。
- 密钥**绝不**出现在 prompt / 仓库 / GET 响应明文 / 日志里；只在本地 agent 进程 env。
- 密钥存储 / API / env 注入 / skill 发现 的单测通过。

---

## 10. 收尾

3c 是 huashu 集成的最后一期。完成后：设计知识层（1）、可编辑 PPTX（2）、视频 pipeline（3b）、带解说长视频（3c）全部落地。后续若要 huashu 的高级转场 / BGM 库 / 多语言配音，可在此基础上各自起新 spec。
