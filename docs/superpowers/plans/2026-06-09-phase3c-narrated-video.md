# Phase 3c — Narrated Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. When dispatching review subagents, instruct READ-ONLY git only (never `git checkout`/`switch`) — the working tree is shared.

**Goal:** 给 `scenario: video` 的 skill 加 TTS 配音能力：安全存储 TTS 密钥（镜像 deploy token）、只对 video scenario 注入到本地 agent env、新增 `video-narrated` skill 产出带解说的 MP4 + SRT，复用 3a/3b。

**Architecture:** `lib/tts/config.ts` 镜像 `deploy/config.ts`（`~/.html-anything/tts.json` chmod 600、掩码返回、`HTML_ANYTHING_USER_STATE_DIR` 可覆盖供测试）。纯函数 `ttsEnvForSkill(scenario, cfg)` 决定注入哪些 `TTS_*` env。`invoke.ts` 加 `extraEnv`，`convert/route.ts` 对 video scenario 读 TTS 配置注入。`video-narrated` skill 在 3b pipeline 里调 OpenAI-兼容 TTS、混音、出 SRT。真实配音/渲染只能人工冒烟。

**Tech Stack:** Next.js route handlers · node:fs/os/path · vitest · zustand-free（配置走 API）· i18n。

**Spec:** `docs/superpowers/specs/2026-06-09-phase3c-narrated-video-design.md`。

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `next/src/lib/tts/config.ts` | 安全 TTS 配置 + 掩码 + `ttsEnvForSkill` | 新建 |
| `next/src/lib/tts/__tests__/config.test.ts` | 存储/掩码/env 注入单测 | 新建 |
| `next/src/app/api/tts/config/route.ts` | GET/PUT/DELETE 配置 | 新建 |
| `next/src/app/api/tts/config/__tests__/route.test.ts` | 路由单测 | 新建 |
| `next/src/lib/agents/invoke.ts` | `InvokeOpts.extraEnv` + 合并进 spawn env | 修改 |
| `next/src/lib/templates/skills/video-narrated/SKILL.md` | narrated skill | 新建 |
| `next/src/lib/templates/skills/video-narrated/example.md` | 示例 brief | 新建 |
| `next/src/lib/templates/__tests__/narrated-skill.test.ts` | 发现 + pipeline 装配 | 新建 |
| `next/src/app/api/convert/route.ts` | video scenario 注入 TTS env | 修改 |
| `next/src/lib/i18n.ts` | TTS 表单文案键 | 修改 |
| `next/src/components/tts-config.tsx` | Settings TTS 表单 | 新建 |
| `next/src/components/settings-modal.tsx` | 挂 TTS 表单 | 修改 |

**命令**：单测 `pnpm -F @html-anything/next test`；类型 `pnpm -F @html-anything/next typecheck`；守卫 `pnpm exec tsx scripts/guard.ts`。

**回退**：删新文件 + revert invoke/convert/i18n/settings。

---

## Task 1: `lib/tts/config.ts` — 安全配置 + 掩码 + env 注入决策

**Files:**
- Create: `next/src/lib/tts/config.ts`
- Test: `next/src/lib/tts/__tests__/config.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/lib/tts/__tests__/config.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ttsConfigPath,
  readTtsConfig,
  writeTtsConfig,
  deleteTtsConfig,
  publicTtsConfig,
  ttsEnvForSkill,
  SAVED_TTS_KEY_MASK,
} from "../config";

let dir: string;
const prev = process.env.HTML_ANYTHING_USER_STATE_DIR;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ha-tts-"));
  process.env.HTML_ANYTHING_USER_STATE_DIR = dir;
});
afterEach(() => {
  if (prev === undefined) delete process.env.HTML_ANYTHING_USER_STATE_DIR;
  else process.env.HTML_ANYTHING_USER_STATE_DIR = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("tts config storage", () => {
  it("writes with chmod 600 and round-trips, public masks the key", async () => {
    const pub = await writeTtsConfig({ endpoint: "https://x/v1/audio/speech", apiKey: "secret123", model: "tts-1", voice: "alloy" });
    expect(pub.configured).toBe(true);
    expect(pub.apiKeyMask).toBe(SAVED_TTS_KEY_MASK);
    expect(JSON.stringify(pub)).not.toContain("secret123"); // no plaintext key in public shape

    const file = ttsConfigPath();
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);

    const raw = await readTtsConfig();
    expect(raw.apiKey).toBe("secret123");
    expect(raw.endpoint).toBe("https://x/v1/audio/speech");
  });

  it("PUT with the mask keeps the existing key (does not overwrite with mask)", async () => {
    await writeTtsConfig({ endpoint: "https://x", apiKey: "secret123" });
    await writeTtsConfig({ endpoint: "https://y", apiKey: SAVED_TTS_KEY_MASK });
    const raw = await readTtsConfig();
    expect(raw.apiKey).toBe("secret123");
    expect(raw.endpoint).toBe("https://y");
  });

  it("requires endpoint + apiKey", async () => {
    await expect(writeTtsConfig({ endpoint: "", apiKey: "k" })).rejects.toThrow();
    await expect(writeTtsConfig({ endpoint: "https://x", apiKey: "" })).rejects.toThrow();
  });

  it("delete clears the file", async () => {
    await writeTtsConfig({ endpoint: "https://x", apiKey: "k" });
    const pub = await deleteTtsConfig();
    expect(pub.configured).toBe(false);
    expect(fs.existsSync(ttsConfigPath())).toBe(false);
  });

  it("read returns empty config when absent", async () => {
    const raw = await readTtsConfig();
    expect(raw).toEqual({ endpoint: "", apiKey: "", model: "", voice: "" });
  });
});

describe("ttsEnvForSkill", () => {
  const cfg = { endpoint: "https://x", apiKey: "k", model: "m", voice: "v" };
  it("injects TTS_* only for video scenario with a key", () => {
    expect(ttsEnvForSkill("video", cfg)).toEqual({
      TTS_ENDPOINT: "https://x", TTS_API_KEY: "k", TTS_MODEL: "m", TTS_VOICE: "v",
    });
  });
  it("returns undefined for non-video", () => {
    expect(ttsEnvForSkill("design", cfg)).toBeUndefined();
  });
  it("returns undefined when no key", () => {
    expect(ttsEnvForSkill("video", { endpoint: "https://x", apiKey: "", model: "", voice: "" })).toBeUndefined();
  });
  it("omits optional model/voice when empty", () => {
    expect(ttsEnvForSkill("video", { endpoint: "https://x", apiKey: "k", model: "", voice: "" })).toEqual({
      TTS_ENDPOINT: "https://x", TTS_API_KEY: "k",
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- tts/__tests__/config.test.ts`
Expected: FAIL — module '../config' not found.

- [ ] **Step 3: 实现 `next/src/lib/tts/config.ts`**

```ts
import { promises as fsp, chmodSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Local TTS credentials, stored at `~/.html-anything/tts.json` (chmod 600),
 * mirroring `lib/deploy/config.ts`. The plaintext key never leaves the server:
 * the public shape masks it. `HTML_ANYTHING_USER_STATE_DIR` redirects storage
 * (used by tests).
 */
export type TtsConfig = { endpoint: string; apiKey: string; model: string; voice: string };
export type PublicTtsConfig = {
  configured: boolean;
  endpoint: string;
  model: string;
  voice: string;
  apiKeyMask: string;
};

export const SAVED_TTS_KEY_MASK = "saved-tts-key";

export function ttsConfigPath(): string {
  const base = process.env.HTML_ANYTHING_USER_STATE_DIR || path.join(homedir(), ".html-anything");
  return path.join(base, "tts.json");
}

function isEnoent(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === "object" && err !== null && "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function readTtsConfig(): Promise<TtsConfig> {
  try {
    const raw = await fsp.readFile(ttsConfigPath(), "utf8");
    const p = JSON.parse(raw) as Partial<TtsConfig>;
    return {
      endpoint: typeof p.endpoint === "string" ? p.endpoint : "",
      apiKey: typeof p.apiKey === "string" ? p.apiKey : "",
      model: typeof p.model === "string" ? p.model : "",
      voice: typeof p.voice === "string" ? p.voice : "",
    };
  } catch (err) {
    if (isEnoent(err)) return { endpoint: "", apiKey: "", model: "", voice: "" };
    throw err;
  }
}

export function publicTtsConfig(cfg: TtsConfig): PublicTtsConfig {
  return {
    configured: !!cfg.apiKey,
    endpoint: cfg.endpoint,
    model: cfg.model,
    voice: cfg.voice,
    apiKeyMask: cfg.apiKey ? SAVED_TTS_KEY_MASK : "",
  };
}

export async function writeTtsConfig(input: Partial<TtsConfig>): Promise<PublicTtsConfig> {
  const current = await readTtsConfig();
  const keyInput = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const next: TtsConfig = {
    endpoint: typeof input.endpoint === "string" ? input.endpoint.trim() : current.endpoint,
    // mask string means "keep existing" — never persist the mask as the key.
    apiKey: keyInput && keyInput !== SAVED_TTS_KEY_MASK ? keyInput : current.apiKey,
    model: typeof input.model === "string" ? input.model.trim() : current.model,
    voice: typeof input.voice === "string" ? input.voice.trim() : current.voice,
  };
  if (!next.endpoint) throw new Error("TTS endpoint is required");
  if (!next.apiKey) throw new Error("TTS API key is required");
  const file = ttsConfigPath();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    /* best-effort on FS without mode support */
  }
  return publicTtsConfig(next);
}

export async function deleteTtsConfig(): Promise<PublicTtsConfig> {
  try {
    await fsp.unlink(ttsConfigPath());
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  return publicTtsConfig({ endpoint: "", apiKey: "", model: "", voice: "" });
}

/**
 * The `TTS_*` env to inject into the agent process — ONLY for `video`
 * scenarios with a configured key. Returns undefined otherwise (no secret
 * exposure to non-video tasks).
 */
export function ttsEnvForSkill(scenario: string, cfg: TtsConfig): Record<string, string> | undefined {
  if (scenario !== "video" || !cfg.apiKey) return undefined;
  return {
    TTS_ENDPOINT: cfg.endpoint,
    TTS_API_KEY: cfg.apiKey,
    ...(cfg.model ? { TTS_MODEL: cfg.model } : {}),
    ...(cfg.voice ? { TTS_VOICE: cfg.voice } : {}),
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- tts/__tests__/config.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add next/src/lib/tts/config.ts next/src/lib/tts/__tests__/config.test.ts
git commit -m "feat(tts): secure config storage (chmod 600, masked) + env injection decision"
```

---

## Task 2: `/api/tts/config` 路由

**Files:**
- Create: `next/src/app/api/tts/config/route.ts`
- Test: `next/src/app/api/tts/config/__tests__/route.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/app/api/tts/config/__tests__/route.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GET, PUT, DELETE } from "../route";

let dir: string;
const prev = process.env.HTML_ANYTHING_USER_STATE_DIR;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ha-tts-route-"));
  process.env.HTML_ANYTHING_USER_STATE_DIR = dir;
});
afterEach(() => {
  if (prev === undefined) delete process.env.HTML_ANYTHING_USER_STATE_DIR;
  else process.env.HTML_ANYTHING_USER_STATE_DIR = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

const putReq = (body: unknown) =>
  new Request("http://x/api/tts/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/tts/config", () => {
  it("PUT saves + GET returns masked (no plaintext key)", async () => {
    const put = await PUT(putReq({ endpoint: "https://x/v1/audio/speech", apiKey: "secret123" }) as never);
    expect(put.status).toBe(200);
    const putBody = await put.json();
    expect(putBody.configured).toBe(true);
    expect(JSON.stringify(putBody)).not.toContain("secret123");

    const get = await GET();
    const getBody = await get.json();
    expect(getBody.configured).toBe(true);
    expect(JSON.stringify(getBody)).not.toContain("secret123");
  });

  it("PUT with missing apiKey → 400", async () => {
    const res = await PUT(putReq({ endpoint: "https://x", apiKey: "" }) as never);
    expect(res.status).toBe(400);
  });

  it("DELETE clears config", async () => {
    await PUT(putReq({ endpoint: "https://x", apiKey: "k" }) as never);
    const del = await DELETE();
    const body = await del.json();
    expect(body.configured).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- tts/config/__tests__/route.test.ts`
Expected: FAIL — module '../route' not found.

- [ ] **Step 3: 实现 `next/src/app/api/tts/config/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { readTtsConfig, writeTtsConfig, deleteTtsConfig, publicTtsConfig } from "@/lib/tts/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(publicTtsConfig(await readTtsConfig()));
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid JSON", { status: 400 });
  }
  try {
    const pub = await writeTtsConfig(body as Record<string, string>);
    return NextResponse.json(pub);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "save failed" },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  return NextResponse.json(await deleteTtsConfig());
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- tts/config/__tests__/route.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add next/src/app/api/tts/config
git commit -m "feat(tts): GET/PUT/DELETE /api/tts/config (masked key)"
```

---

## Task 3: `invoke.ts` — `extraEnv` 注入

**Files:**
- Modify: `next/src/lib/agents/invoke.ts`

- [ ] **Step 1: 加 `extraEnv` 到 `InvokeOpts`**

在 `next/src/lib/agents/invoke.ts` 的 `export type InvokeOpts = { … }` 里追加字段（在 `binOverride?` 之后）：
```ts
  /**
   * Extra env vars merged into the spawned agent's process env (after
   * `envFor`). Used to pass per-task secrets (e.g. TTS_API_KEY) to the local
   * agent process ONLY — never into the prompt. Scoped to this one spawn.
   */
  extraEnv?: Record<string, string>;
```

- [ ] **Step 2: 合并进 spawn env**

找到 `const env = envFor(opts.agent);`（约第 102 行）。改为：
```ts
  const env = { ...envFor(opts.agent), ...(opts.extraEnv ?? {}) };
```
（`env` 已被下面的 `spawn(bin, argv, { …, env, … })` 使用，无需改 spawn 调用。）

- [ ] **Step 3: 类型检查 + 全量测试**

Run: `pnpm -F @html-anything/next typecheck`
Expected: 无错误。

Run: `pnpm -F @html-anything/next test`
Expected: 全绿（既有 invoke / argv 相关测试不回归）。

> 说明：`extraEnv` 真正到达子进程 env 的验证需 spawn 真实进程，属人工冒烟范围；本任务靠类型 + 既有套件不回归保证接线正确，注入决策由 Task 1 的 `ttsEnvForSkill` 单测覆盖，注入接线由 Task 5 覆盖。

- [ ] **Step 4: 提交**

```bash
git add next/src/lib/agents/invoke.ts
git commit -m "feat(agents): invoke extraEnv to pass per-task secrets to the agent process"
```

---

## Task 4: `video-narrated` skill

**Files:**
- Create: `next/src/lib/templates/skills/video-narrated/SKILL.md`
- Create: `next/src/lib/templates/skills/video-narrated/example.md`
- Test: `next/src/lib/templates/__tests__/narrated-skill.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/lib/templates/__tests__/narrated-skill.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { listSkills, loadSkill } from "../loader";
import { assembleForSkill } from "../shared";

describe("video-narrated skill", () => {
  it("可被 loader 发现且 scenario=video", () => {
    const s = listSkills().find((x) => x.id === "video-narrated");
    expect(s).toBeTruthy();
    expect(s?.scenario).toBe("video");
  });
  it("body 指示 TTS 配音 + 优雅降级 + SRT, 经 pipeline 装配", () => {
    const loaded = loadSkill("video-narrated");
    expect(loaded).not.toBeNull();
    expect(loaded?.body).toContain("TTS_API_KEY");
    expect(loaded?.body).toContain(".srt");
    const prompt = assembleForSkill(loaded!, "做一支带解说的短片", "markdown");
    expect(prompt).not.toContain("禁止使用 Write");
    expect(prompt).toContain("ffmpeg");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- narrated-skill.test.ts`
Expected: FAIL — `video-narrated` not discovered.

- [ ] **Step 3: 创建 `SKILL.md`**

新建 `next/src/lib/templates/skills/video-narrated/SKILL.md`：

```markdown
---
name: video-narrated
zh_name: "带解说短片"
en_name: "Narrated Video"
emoji: "🎙️"
description: "把内容做成带配音 + 字幕的短视频 (MP4 + SRT): agent 生成动画 → TTS 配音 → ffmpeg 混音"
category: video
scenario: video
aspect_hint: "16:9"
recommended: 6
tags: ["video", "narration", "tts", "mp4"]
example_format: "markdown"
example_name: "带解说短片 示例"
example_tagline: "一段内容 → 带配音的 MP4"
---

【Skill: 带解说短片 Narrated Video】
【意图】把【用户内容】做成一支带**配音 + 字幕**的 1920×1080 短视频。运行在 pipeline 模式 (你可用 Bash/playwright/ffmpeg, 产物写 out/)。

【步骤】
1. 按【用户内容】生成一个 1920×1080 单文件动画 HTML (CSS 时间线; 真实内容; 遵守设计纪律)。
2. 写逐场景**解说脚本** (中文, 节奏与各场景时长匹配)。
3. **配音 (优雅降级)**: 读环境变量 `TTS_API_KEY`。
   - 若非空: 用 `POST $TTS_ENDPOINT` (OpenAI-兼容 `/audio/speech`; header `Authorization: Bearer $TTS_API_KEY`; JSON body `{"model": "$TTS_MODEL", "voice": "$TTS_VOICE", "input": "<该段脚本>"}`; `TTS_MODEL`/`TTS_VOICE` 缺省时给合理默认) 逐段合成配音音频 (mp3/wav)。
   - 若 `TTS_API_KEY` 为空: **跳过配音**, 产出无声视频, 并在最后小结里提示「在 Settings → TTS 配置密钥后可加配音」。
4. **字幕**: 由解说脚本 + 时间线生成 `out/<slug>.srt`。
5. **渲染**: playwright 无头逐帧抓取动画 → ffmpeg 合成视频; 若有配音, 用 ffmpeg 把配音轨混入 (`-map` 视频流 + 音频流, `-shortest`) → `out/<slug>.mp4`。
6. 清理临时帧/脚本/音频中间件。

【交付】
- `out/<slug>.mp4` (有 key 则带配音) + `out/<slug>.srt` 必出。
- 回复正文只打印中文小结 + 产物文件名; **绝不**打印 `TTS_API_KEY` / 二进制 / 整段日志。

【安全】
- `TTS_API_KEY` 只用于调用 TTS 接口, 不要回显、不要写进任何产物文件、不要打印。
```

- [ ] **Step 4: 创建 `example.md`**

新建 `next/src/lib/templates/skills/video-narrated/example.md`：

```markdown
为「晨间专注法」做一支 30 秒左右的带解说短片, 用来发小红书 / 视频号。

- 核心方法 3 步: ① 起床后先写 3 件今日要事; ② 番茄钟 25 分钟只做第一件; ③ 完成后给自己一个小奖励。
- 想要温和、治愈的口吻; 画面干净、暖色调。
- 收尾一句话: 「专注, 是对自己最好的温柔。」

请配上中文解说和字幕。
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- narrated-skill.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add next/src/lib/templates/skills/video-narrated next/src/lib/templates/__tests__/narrated-skill.test.ts
git commit -m "feat(skills): add video-narrated skill (TTS voiceover + SRT, graceful degradation)"
```

---

## Task 5: 接线 `convert/route.ts` — 注入 TTS env

**Files:**
- Modify: `next/src/app/api/convert/route.ts`

- [ ] **Step 1: 加 import**

在 `next/src/app/api/convert/route.ts` 顶部 import 区加：
```ts
import { readTtsConfig, ttsEnvForSkill } from "@/lib/tts/config";
```

- [ ] **Step 2: 计算 extraEnv 并传给 invokeAgent**

找到计算 `workdirCwd` 之后、`const stream = invokeAgent({ … })` 之前的位置。在那之前插入：
```ts
  const extraEnv = ttsEnvForSkill(skill.scenario, await readTtsConfig());
```
并在 `invokeAgent({ … })` 的参数对象里加上 `extraEnv,`（与 `cwd: workdirCwd` 并列）。

- [ ] **Step 3: 类型检查 + 全量测试**

Run: `pnpm -F @html-anything/next typecheck`
Expected: 无错误。

Run: `pnpm -F @html-anything/next test`
Expected: 全绿（convert 既有测试 missing/invalid taskId → 400 不回归; ttsEnvForSkill 已在 Task 1 覆盖注入决策）。

- [ ] **Step 4: 提交**

```bash
git add next/src/app/api/convert/route.ts
git commit -m "feat(convert): inject TTS env for video scenarios"
```

---

## Task 6: Settings TTS 配置表单（i18n）

**Files:**
- Modify: `next/src/lib/i18n.ts`
- Create: `next/src/components/tts-config.tsx`
- Modify: `next/src/components/settings-modal.tsx`

- [ ] **Step 1: 加 i18n 键**

READ `next/src/lib/i18n.ts`（Dict 接口 + en + zhCN）。按现有模式新增到三处（接口 + en + zhCN）：
- `"tts.section"` → en `"TTS voiceover"`，zh `"TTS 配音"`
- `"tts.endpoint"` → en `"TTS endpoint (OpenAI-compatible)"`，zh `"TTS 接口地址 (OpenAI 兼容)"`
- `"tts.apiKey"` → en `"API key"`，zh `"API 密钥"`
- `"tts.model"` → en `"Model (optional)"`，zh `"模型 (可选)"`
- `"tts.voice"` → en `"Voice (optional)"`，zh `"音色 (可选)"`
- `"tts.save"` → en `"Save"`，zh `"保存"`
- `"tts.clear"` → en `"Clear"`，zh `"清除"`
- `"tts.hint"` → en `"Stored locally (chmod 600); used only by video skills."`，zh `"仅本地保存 (chmod 600); 只在视频 skill 渲染时使用。"`

- [ ] **Step 2: 创建 `next/src/components/tts-config.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

type PublicTtsConfig = {
  configured: boolean;
  endpoint: string;
  model: string;
  voice: string;
  apiKeyMask: string;
};

const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function TtsConfig() {
  const t = useT();
  const [cfg, setCfg] = useState<PublicTtsConfig | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [voice, setVoice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/tts/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: PublicTtsConfig | null) => {
        if (!j) return;
        setCfg(j);
        setEndpoint(j.endpoint);
        setModel(j.model);
        setVoice(j.voice);
        setApiKey(j.configured ? j.apiKeyMask : "");
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/tts/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint, apiKey, model, voice }),
      });
      if (r.ok) {
        const j = (await r.json()) as PublicTtsConfig;
        setCfg(j);
        setApiKey(j.configured ? j.apiKeyMask : "");
      }
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    const r = await fetch("/api/tts/config", { method: "DELETE" });
    if (r.ok) {
      const j = (await r.json()) as PublicTtsConfig;
      setCfg(j);
      setEndpoint("");
      setApiKey("");
      setModel("");
      setVoice("");
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t("tts.section")}</p>
      <input className={inputCls} placeholder={t("tts.endpoint")} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
      <input className={inputCls} type="password" placeholder={t("tts.apiKey")} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      <div className="flex gap-2">
        <input className={inputCls} placeholder={t("tts.model")} value={model} onChange={(e) => setModel(e.target.value)} />
        <input className={inputCls} placeholder={t("tts.voice")} value={voice} onChange={(e) => setVoice(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">
          {t("tts.save")}
        </button>
        {cfg?.configured ? (
          <button onClick={clear} className="rounded-lg border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700">
            {t("tts.clear")}
          </button>
        ) : null}
      </div>
      <p className="text-xs text-neutral-400">{t("tts.hint")}</p>
    </div>
  );
}
```

- [ ] **Step 3: 挂进 `settings-modal.tsx`**

READ `next/src/components/settings-modal.tsx`。加 import：
```ts
import { TtsConfig } from "./tts-config";
```
在一个合适分区（例如紧邻 `ToolsStatus`/agent 区，或部署配置区附近）渲染 `<TtsConfig />`。选自然位置插入。

- [ ] **Step 4: 类型检查 + 全量测试**

Run: `pnpm -F @html-anything/next typecheck`
Expected: 无错误（i18n 键缺任一 locale 会编译失败 → 以此确认两 locale 都加了）。

Run: `pnpm -F @html-anything/next test`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add next/src/lib/i18n.ts next/src/components/tts-config.tsx next/src/components/settings-modal.tsx
git commit -m "feat(ui): settings TTS config form (masked key)"
```

---

## Task 7: 全量验证 + 人工冒烟

**Files:** 无新增；运行验证。

- [ ] **Step 1: 全量单测**

Run: `pnpm -F @html-anything/next test`
Expected: 全绿（tts config + 路由 + ttsEnvForSkill + narrated skill + 既有套件无回归）。

- [ ] **Step 2: 类型检查 + 守卫**

Run: `pnpm -F @html-anything/next typecheck`（干净）
Run: `pnpm -F @html-anything/e2e typecheck`（干净）
Run: `pnpm exec tsx scripts/guard.ts`（`Guard passed.`）

- [ ] **Step 3: 人工冒烟（唯一能验证真实配音/渲染的方式）**

`pnpm -F @html-anything/next dev`（本机需 ffmpeg + playwright + node + 一个可用的 OpenAI-兼容 TTS endpoint+key）：
- Settings → TTS：填 endpoint + key（+ 可选 model/voice）保存；刷新确认 key 显示为掩码、可清除；确认 `~/.html-anything/tts.json` 权限为 `600` 且 GET 响应里**无明文 key**。
- picker 在「视频 video」场景下出现 `🎙️ 带解说短片`。
- 用其 `example.md` 跑一次 Convert：产物卡片出现带配音的 MP4 + 一个 SRT；MP4 内联播放有声、SRT 可下载。
- 清掉 TTS 配置再跑：产出无声 MP4 + SRT + 小结提示；不报错、不阻塞。

> 说明：真实 TTS 合成 + 渲染 + 混音无法自动化（需 key + 网络 + ffmpeg），是 3c 的已知验收边界，spec §6 已记。

---

## Self-Review

- **Spec §3.1（tts/config 安全存储 + 掩码 + ttsEnvForSkill）** → Task 1 ✅（chmod 600、掩码不含明文、env 注入决策单测）。
- **Spec §3.2（/api/tts/config）** → Task 2 ✅（GET 掩码 / PUT / DELETE）。
- **Spec §3.3（invoke extraEnv）** → Task 3 ✅。
- **Spec §3.4（video-narrated skill）** → Task 4 ✅（TTS 调用 + 优雅降级 + SRT + 安全不回显 key）。
- **Spec §4（convert 注入，仅 video scenario）** → Task 5 ✅（`ttsEnvForSkill(skill.scenario, readTtsConfig())`）。
- **Spec §3.5（Settings TTS 表单）** → Task 6 ✅（i18n 化、掩码显示、清除）。
- **Spec §6（测试 + 人工冒烟硬限制）** → Task 1/2/4 单测 + Task 7 冒烟 ✅。
- **Spec §9 验收（密钥绝不出现在 prompt/仓库/GET 明文/日志）** → 掩码单测（Task 1/2 断言 public 不含明文）+ skill body 安全条款 + ttsEnvForSkill 只对 video 注入。
- **占位符扫描**：无 TODO/TBD；code step 完整。Settings/skill 挂载点由实现者读文件落位。
- **类型一致性**：`TtsConfig {endpoint;apiKey;model;voice}`、`PublicTtsConfig`、`ttsEnvForSkill(scenario, cfg)→Record|undefined`、`InvokeOpts.extraEnv` 跨 Task 1/2/3/5 一致；`video-narrated` 的 `TTS_*` env 名与 `ttsEnvForSkill` 输出一致。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-09-phase3c-narrated-video.md`. 两种执行方式：**

**1. Subagent-Driven（推荐）** — 每个 Task 派全新 subagent（只读 git），任务间走 spec+质量两段 review。
**2. Inline Execution** — 本会话内 executing-plans 批量执行，带检查点。

当前已在干净分支 `feat/huashu-phase3c-narrated-video`（spec 已提交）。
