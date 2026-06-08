# Phase 3a — Artifact Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给每个生成任务一个隔离 workdir，发现 agent 写到 `out/` 的文件，并经沙箱文件服务端在结果区以产物卡片呈现（下载/预览）。

**Architecture:** 新 `lib/artifacts/` 模块（workdir 路径/生命周期 + 安全解析；产物发现/mime）。两个按需 GET 路由（列表 + 文件流）+ DELETE（清理），无 watcher/长进程。`/api/convert` 改为在 `~/.html-anything/work/<taskId>/` 里跑 agent。客户端在 `done` 后拉产物、存进 store、渲染 `artifact-cards`。work root 通过 `HTML_ANYTHING_WORK_ROOT` env 可覆盖（测试注入临时目录）。

**Tech Stack:** Next.js 16 route handlers（`runtime="nodejs"`）· node:fs/path/os · zustand store · vitest/happy-dom · Playwright。

**Spec:** `docs/superpowers/specs/2026-06-08-phase3a-artifact-foundation-design.md`。

**范围收紧（YAGNI）**：只接 `/api/convert`。`/api/draft` 是 prompt 精炼助手、不产文件，故**不**接 workdir（spec §5 提到两者，此处有意只做 convert，并在 self-review 记此偏差）。

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `next/src/lib/artifacts/workdir.ts` | workdir 路径/生命周期 + 路径安全解析 | 新建 |
| `next/src/lib/artifacts/discover.ts` | 产物发现 + mime | 新建 |
| `next/src/lib/artifacts/__tests__/workdir.test.ts` | sanitize/safe-resolve/ensure/remove 单测 | 新建 |
| `next/src/lib/artifacts/__tests__/discover.test.ts` | mime/listArtifacts 单测 | 新建 |
| `next/src/app/api/artifacts/route.ts` | GET 列表 + DELETE 清理 | 新建 |
| `next/src/app/api/artifacts/file/route.ts` | GET 文件流（穿越守卫） | 新建 |
| `next/src/app/api/artifacts/__tests__/route.test.ts` | 路由集成（列表/文件/越界/非法 id） | 新建 |
| `next/src/app/api/convert/route.ts` | 加 `taskId` + workdir cwd | 修改 |
| `next/src/lib/store.ts` | `Task.artifacts` + `setArtifactsFor` + 删除时清理 | 修改 |
| `next/src/lib/use-convert.ts` | payload 加 `taskId`；done 后拉产物 | 修改 |
| `next/src/components/artifact-cards.tsx` | 产物卡片组件 | 新建 |
| `next/src/components/preview-pane.tsx` | 挂载 `<ArtifactCards/>` | 修改 |
| `e2e/ui/artifacts.spec.ts` | 端到端：fixture 产物 → 卡片 + 下载 | 新建 |

**命令**：单测 `pnpm -F @html-anything/next test`；类型 `pnpm -F @html-anything/next typecheck`；守卫 `pnpm exec tsx scripts/guard.ts`；e2e `pnpm -F @html-anything/e2e test`。

**回退**：删新文件 + revert convert/store/use-convert/preview-pane 接线。

---

## Task 1: `workdir.ts` — 路径、生命周期、安全解析

**Files:**
- Create: `next/src/lib/artifacts/workdir.ts`
- Test: `next/src/lib/artifacts/__tests__/workdir.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/lib/artifacts/__tests__/workdir.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  sanitizeTaskId,
  taskWorkdir,
  taskOutDir,
  ensureWorkdir,
  removeWorkdir,
  safeResolveInOut,
} from "../workdir";

let root: string;
const prev = process.env.HTML_ANYTHING_WORK_ROOT;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ha-work-"));
  process.env.HTML_ANYTHING_WORK_ROOT = root;
});
afterEach(() => {
  if (prev === undefined) delete process.env.HTML_ANYTHING_WORK_ROOT;
  else process.env.HTML_ANYTHING_WORK_ROOT = prev;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("sanitizeTaskId", () => {
  it("accepts kebab/underscore/alnum", () => {
    expect(sanitizeTaskId("t_1a2b-XYZ")).toBe("t_1a2b-XYZ");
  });
  it("rejects traversal / separators / empty", () => {
    for (const bad of ["..", "../x", "a/b", "a\\b", "a.b", "", "  ", "a b"]) {
      expect(() => sanitizeTaskId(bad)).toThrow();
    }
  });
});

describe("workdir paths + lifecycle", () => {
  it("taskWorkdir / taskOutDir live under the work root", () => {
    expect(taskWorkdir("task1")).toBe(path.join(root, "task1"));
    expect(taskOutDir("task1")).toBe(path.join(root, "task1", "out"));
  });
  it("ensureWorkdir creates dir + out, removeWorkdir deletes it", () => {
    const { dir, outDir } = ensureWorkdir("task1");
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(outDir)).toBe(true);
    removeWorkdir("task1");
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe("safeResolveInOut — traversal guard", () => {
  it("resolves a normal relative path inside out/", () => {
    ensureWorkdir("task1");
    const r = safeResolveInOut("task1", "video.mp4");
    expect(r).toBe(path.join(root, "task1", "out", "video.mp4"));
  });
  it("rejects ../ escapes, absolute paths, and out-of-out joins", () => {
    ensureWorkdir("task1");
    for (const bad of ["../secret", "../../etc/passwd", "/etc/passwd", "sub/../../x"]) {
      expect(safeResolveInOut("task1", bad)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- workdir.test.ts`
Expected: FAIL — module '../workdir' not found.

- [ ] **Step 3: 实现 `next/src/lib/artifacts/workdir.ts`**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Per-task working directory under `~/.html-anything/work/<taskId>/`. The agent
 * runs here (isolated from the app source tree) and writes deliverables to
 * `out/`. Overridable via `HTML_ANYTHING_WORK_ROOT` (used by tests).
 */
export function workRoot(): string {
  return process.env.HTML_ANYTHING_WORK_ROOT || path.join(os.homedir(), ".html-anything", "work");
}

/** Allow only kebab/underscore/alnum ids — the first guard against traversal. */
export function sanitizeTaskId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`invalid task id: ${JSON.stringify(id)}`);
  }
  return id;
}

export function taskWorkdir(taskId: string): string {
  return path.join(workRoot(), sanitizeTaskId(taskId));
}

export function taskOutDir(taskId: string): string {
  return path.join(taskWorkdir(taskId), "out");
}

export function ensureWorkdir(taskId: string): { dir: string; outDir: string } {
  const dir = taskWorkdir(taskId);
  const outDir = path.join(dir, "out");
  fs.mkdirSync(outDir, { recursive: true });
  return { dir, outDir };
}

export function removeWorkdir(taskId: string): void {
  fs.rmSync(taskWorkdir(taskId), { recursive: true, force: true });
}

/**
 * Resolve a client-supplied relative path against the task's `out/` dir.
 * Returns the absolute path iff it stays inside `out/`; otherwise `null`.
 * Throws if the task id itself is invalid.
 */
export function safeResolveInOut(taskId: string, relPath: string): string | null {
  const outDir = taskOutDir(taskId);
  const resolved = path.resolve(outDir, relPath);
  if (resolved !== outDir && !resolved.startsWith(outDir + path.sep)) return null;
  return resolved;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- workdir.test.ts`
Expected: PASS（全部用例绿）。

- [ ] **Step 5: 提交**

```bash
git add next/src/lib/artifacts/workdir.ts next/src/lib/artifacts/__tests__/workdir.test.ts
git commit -m "feat(artifacts): per-task workdir paths, lifecycle, and traversal-safe resolve"
```

---

## Task 2: `discover.ts` — 产物发现 + mime

**Files:**
- Create: `next/src/lib/artifacts/discover.ts`
- Test: `next/src/lib/artifacts/__tests__/discover.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/lib/artifacts/__tests__/discover.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mimeForExt, listArtifacts } from "../discover";
import { ensureWorkdir } from "../workdir";

let root: string;
const prev = process.env.HTML_ANYTHING_WORK_ROOT;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ha-disc-"));
  process.env.HTML_ANYTHING_WORK_ROOT = root;
});
afterEach(() => {
  if (prev === undefined) delete process.env.HTML_ANYTHING_WORK_ROOT;
  else process.env.HTML_ANYTHING_WORK_ROOT = prev;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("mimeForExt", () => {
  it("maps known extensions, falls back to octet-stream", () => {
    expect(mimeForExt("a.mp4")).toBe("video/mp4");
    expect(mimeForExt("a.gif")).toBe("image/gif");
    expect(mimeForExt("a.png")).toBe("image/png");
    expect(mimeForExt("a.pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(mimeForExt("a.unknownext")).toBe("application/octet-stream");
  });
});

describe("listArtifacts", () => {
  it("returns [] when out/ is missing", () => {
    expect(listArtifacts("task1")).toEqual([]);
  });
  it("lists files in out/ (recursively) with name/relPath/size/mime", () => {
    const { outDir } = ensureWorkdir("task1");
    fs.writeFileSync(path.join(outDir, "video.mp4"), "abc");
    fs.mkdirSync(path.join(outDir, "sub"));
    fs.writeFileSync(path.join(outDir, "sub", "thumb.png"), "xy");
    const arts = listArtifacts("task1").sort((a, b) => a.relPath.localeCompare(b.relPath));
    expect(arts).toEqual([
      { name: "video.mp4", relPath: "video.mp4", size: 3, mime: "video/mp4" },
      { name: "thumb.png", relPath: path.join("sub", "thumb.png"), size: 2, mime: "image/png" },
    ]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- discover.test.ts`
Expected: FAIL — module '../discover' not found.

- [ ] **Step 3: 实现 `next/src/lib/artifacts/discover.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { taskOutDir } from "./workdir";

export type Artifact = {
  /** Base filename. */
  name: string;
  /** Path relative to `out/` (POSIX-or-native sep; used as the `path` query). */
  relPath: string;
  /** Bytes. */
  size: number;
  /** Best-effort MIME from the extension. */
  mime: string;
};

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

export function mimeForExt(name: string): string {
  return MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

/** List files in the task's `out/` dir, recursively (max depth 3). */
export function listArtifacts(taskId: string): Artifact[] {
  const outDir = taskOutDir(taskId);
  const out: Artifact[] = [];
  const walk = (dir: string, rel: string, depth: number): void => {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const abs = path.join(dir, ent.name);
      const relPath = rel ? path.join(rel, ent.name) : ent.name;
      if (ent.isDirectory()) {
        walk(abs, relPath, depth + 1);
      } else if (ent.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(abs).size;
        } catch {
          continue;
        }
        out.push({ name: ent.name, relPath, size, mime: mimeForExt(ent.name) });
      }
    }
  };
  walk(outDir, "", 0);
  return out;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- discover.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add next/src/lib/artifacts/discover.ts next/src/lib/artifacts/__tests__/discover.test.ts
git commit -m "feat(artifacts): out/ discovery with extension→mime mapping"
```

---

## Task 3: API 路由（列表 / 文件流 / 删除）+ 集成测试

**Files:**
- Create: `next/src/app/api/artifacts/route.ts`
- Create: `next/src/app/api/artifacts/file/route.ts`
- Test: `next/src/app/api/artifacts/__tests__/route.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/app/api/artifacts/__tests__/route.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureWorkdir } from "@/lib/artifacts/workdir";
import { GET as listGET, DELETE as listDELETE } from "../route";
import { GET as fileGET } from "../file/route";

let root: string;
const prev = process.env.HTML_ANYTHING_WORK_ROOT;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ha-route-"));
  process.env.HTML_ANYTHING_WORK_ROOT = root;
});
afterEach(() => {
  if (prev === undefined) delete process.env.HTML_ANYTHING_WORK_ROOT;
  else process.env.HTML_ANYTHING_WORK_ROOT = prev;
  fs.rmSync(root, { recursive: true, force: true });
});

const req = (url: string) => new Request(url);

describe("GET /api/artifacts", () => {
  it("lists artifacts for a task", async () => {
    const { outDir } = ensureWorkdir("task1");
    fs.writeFileSync(path.join(outDir, "a.mp4"), "abc");
    const res = await listGET(req("http://x/api/artifacts?task=task1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { artifacts: Array<{ name: string }> };
    expect(body.artifacts.map((a) => a.name)).toEqual(["a.mp4"]);
  });
  it("400 on invalid task id", async () => {
    const res = await listGET(req("http://x/api/artifacts?task=../etc"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/artifacts/file", () => {
  it("streams a file with its mime", async () => {
    const { outDir } = ensureWorkdir("task1");
    fs.writeFileSync(path.join(outDir, "a.txt"), "hello");
    const res = await fileGET(req("http://x/api/artifacts/file?task=task1&path=a.txt"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("hello");
  });
  it("404 on traversal / missing / bad path", async () => {
    ensureWorkdir("task1");
    for (const p of ["../../etc/passwd", "/etc/passwd", "nope.txt"]) {
      const res = await fileGET(req(`http://x/api/artifacts/file?task=task1&path=${encodeURIComponent(p)}`));
      expect(res.status).toBe(404);
    }
  });
  it("400 on invalid task id", async () => {
    const res = await fileGET(req("http://x/api/artifacts/file?task=..&path=a.txt"));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/artifacts", () => {
  it("removes the task workdir", async () => {
    const { dir } = ensureWorkdir("task1");
    expect(fs.existsSync(dir)).toBe(true);
    const res = await listDELETE(req("http://x/api/artifacts?task=task1"));
    expect(res.status).toBe(200);
    expect(fs.existsSync(dir)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- route.test.ts`
Expected: FAIL — 模块 '../route' / '../file/route' 不存在。

- [ ] **Step 3: 实现 `next/src/app/api/artifacts/route.ts`**

```ts
import { listArtifacts } from "@/lib/artifacts/discover";
import { removeWorkdir, sanitizeTaskId } from "@/lib/artifacts/workdir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function taskParam(url: string): string | null {
  const raw = new URL(url).searchParams.get("task") ?? "";
  try {
    return sanitizeTaskId(raw);
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const task = taskParam(req.url);
  if (!task) return new Response("invalid task id", { status: 400 });
  return Response.json({ artifacts: listArtifacts(task) });
}

export async function DELETE(req: Request): Promise<Response> {
  const task = taskParam(req.url);
  if (!task) return new Response("invalid task id", { status: 400 });
  removeWorkdir(task);
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: 实现 `next/src/app/api/artifacts/file/route.ts`**

```ts
import fs from "node:fs";
import { mimeForExt } from "@/lib/artifacts/discover";
import { safeResolveInOut, sanitizeTaskId } from "@/lib/artifacts/workdir";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const rawTask = url.searchParams.get("task") ?? "";
  const relPath = url.searchParams.get("path") ?? "";

  let task: string;
  try {
    task = sanitizeTaskId(rawTask);
  } catch {
    return new Response("invalid task id", { status: 400 });
  }

  const abs = safeResolveInOut(task, relPath);
  // 404 (not 403) on escape so we don't leak whether the target exists.
  if (!abs) return new Response("not found", { status: 404 });

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return new Response("not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("not found", { status: 404 });

  const name = relPath.split(/[\\/]/).pop() || "artifact";
  const mime = mimeForExt(name);
  const inline = mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/");
  const data = fs.readFileSync(abs);
  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- route.test.ts`
Expected: PASS（列表/文件/越界 404/非法 id 400/删除 全绿）。

- [ ] **Step 6: 提交**

```bash
git add next/src/app/api/artifacts
git commit -m "feat(artifacts): GET list, sandboxed file stream, DELETE cleanup routes"
```

---

## Task 4: 接线 `/api/convert` —隔离 workdir

**Files:**
- Modify: `next/src/app/api/convert/route.ts`
- Test: `next/src/app/api/convert/__tests__/route.test.ts`

- [ ] **Step 1: 写失败测试（缺 taskId → 400）**

新建 `next/src/app/api/convert/__tests__/route.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { POST } from "../route";

describe("POST /api/convert — taskId required", () => {
  it("400 when taskId is missing", async () => {
    const res = await POST(
      new Request("http://x/api/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: "claude", templateId: "deck-simple", content: "hi" }),
      }) as never,
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- convert/__tests__/route.test.ts`
Expected: FAIL — 现在缺 taskId 不会 400（route 没校验）。

- [ ] **Step 3: 修改 `convert/route.ts`**

在 `type Body` 里加字段（紧跟 `cwd?: string;` 后）：

```ts
  /** Per-task isolation workdir key — the agent runs in ~/.html-anything/work/<taskId>/. */
  taskId?: string;
```

在解构里加入 `taskId`（在 `const { agent, templateId, content, ... } = body;` 中追加 `taskId`）。

把必填校验从：
```ts
  if (!agent || !templateId || !content) {
    return new Response("missing required fields: agent, templateId, content", {
      status: 400,
    });
  }
```
改为：
```ts
  if (!agent || !templateId || !content || !taskId) {
    return new Response("missing required fields: agent, templateId, content, taskId", {
      status: 400,
    });
  }
```

在顶部 import 区加：
```ts
import { ensureWorkdir, sanitizeTaskId } from "@/lib/artifacts/workdir";
```

在调用 `invokeAgent` 之前，用 workdir 计算 cwd（替换 body 的 `cwd`）：
```ts
  let workdirCwd: string;
  try {
    workdirCwd = ensureWorkdir(sanitizeTaskId(taskId)).dir;
  } catch {
    return new Response("invalid taskId", { status: 400 });
  }
```
并把 `invokeAgent({ … cwd, … })` 里的 `cwd` 改为 `cwd: workdirCwd`（删掉从 body 取的 `cwd`，连同 `type Body` 里的 `cwd?` 一并移除以免误导——若 `cwd` 在别处无引用）。

- [ ] **Step 4: 跑测试 + 类型检查**

Run: `pnpm -F @html-anything/next test -- convert/__tests__/route.test.ts`
Expected: PASS（缺 taskId → 400）。

Run: `pnpm -F @html-anything/next typecheck`
Expected: 无类型错误（确认移除 `cwd` 后没有悬空引用）。

- [ ] **Step 5: 提交**

```bash
git add next/src/app/api/convert/route.ts next/src/app/api/convert/__tests__/route.test.ts
git commit -m "feat(convert): run agent in isolated per-task workdir (requires taskId)"
```

---

## Task 5: store — `Task.artifacts` + setter + 删除时清理

**Files:**
- Modify: `next/src/lib/store.ts`
- Test: `next/src/lib/__tests__/store-artifacts.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/lib/__tests__/store-artifacts.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";

describe("store artifacts", () => {
  beforeEach(() => {
    // a clean single-task store
    const t = useStore.getState().tasks[0];
    useStore.setState({ tasks: [t], activeTaskId: t.id });
  });

  it("setArtifactsFor stores artifacts on the task", () => {
    const id = useStore.getState().tasks[0].id;
    useStore.getState().setArtifactsFor(id, [
      { name: "v.mp4", relPath: "v.mp4", size: 10, mime: "video/mp4" },
    ]);
    expect(useStore.getState().tasks[0].artifacts).toEqual([
      { name: "v.mp4", relPath: "v.mp4", size: 10, mime: "video/mp4" },
    ]);
  });

  it("deleteTask best-effort DELETEs the workdir endpoint", () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const id = useStore.getState().tasks[0].id;
    useStore.getState().deleteTask(id);
    expect(calls.some((c) => c.startsWith("DELETE") && c.includes(`/api/artifacts?task=${id}`))).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- store-artifacts.test.ts`
Expected: FAIL — `setArtifactsFor` 不存在；deleteTask 未调用 DELETE。

- [ ] **Step 3: 修改 `store.ts`**

(a) 顶部加类型导入：
```ts
import type { Artifact } from "@/lib/artifacts/discover";
```

(b) `Task` 类型里，在 `deployments?` 之后加：
```ts
  /** Files the agent wrote to its workdir's out/, discovered after `done`. */
  artifacts?: Artifact[];
```

(c) 在 actions 接口里（与 `setHtmlFor` 等并列）声明：
```ts
  setArtifactsFor: (taskId: string, artifacts: Artifact[]) => void;
```

(d) 在 actions 实现里加（仿照 `setHtmlFor` 用 `patchTask`）：
```ts
      setArtifactsFor: (taskId, artifacts) =>
        set((st) => ({ tasks: patchTask(st.tasks, taskId, { artifacts }) })),
```

(e) 在 `deleteTask` 实现里，在已有的 `void deleteTaskRuns(id).catch(() => {});` 旁边追加 best-effort 清理（两处分支都加，或在函数入口统一加一次）：
```ts
        // best-effort: drop the server-side artifact workdir for this task
        void fetch(`/api/artifacts?task=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- store-artifacts.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add next/src/lib/store.ts next/src/lib/__tests__/store-artifacts.test.ts
git commit -m "feat(store): task.artifacts + setArtifactsFor + cleanup workdir on delete"
```

---

## Task 6: 客户端 — convert 带 taskId、done 后拉产物 + 产物卡片组件

**Files:**
- Modify: `next/src/lib/use-convert.ts`
- Create: `next/src/components/artifact-cards.tsx`
- Modify: `next/src/components/preview-pane.tsx`

- [ ] **Step 1: use-convert — payload 加 taskId**

在 `next/src/lib/use-convert.ts` 的 `const payload = { … }`（约 82-90 行）里加入 `taskId`：
```ts
      const payload = {
        agent: req.agent,
        templateId: req.templateId,
        content: enrichedContent,
        format: req.format ?? summary.format,
        taskId,
        ...(useModel ? { model: useModel } : {}),
        ...(binOverride ? { binOverride } : {}),
        ...(editPayload ?? {}),
      };
```

- [ ] **Step 2: use-convert — done 后拉产物**

在成功路径（约 147-150 行，`setStatusFor(taskId, "done")` 与 `commitBaseFor(taskId)` 之后）追加：
```ts
        // discover any files the agent wrote to its workdir's out/
        void fetch(`/api/artifacts?task=${encodeURIComponent(taskId)}`)
          .then((r) => (r.ok ? r.json() : { artifacts: [] }))
          .then((j: { artifacts?: import("@/lib/artifacts/discover").Artifact[] }) => {
            useStore.getState().setArtifactsFor(taskId, j.artifacts ?? []);
          })
          .catch(() => {});
```

- [ ] **Step 3: 创建 `next/src/components/artifact-cards.tsx`**

```tsx
"use client";

import { useStore } from "@/lib/store";
import type { Artifact } from "@/lib/artifacts/discover";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileUrl(taskId: string, a: Artifact): string {
  return `/api/artifacts/file?task=${encodeURIComponent(taskId)}&path=${encodeURIComponent(a.relPath)}`;
}

export function ArtifactCards() {
  const task = useStore((s) => s.tasks.find((t) => t.id === s.activeTaskId));
  const artifacts = task?.artifacts ?? [];
  if (!task || artifacts.length === 0) return null;

  return (
    <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
      <p className="mb-2 text-xs font-medium text-neutral-500">产物 · {artifacts.length}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {artifacts.map((a) => {
          const url = fileUrl(task.id, a);
          return (
            <li key={a.relPath} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
              {a.mime.startsWith("image/") ? (
                <img src={url} alt={a.name} className="mb-2 max-h-40 w-full rounded-lg object-contain" />
              ) : a.mime.startsWith("video/") ? (
                <video src={url} controls className="mb-2 max-h-40 w-full rounded-lg" />
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm" title={a.name}>{a.name}</span>
                <span className="shrink-0 text-xs text-neutral-400">{humanSize(a.size)}</span>
              </div>
              <a
                href={url}
                download={a.name}
                className="mt-2 inline-block rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
              >
                下载
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: 在 `preview-pane.tsx` 挂载**

在 `next/src/components/preview-pane.tsx` 顶部 import 区加：
```ts
import { ArtifactCards } from "./artifact-cards";
```
在该组件返回的 JSX 中、预览 iframe 容器之后（同一外层容器内，作为底部区块）渲染：
```tsx
      <ArtifactCards />
```
（`ArtifactCards` 自包含、自读 store、无产物时返回 `null`，放在预览容器底部即可；若 preview-pane 的根是 flex 列布局，置于末尾。）

- [ ] **Step 5: 类型检查 + 全量测试**

Run: `pnpm -F @html-anything/next typecheck`
Expected: 无错误。

Run: `pnpm -F @html-anything/next test`
Expected: 全绿（无回归）。

- [ ] **Step 6: 提交**

```bash
git add next/src/lib/use-convert.ts next/src/components/artifact-cards.tsx next/src/components/preview-pane.tsx
git commit -m "feat(ui): send taskId, fetch artifacts on done, render artifact cards"
```

---

## Task 7: e2e + 全量验证 + 人工冒烟

**Files:**
- Create: `e2e/ui/artifacts.spec.ts`
- Modify: `e2e/playwright.config.ts`（给 webServer 注入 `HTML_ANYTHING_WORK_ROOT`）

- [ ] **Step 1: 给 e2e webServer 固定 work root**

在 `e2e/playwright.config.ts` 的 `webServer` 配置里，给其 `env` 增加一个固定的临时 work root（若已有 `env` 字段则合并；键值如下）：
```ts
    env: {
      // ...existing env if any...
      HTML_ANYTHING_WORK_ROOT: path.join(__dirname, ".artifacts-e2e"),
    },
```
（确保文件顶部已 `import path from "node:path";`。这个目录由下面的测试在运行时写入 fixture 文件。）

- [ ] **Step 2: 写 e2e**

新建 `e2e/ui/artifacts.spec.ts`：

```ts
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const STORE_KEY = "html-everything-store";
const TASK_ID = "task_artifacts_e2e";
const WORK_ROOT = path.join(__dirname, "..", ".artifacts-e2e");

const html = `<!doctype html><html><head><title>Art</title></head><body><h1>done</h1></body></html>`;

async function seed(page: Page) {
  const now = 1_700_000_000_000;
  const task = {
    id: TASK_ID,
    name: "Artifacts fixture",
    content: "x",
    format: "html",
    templateId: "deck-simple",
    html,
    status: "done",
    log: [],
    stats: { outputBytes: html.length, deltaCount: 1 },
    artifacts: [{ name: "hello.txt", relPath: "hello.txt", size: 5, mime: "text/plain" }],
    createdAt: now,
    updatedAt: now,
  };
  await page.addInitScript(
    ({ key, taskFixture }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          state: {
            tasks: [taskFixture],
            activeTaskId: taskFixture.id,
            selectedAgent: "test-agent",
            agentModels: {},
            welcomeAck: true,
            sidebarCollapsed: false,
            locale: "zh-CN",
            layoutMode: "split",
          },
          version: 5,
        }),
      );
    },
    { key: STORE_KEY, taskFixture: task },
  );
}

test.describe("Artifact cards", () => {
  test.beforeAll(() => {
    const outDir = path.join(WORK_ROOT, TASK_ID, "out");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "hello.txt"), "hello");
  });
  test.afterAll(() => {
    fs.rmSync(path.join(WORK_ROOT, TASK_ID), { recursive: true, force: true });
  });

  test("renders a card and serves the file via the sandboxed endpoint", async ({ page, request }) => {
    await seed(page);
    await page.goto("/");

    // The card (seeded into the store) is visible.
    await expect(page.getByText("hello.txt")).toBeVisible();
    await expect(page.getByRole("link", { name: /下载/ })).toBeVisible();

    // The file endpoint streams the real bytes from out/.
    const ok = await request.get(`/api/artifacts/file?task=${TASK_ID}&path=hello.txt`);
    expect(ok.status()).toBe(200);
    expect(await ok.text()).toBe("hello");

    // Traversal is rejected.
    const bad = await request.get(`/api/artifacts/file?task=${TASK_ID}&path=${encodeURIComponent("../../etc/passwd")}`);
    expect(bad.status()).toBe(404);
  });
});
```

- [ ] **Step 3: 跑 e2e**

Run: `pnpm -F @html-anything/e2e test -- artifacts`
Expected: PASS — 卡片可见、文件端点回真实内容、越界 404。
若 FAIL：先确认 `HTML_ANYTHING_WORK_ROOT` 注入到了 webServer（dev server 进程必须看到同一 root），不要放宽断言。

- [ ] **Step 4: 全量验证**

Run: `pnpm -F @html-anything/next test`（全绿）
Run: `pnpm -F @html-anything/next typecheck`（干净）
Run: `pnpm -F @html-anything/e2e typecheck`（干净）
Run: `pnpm exec tsx scripts/guard.ts`（`Guard passed.`）

- [ ] **Step 5: 人工冒烟**

`pnpm -F @html-anything/next dev`，跑一个真实任务，让 agent 往 `out/` 写一个文件（3a 阶段可手动在 `~/.html-anything/work/<taskId>/out/` 放个文件，或临时用一个会写文件的 skill），刷新确认结果区出现产物卡片、下载可用、图片/视频内联预览。

- [ ] **Step 6: 提交**

```bash
git add e2e/ui/artifacts.spec.ts e2e/playwright.config.ts
git commit -m "test(e2e): artifact card render + sandboxed file serving + traversal 404"
```

---

## Self-Review

- **Spec §3.1 workdir.ts** → Task 1 ✅（含 `safeResolveInOut` 穿越守卫，env 可覆盖 root）。
- **Spec §3.2 discover.ts** → Task 2 ✅。
- **Spec §4 三个路由（list/file/delete）** → Task 3 ✅；文件端点穿越→404、非法 id→400。
- **Spec §5 接 convert（taskId + workdir cwd）** → Task 4 ✅。**偏差（YAGNI）**：spec §5 提到 draft 也接；本计划**只接 convert**，因 draft 不产文件。已在计划开头标注。
- **Spec §6 store + 客户端 + 卡片** → Task 5（store）+ Task 6（use-convert + artifact-cards + 挂载）✅。
- **Spec §6 清理走任务删除** → Task 5 (e) deleteTask DELETE ✅。
- **Spec §7 测试三层** → 纯/安全/集成单测（Task 1-5）+ e2e（Task 7）+ 人工冒烟 ✅。
- **Spec §9 验收** → Task 7 覆盖（卡片、下载、越界 404、纯 HTML 无卡片由"空 artifacts 不渲染"保证）。
- **占位符扫描**：无 TODO/TBD；每个 code step 给出完整内容。preview-pane 挂载为自包含组件 + 明确插入位置（实现者读文件落点）。
- **类型一致性**：`Artifact { name; relPath; size; mime }` 在 discover/route/store/use-convert/artifact-cards 全一致；`setArtifactsFor(taskId, Artifact[])`、`safeResolveInOut(taskId, relPath): string|null`、`ensureWorkdir(taskId): {dir,outDir}` 跨任务签名一致。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-08-phase3a-artifact-foundation.md`. 两种执行方式：**

**1. Subagent-Driven（推荐）** — 每个 Task 派全新 subagent，任务间走 spec+质量两段 review。
**2. Inline Execution** — 本会话内 executing-plans 批量执行，带检查点。

当前已在干净分支 `feat/huashu-phase3a-artifacts`（spec 已提交）。
