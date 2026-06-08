# Phase 2 — Editable PPTX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `exportDeckPptx` 从「每页满铺 PNG」升级为混合产物——去文字 PNG 底图 + 原生可编辑 pptx 文本框——每页提取失败时自动退回整张 PNG。

**Architecture:** 复用现有 1920×1080 same-origin 离屏 iframe 渲染。新模块 `export/pptx-textbox.ts` 承载「纯映射函数」（px→inch/pt、CSS 色/字重/对齐/字体族 → pptx 属性）+「DOM 提取」（收集含直接文字的块级元素、读 rect/计算样式、去文字）。`export/deck.ts` 抽出 `withSlideIframe` 生命周期 helper 并编排。纯函数走 vitest 单测；浏览器全链路走 Playwright e2e（seed store → 导出 → 解 zip 断言文本 run）。

**Tech Stack:** TypeScript（strict）· pptxgenjs ^4.0.1（已装）· modern-screenshot（经 `iframeToBlob`）· vitest/happy-dom · Playwright(`e2e/`) · JSZip（已装）。

**Spec:** `docs/superpowers/specs/2026-06-08-phase2-editable-pptx-design.md`。

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `next/src/lib/export/pptx-textbox.ts` | 纯映射 + DOM 提取/去文字 | 新建 |
| `next/src/lib/export/__tests__/pptx-textbox.test.ts` | 纯函数 + DOM 选择/去文字单测 | 新建 |
| `next/src/lib/export/deck.ts` | 抽 `withSlideIframe` + 混合 `exportDeckPptx` + 兜底 | 修改 |
| `e2e/ui/deck-pptx.spec.ts` | 浏览器全链路：导出 PPTX → 解 zip 断言 | 新建 |

**坐标约定**：离屏 iframe 固定 1920×1080；`LAYOUT_WIDE` = 13.333×7.5 in；即 **144 px/in**（1080/7.5 = 144，1920/144 = 13.333）。位置 `inch = px/144`，字号 `pt = px/2`。

**命令**（仓库根）：单测 `pnpm -F @html-anything/next test`；类型 `pnpm -F @html-anything/next typecheck`；守卫 `pnpm exec tsx scripts/guard.ts`；e2e `pnpm -F @html-anything/e2e test`；e2e 类型 `pnpm -F @html-anything/e2e typecheck`。

**回退**：删 `pptx-textbox.ts` + 两个测试，`git checkout -- next/src/lib/export/deck.ts`。

---

## Task 1: 纯映射函数 + 单测

**Files:**
- Create: `next/src/lib/export/pptx-textbox.ts`
- Test: `next/src/lib/export/__tests__/pptx-textbox.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `next/src/lib/export/__tests__/pptx-textbox.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import {
  pxToInches,
  pxToPt,
  cssColorToHex,
  fontWeightToBold,
  textAlignToPptx,
  mapFontFamily,
  cssToPptxTextProps,
} from "../pptx-textbox";

describe("pptx-textbox 纯映射", () => {
  it("pxToInches: 144px = 1in, 1920px ≈ 13.333in", () => {
    expect(pxToInches(144)).toBeCloseTo(1, 5);
    expect(pxToInches(1920)).toBeCloseTo(13.3333, 3);
    expect(pxToInches(0)).toBe(0);
  });

  it("pxToPt: 144px = 72pt, 48px = 24pt", () => {
    expect(pxToPt(144)).toBeCloseTo(72, 5);
    expect(pxToPt(48)).toBeCloseTo(24, 5);
  });

  it("cssColorToHex: rgb/rgba/hex → RRGGBB", () => {
    expect(cssColorToHex("rgb(63, 94, 58)")).toBe("3F5E3A");
    expect(cssColorToHex("rgba(10, 10, 10, 1)")).toBe("0A0A0A");
    expect(cssColorToHex("#fafafa")).toBe("FAFAFA");
    expect(cssColorToHex("#abc")).toBe("AABBCC");
    expect(cssColorToHex("nonsense")).toBe("000000");
  });

  it("fontWeightToBold: ≥600 / bold → true", () => {
    expect(fontWeightToBold("700")).toBe(true);
    expect(fontWeightToBold("600")).toBe(true);
    expect(fontWeightToBold("bold")).toBe(true);
    expect(fontWeightToBold("400")).toBe(false);
    expect(fontWeightToBold("normal")).toBe(false);
  });

  it("textAlignToPptx: 归一到 left/center/right", () => {
    expect(textAlignToPptx("center")).toBe("center");
    expect(textAlignToPptx("right")).toBe("right");
    expect(textAlignToPptx("end")).toBe("right");
    expect(textAlignToPptx("left")).toBe("left");
    expect(textAlignToPptx("justify")).toBe("left");
    expect(textAlignToPptx("start")).toBe("left");
  });

  it("mapFontFamily: 取首族名去引号", () => {
    expect(mapFontFamily('"Noto Sans SC", sans-serif')).toBe("Noto Sans SC");
    expect(mapFontFamily("Inter, system-ui")).toBe("Inter");
    expect(mapFontFamily("")).toBe("Arial");
  });

  it("cssToPptxTextProps: 组合快照 → pptx 属性", () => {
    const props = cssToPptxTextProps({
      fontFamily: '"Inter", sans-serif',
      fontSize: "48px",
      fontWeight: "700",
      fontStyle: "italic",
      color: "rgb(10, 10, 10)",
      textAlign: "center",
    });
    expect(props).toEqual({
      fontFace: "Inter",
      fontSizePt: 24,
      colorHex: "0A0A0A",
      bold: true,
      italic: true,
      align: "center",
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- pptx-textbox.test.ts`
Expected: FAIL —「Cannot find module '../pptx-textbox'」或函数未定义。

- [ ] **Step 3: 写纯函数实现**

新建 `next/src/lib/export/pptx-textbox.ts`：

```ts
/**
 * Convert a rendered deck slide's text into editable PPTX text boxes.
 *
 * The slide is rendered in a fixed 1920×1080 off-screen iframe; pptxgenjs
 * `LAYOUT_WIDE` is 13.333×7.5in → exactly 144 px/in. So positions/sizes map by
 * `inch = px / 144` and font size by `pt = px / 2` (= px * 72/144).
 *
 * This module is split into PURE mappers (unit-tested) and browser-bound DOM
 * helpers (covered by the Playwright e2e, since happy-dom has no real layout).
 */

/** 1080px canvas height / 7.5in = 144; 1920px width / 144 = 13.333in. */
export const PX_PER_INCH = 144;

export type PptxTextProps = {
  fontFace: string;
  fontSizePt: number;
  colorHex: string;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
};

export type TextBoxDescriptor = PptxTextProps & {
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
  text: string;
};

/** Snapshot of the computed-style fields we read — keeps mappers DOM-free. */
export type CssTextSnapshot = {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  color: string;
  textAlign: string;
};

export function pxToInches(px: number, pxPerInch = PX_PER_INCH): number {
  return px / pxPerInch;
}

export function pxToPt(px: number, pxPerInch = PX_PER_INCH): number {
  return (px / pxPerInch) * 72;
}

/** Normalize a CSS color to an uppercase `RRGGBB` string (pptxgenjs format). */
export function cssColorToHex(css: string): string {
  const rgb = /rgba?\(([^)]+)\)/i.exec(css);
  if (rgb) {
    const [r, g, b] = rgb[1].split(",").slice(0, 3).map((s) => Math.round(parseFloat(s.trim())));
    return [r, g, b]
      .map((n) => Math.max(0, Math.min(255, Number.isFinite(n) ? n : 0)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }
  const six = /^#?([0-9a-f]{6})$/i.exec(css.trim());
  if (six) return six[1].toUpperCase();
  const three = /^#?([0-9a-f]{3})$/i.exec(css.trim());
  if (three) return three[1].split("").map((c) => c + c).join("").toUpperCase();
  return "000000";
}

export function fontWeightToBold(weight: string): boolean {
  if (weight === "bold" || weight === "bolder") return true;
  const n = parseInt(weight, 10);
  return Number.isFinite(n) && n >= 600;
}

export function textAlignToPptx(align: string): "left" | "center" | "right" {
  switch (align) {
    case "center":
      return "center";
    case "right":
    case "end":
      return "right";
    default:
      return "left";
  }
}

export function mapFontFamily(cssFontFamily: string): string {
  const first = cssFontFamily.split(",")[0]?.trim() ?? "";
  return first.replace(/^["']|["']$/g, "") || "Arial";
}

export function cssToPptxTextProps(s: CssTextSnapshot, pxPerInch = PX_PER_INCH): PptxTextProps {
  return {
    fontFace: mapFontFamily(s.fontFamily),
    fontSizePt: pxToPt(parseFloat(s.fontSize) || 0, pxPerInch),
    colorHex: cssColorToHex(s.color),
    bold: fontWeightToBold(s.fontWeight),
    italic: s.fontStyle === "italic" || s.fontStyle === "oblique",
    align: textAlignToPptx(s.textAlign),
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- pptx-textbox.test.ts`
Expected: PASS（7 个 describe 用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add next/src/lib/export/pptx-textbox.ts next/src/lib/export/__tests__/pptx-textbox.test.ts
git commit -m "feat(export): add pure css→pptx text mappers for editable pptx"
```

---

## Task 2: DOM 提取（收集 / 映射 / 去文字）+ 单测

**Files:**
- Modify: `next/src/lib/export/pptx-textbox.ts`（追加 DOM helpers）
- Test: `next/src/lib/export/__tests__/pptx-textbox.test.ts`（追加 DOM 用例）

- [ ] **Step 1: 追加失败测试**

在 `next/src/lib/export/__tests__/pptx-textbox.test.ts` 顶部 import 处加入新符号，并在文件末尾追加一个 describe 块。

把第一行 import 改为：

```ts
import {
  pxToInches,
  pxToPt,
  cssColorToHex,
  fontWeightToBold,
  textAlignToPptx,
  mapFontFamily,
  cssToPptxTextProps,
  hasDirectText,
  collectTextElements,
  stripTextForBackground,
} from "../pptx-textbox";
```

在文件末尾追加：

```ts
describe("pptx-textbox DOM 提取（happy-dom）", () => {
  function docFrom(bodyHtml: string): Document {
    const doc = document.implementation.createHTMLDocument("t");
    doc.body.innerHTML = bodyHtml;
    return doc;
  }

  it("hasDirectText: 仅当有非空直接文本节点", () => {
    const doc = docFrom('<p id="a">hi</p><div id="b"><span>x</span></div><p id="c">   </p>');
    expect(hasDirectText(doc.getElementById("a")!)).toBe(true);
    expect(hasDirectText(doc.getElementById("b")!)).toBe(false);
    expect(hasDirectText(doc.getElementById("c")!)).toBe(false);
  });

  it("collectTextElements: 取含直接文字的块, 不重复嵌入子元素", () => {
    const doc = docFrom(
      '<div><p>A</p><p>B</p></div><p>Hello <strong>world</strong></p>',
    );
    const els = collectTextElements(doc);
    const texts = els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim());
    // 期望: p(A), p(B), p(Hello world) —— strong 在已选 p 内, 不单列
    expect(texts).toEqual(["A", "B", "Hello world"]);
  });

  it("stripTextForBackground: 把文本设为透明", () => {
    const doc = docFrom('<p id="a">hi</p>');
    const el = doc.getElementById("a") as HTMLElement;
    stripTextForBackground([el]);
    expect(el.style.getPropertyValue("color")).toBe("transparent");
    expect(el.style.getPropertyValue("-webkit-text-fill-color")).toBe("transparent");
    expect(el.style.getPropertyValue("text-shadow")).toBe("none");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm -F @html-anything/next test -- pptx-textbox.test.ts`
Expected: FAIL —`hasDirectText` / `collectTextElements` / `stripTextForBackground` 未导出。

- [ ] **Step 3: 追加 DOM helpers 实现**

在 `next/src/lib/export/pptx-textbox.ts` 末尾追加：

```ts
// ─── browser-bound DOM helpers ───────────────────────────────────────
// Not unit-tested for layout (happy-dom has none); collection + strip are
// DOM-shape only and ARE unit-tested. Position reading is covered by e2e.

/** True iff the element has at least one non-whitespace direct text node. */
export function hasDirectText(el: Element): boolean {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 /* TEXT_NODE */ && (n.textContent ?? "").trim()) return true;
  }
  return false;
}

/**
 * Collect the block-level elements that own text, top-down, skipping any
 * element nested inside an already-collected one. So `<p>Hello <strong>w</strong></p>`
 * yields just the `<p>` (whole `textContent`), never a duplicate `<strong>`.
 */
export function collectTextElements(doc: Document): HTMLElement[] {
  const picked: HTMLElement[] = [];
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>("*"))) {
    if (!hasDirectText(el)) continue;
    if (picked.some((p) => p.contains(el))) continue;
    picked.push(el);
  }
  return picked;
}

/** Make the given elements' text invisible so it doesn't bake into the bg PNG. */
export function stripTextForBackground(els: HTMLElement[]): void {
  for (const el of els) {
    el.style.setProperty("color", "transparent", "important");
    el.style.setProperty("-webkit-text-fill-color", "transparent", "important");
    el.style.setProperty("text-shadow", "none", "important");
  }
}

/** Read live layout + computed style into editable text-box descriptors. */
export function elementsToTextBoxes(els: HTMLElement[], win: Window): TextBoxDescriptor[] {
  const out: TextBoxDescriptor[] = [];
  for (const el of els) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const cs = win.getComputedStyle(el);
    const props = cssToPptxTextProps({
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      color: cs.color,
      textAlign: cs.textAlign,
    });
    out.push({
      xIn: pxToInches(rect.left),
      yIn: pxToInches(rect.top),
      wIn: pxToInches(rect.width),
      hIn: pxToInches(rect.height),
      text,
      ...props,
    });
  }
  return out;
}
```

> 注：`elementsToTextBoxes` 读 `getBoundingClientRect` / `getComputedStyle`，在 happy-dom 里返回零矩形 → 全跳过，故不单测；由 Task 4 的 e2e 覆盖。它仍随本任务实现，供 Task 3 编排调用。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm -F @html-anything/next test -- pptx-textbox.test.ts`
Expected: PASS（原 7 + 新 3 = 10 用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add next/src/lib/export/pptx-textbox.ts next/src/lib/export/__tests__/pptx-textbox.test.ts
git commit -m "feat(export): add DOM text collection/strip helpers for editable pptx"
```

---

## Task 3: 重构 deck.ts + 混合 exportDeckPptx + 兜底

**Files:**
- Modify: `next/src/lib/export/deck.ts`

- [ ] **Step 1: 加 import**

在 `next/src/lib/export/deck.ts` 顶部现有 import 之后追加：

```ts
import {
  collectTextElements,
  elementsToTextBoxes,
  stripTextForBackground,
} from "./pptx-textbox";
```

- [ ] **Step 2: 抽出 `withSlideIframe`，让 `renderSlideToBlob` 复用它**

把现有 `renderSlideToBlob`（约 14-57 行）整体替换为下面两个函数：

```ts
/**
 * Set up an off-screen 1920×1080 same-origin iframe for one slide, await load,
 * hand it to `fn`, and always tear it down. The srcdoc is tweaked so the slide
 * renders 1:1 at top-left (no preview centering/scaling) for screenshot/layout.
 */
async function withSlideIframe<T>(
  slide: DeckSlide,
  fn: (iframe: HTMLIFrameElement, doc: Document) => Promise<T>,
): Promise<T> {
  const wrap = document.createElement("div");
  wrap.style.cssText = `
    position: fixed;
    top: 0; left: -100000px;
    width: 1920px; height: 1080px;
    overflow: hidden;
    pointer-events: none;
    z-index: -1;
  `;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", `slide-${slide.id}`);
  iframe.setAttribute("sandbox", "allow-same-origin allow-scripts");
  iframe.style.cssText = `
    width: 1920px; height: 1080px; border: 0; background: ${slide.bg ?? "#fff"};
  `;
  iframe.srcdoc = slide.html.replace(
    /\.slide\s*\{\s*transform-origin[^}]*\}/i,
    ".slide { transform: none !important; transform-origin: top left !important; }",
  ).replace(
    /body\s*\{\s*display:flex;\s*align-items:center;\s*justify-content:center;\s*min-height:100vh;\s*\}/,
    "body { margin:0; padding:0; }",
  );
  wrap.appendChild(iframe);
  document.body.appendChild(wrap);

  try {
    await new Promise<void>((res) => {
      const done = () => res();
      if (iframe.contentDocument?.readyState === "complete") return done();
      iframe.addEventListener("load", done, { once: true });
      setTimeout(done, 4000);
    });
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("iframe document not ready");
    return await fn(iframe, doc);
  } finally {
    wrap.remove();
  }
}

/** Screenshot one slide at native 1920×1080. */
async function renderSlideToBlob(slide: DeckSlide, scale = 2): Promise<Blob> {
  return withSlideIframe(slide, (iframe) => iframeToBlob(iframe, { scale }));
}
```

`exportDeckPngZip` 不动（仍调 `renderSlideToBlob`）。

- [ ] **Step 3: 改写 `exportDeckPptx` 为混合 + 兜底**

把现有 `exportDeckPptx`（约 79-98 行）整体替换为：

```ts
/**
 * Export the deck as a multi-slide PPTX with EDITABLE text.
 *
 * Per slide: read text boxes from live layout, hide that text, screenshot the
 * (now text-free) slide as the background image, then add the background plus
 * native pptx text boxes on top. If extraction fails or finds no text, fall
 * back to the old behavior — a single full-bleed screenshot WITH text baked in.
 */
export async function exportDeckPptx(
  slides: DeckSlide[],
  basename = "deck",
  onProgress?: (i: number, total: number) => void,
): Promise<void> {
  if (slides.length === 0) throw new Error("no slides");
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 inches → 16:9
  for (let i = 0; i < slides.length; i++) {
    onProgress?.(i + 1, slides.length);
    const s = pptx.addSlide();
    try {
      const { bgDataUrl, descriptors } = await withSlideIframe(slides[i], async (iframe, doc) => {
        const win = iframe.contentWindow;
        if (!win) throw new Error("iframe window not ready");
        const els = collectTextElements(doc);
        const boxes = elementsToTextBoxes(els, win);
        if (boxes.length > 0) stripTextForBackground(els);
        const blob = await iframeToBlob(iframe, { scale: 2 });
        return { bgDataUrl: await blobToDataUrl(blob), descriptors: boxes };
      });
      s.addImage({ data: bgDataUrl, x: 0, y: 0, w: "100%", h: "100%" });
      for (const d of descriptors) {
        s.addText(d.text, {
          x: d.xIn, y: d.yIn, w: d.wIn, h: d.hIn,
          fontFace: d.fontFace,
          fontSize: d.fontSizePt,
          color: d.colorHex,
          bold: d.bold,
          italic: d.italic,
          align: d.align,
          valign: "top",
          margin: 0,
        });
      }
    } catch {
      // Fallback: never worse than today — full-bleed screenshot with text.
      const blob = await renderSlideToBlob(slides[i]);
      const dataUrl = await blobToDataUrl(blob);
      s.addImage({ data: dataUrl, x: 0, y: 0, w: "100%", h: "100%" });
    }
    if (slides[i].notes) s.addNotes(slides[i].notes);
  }
  await pptx.writeFile({ fileName: `${basename}-${Date.now()}.pptx` });
}
```

- [ ] **Step 4: 类型检查 + 既有测试不回归**

Run: `pnpm -F @html-anything/next typecheck`
Expected: 无类型错误。

Run: `pnpm -F @html-anything/next test`
Expected: 全绿（pptx-textbox 单测 + 既有套件，无回归）。

- [ ] **Step 5: 提交**

```bash
git add next/src/lib/export/deck.ts
git commit -m "feat(export): editable-text pptx via text-stripped bg + native text boxes"
```

---

## Task 4: e2e — 导出 PPTX 并断言可编辑文本 run

**Files:**
- Create: `e2e/ui/deck-pptx.spec.ts`

- [ ] **Step 1: 写 e2e（先红——文件不存在即未覆盖）**

新建 `e2e/ui/deck-pptx.spec.ts`：

```ts
import { expect, test, type Page } from "@playwright/test";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

const STORE_KEY = "html-everything-store";

const deckHtml = `<!doctype html>
<html>
  <head><title>Deck Fixture</title></head>
  <body>
    <section class="slide" data-slide-id="1">
      <h1>First Slide Title</h1>
      <p>Hello editable world</p>
    </section>
    <section class="slide" data-slide-id="2">
      <h1>Second Slide Title</h1>
      <p>Another text block</p>
    </section>
  </body>
</html>`;

async function seedDeck(page: Page) {
  const now = 1_700_000_000_000;
  const task = {
    id: "task_pptx_ui",
    name: "PPTX fixture",
    content: "PPTX fixture",
    format: "html",
    templateId: "deck-simple",
    html: deckHtml,
    status: "done",
    log: [],
    stats: { outputBytes: deckHtml.length, deltaCount: 1 },
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
            locale: "en",
            layoutMode: "split",
          },
          version: 5,
        }),
      );
    },
    { key: STORE_KEY, taskFixture: task },
  );
}

test.describe("Deck → editable PPTX", () => {
  test("exports a pptx whose slides contain editable text runs + a bg image", async ({ page }) => {
    await seedDeck(page);
    await page.goto("/");

    await page.getByRole("button", { name: /export/i }).click();
    const menu = page.getByTestId("export-menu");
    const pptxButton = menu.getByRole("button", { name: /PowerPoint/ });
    await expect(pptxButton).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await pptxButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pptx$/);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const zip = await JSZip.loadAsync(await readFile(downloadPath!));
    const names = Object.keys(zip.files);

    // Two slides present.
    expect(names).toEqual(
      expect.arrayContaining(["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"]),
    );

    // Slide 1 carries the real text as editable runs (<a:t>…</a:t>), not just an image.
    const slide1 = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide1).toContain("First Slide Title");
    expect(slide1).toContain("Hello editable world");

    // And a background image was embedded.
    expect(names.some((n) => /^ppt\/media\/image\d+\.(png|jpe?g)$/i.test(n))).toBe(true);
  });
});
```

- [ ] **Step 2: 跑 e2e 确认通过**

Run: `pnpm -F @html-anything/e2e test -- deck-pptx`
Expected: PASS —导出的 .pptx 解出 `slide1.xml`/`slide2.xml`，slide1 含「First Slide Title」「Hello editable world」文本 run，且有 `ppt/media/image*`。

> 若该用例 FAIL 且报「descriptors 为空 → 走了兜底（slide1 无 `<a:t>` 文本只有图片）」，说明浏览器里 `getBoundingClientRect` 没拿到布局：检查 `withSlideIframe` 是否等到了 `load`、srcdoc 替换是否误伤了 fixture（fixture 无 `.slide{transform-origin}` 规则，不受替换影响，应正常）。这是真实 bug 信号，不要把断言改宽。

- [ ] **Step 3: e2e 类型检查**

Run: `pnpm -F @html-anything/e2e typecheck`
Expected: 无类型错误。

- [ ] **Step 4: 提交**

```bash
git add e2e/ui/deck-pptx.spec.ts
git commit -m "test(e2e): deck pptx export yields editable text runs"
```

---

## Task 5: 全量验证 + 人工冒烟

**Files:** 无新增；运行验证。

- [ ] **Step 1: 全量单测**

Run: `pnpm -F @html-anything/next test`
Expected: 全绿（pptx-textbox 10 用例 + 既有套件无回归）。

- [ ] **Step 2: 类型检查（app + e2e）**

Run: `pnpm -F @html-anything/next typecheck`
Run: `pnpm -F @html-anything/e2e typecheck`
Expected: 均无错误。

- [ ] **Step 3: 形状守卫**

Run: `pnpm exec tsx scripts/guard.ts`
Expected: `Guard passed.`

- [ ] **Step 4: e2e**

Run: `pnpm -F @html-anything/e2e test -- deck-pptx`
Expected: PASS。

- [ ] **Step 5: 人工冒烟（PowerPoint/Keynote）**

`pnpm -F @html-anything/next dev`，跑一个真实 deck（如 `deck-open-slide-canvas` 用其 `example.md`），导出 `.pptx · PowerPoint`：
- 打开 PPTX，确认每页**文字是可选中、可编辑的原生文本框**（不是整张图片）。
- 视觉与预览基本一致：背景渐变 / SVG / 图表保真；**文字无重影**（底图里的字已透明）。
- 位置/字号/颜色/对齐大体吻合。
- 找一个版面刁钻的 deck，确认即便某页提取失败也能整体导出（该页退回整张图片，不崩）。

---

## Self-Review

- **Spec §2 混合方案** → Task 3（去文字底图 + 文本框 + 兜底）✅
- **Spec §3.1 `withSlideIframe` 重构** → Task 3 Step 2 ✅；`exportDeckPngZip` 复用、行为不变 ✅
- **Spec §3.2 纯映射 + DOM 提取** → Task 1（纯映射）+ Task 2（DOM）✅；符号名一致：`pxToInches/pxToPt/cssColorToHex/fontWeightToBold/textAlignToPptx/mapFontFamily/cssToPptxTextProps/hasDirectText/collectTextElements/elementsToTextBoxes/stripTextForBackground`
- **Spec §4 每页流水线（先读版面→去文字→截图→拼页→单页兜底）** → Task 3 Step 3 ✅（顺序：collect→map→strip→screenshot→addImage→addText；catch 兜底）
- **Spec §5 映射数学（144 px/in、pt=px/2）** → Task 1 实现 + 单测 ✅
- **Spec §6 块级粒度 / 不做 run 级 / 跳空白 / 仅 deck** → `collectTextElements` 块级、`elementsToTextBoxes` 跳空文本/零矩形；deck-only 由 export-menu `deck.isDeck` 既有逻辑保证（不改）✅
- **Spec §7 测试三层** → 纯映射单测（Task 1/2）+ e2e（Task 4）+ 人工冒烟（Task 5）✅
- **Spec §8 改动面** → 仅 `deck.ts` + 新 `pptx-textbox.ts` + 两测试；不碰 invoke/store/skills/其它 export ✅
- **占位符扫描**：无 TODO/TBD；每个 code step 给出完整可粘贴内容。
- **类型一致性**：`TextBoxDescriptor` 字段（xIn/yIn/wIn/hIn/text + PptxTextProps）与 Task 3 `addText` 调用逐一对应；`elementsToTextBoxes(els, win)` 签名与 Task 3 调用一致。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-08-phase2-editable-pptx.md`. 两种执行方式：**

**1. Subagent-Driven（推荐）** — 每个 Task 派全新 subagent，任务间我 review。
**2. Inline Execution** — 本会话内 executing-plans 批量执行，带检查点。

当前已在干净分支 `feat/huashu-phase2-editable-pptx`（spec 已提交）。
