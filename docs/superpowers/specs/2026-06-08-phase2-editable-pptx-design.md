# Phase 2 设计：可编辑 PPTX（混合文本框）

**状态**: 已批准（设计层），待出实施计划
**日期**: 2026-06-08
**上游**: `docs/superpowers/specs/2026-06-08-huashu-integration-design.md` §4 的细化。原 §4 把「产物子系统地基 + 工具链探测」和「可编辑 PPTX」捆在 Phase 2；brainstorming 阶段确认二者相互独立，且产物子系统的**唯一真实消费者是 Phase 3 的视频产出**，故按 YAGNI 拆分：

- **本 Phase 2 = 仅可编辑 PPTX**（自包含、浏览器侧、零新依赖、立刻出价值）。
- **产物子系统 + 工具链探测** 移入 Phase 3（视频产出时才有消费者）。

---

## 1. 背景与现状（已对照真实代码）

- `next/src/lib/export/deck.ts` 已有 `exportDeckPptx(slides, basename, onProgress)`，但它把**每页当整张满铺 PNG** 塞进 slide（`s.addImage({ data, x:0,y:0,w:"100%",h:"100%" })`）——产物是图片，文字不可编辑。
- `pptxgenjs ^4.0.1` 已是依赖；deck 解析 `parseDeck` → `DeckSlide{ id, html, bg, notes }`（`next/src/lib/deck.ts`）已存在；导出按钮、下载路径（`pptx.writeFile`）均已就位。
- `renderSlideToBlob(slide, scale)` 已经把每页渲染进一个 **1920×1080 same-origin 离屏 iframe**（`sandbox="allow-same-origin allow-scripts"`，`srcdoc`），再用 `iframeToBlob` 截图。

**关键洞察**：因为 iframe 是 same-origin 且已按原生 1920×1080 渲染，我们能直接读**实时版面**（`getBoundingClientRect` + `getComputedStyle`），无需静态解析 CSS。这把「HTML → 可编辑文本框」从难题变成可行工程。

**契合铁律**：全程浏览器侧、复用现有 iframe 渲染、无 daemon、无新服务进程、无新依赖。

---

## 2. 方案：混合（去文字底图 + 可编辑文本层）

每页 = **一张「文字透明」的 PNG 背景**（保留渐变 / SVG / 图表 / 装饰的像素级保真）+ **覆盖其上的原生 pptx 文本框**（真可编辑、无重影）。

被否方案：
- 纯原生重建（无底图）→ 渐变 / SVG / 复杂图表保真度差、解析脆弱。
- 现有整张 PNG + 文本覆盖 → 用户一编辑，底图里烘死的旧字会露出（重影）。

---

## 3. 模块结构（隔离、单一职责）

### 3.1 重构 `export/deck.ts`
抽出 iframe 生命周期为可复用 helper：

```ts
// 建 1920×1080 离屏 same-origin iframe、等 load、交回调、finally 清理。
async function withSlideIframe<T>(slide: DeckSlide, cb: (iframe: HTMLIFrameElement) => Promise<T>): Promise<T>
```

`exportDeckPngZip` 与 `exportDeckPptx` 都改用它（`renderSlideToBlob` 的现有 iframe 搭建逻辑迁入）。这样「截图前先读版面 / 改样式」成为可能。

### 3.2 新模块 `export/pptx-textbox.ts`
承载文本框提取 + **纯映射函数**（单测核心）。`deck.ts` 只做编排，不放映射细节。

导出物：
- `type TextBoxDescriptor = { xIn:number; yIn:number; wIn:number; hIn:number; text:string; fontFace:string; fontSizePt:number; colorHex:string; bold:boolean; italic:boolean; align:"left"|"center"|"right" }`
- 纯函数（无 DOM 依赖，happy-dom 可测）：
  - `pxToInches(px:number, canvasPx:number, layoutIn:number):number`
  - `pxToPt(px:number, canvasPx:number, layoutIn:number):number`
  - `cssColorToHex(css:string):string`  // `rgb(a)` / 计算值 → `"RRGGBB"`
  - `fontWeightToBold(weight:string):boolean`  // ≥600 → true
  - `textAlignToPptx(align:string):"left"|"center"|"right"`
  - `mapFontFamily(cssFontFamily:string):string`  // 取首个族名去引号
  - `cssToPptxTextProps(style)` 组合上述，产出 `{ fontFace,fontSizePt,colorHex,bold,italic,align }`
- DOM/版面相关（薄、不走单测，靠 e2e/人工冒烟）：
  - `collectTextElements(doc:Document):HTMLElement[]`  // 含直接文字的块级元素
  - `extractTextBoxes(doc:Document, dims:{canvasPx, layoutIn}):TextBoxDescriptor[]`  // 读 rect+style，调纯映射
  - `stripTextForBackground(els:HTMLElement[]):void`  // color/-webkit-text-fill-color: transparent; text-shadow:none

---

## 4. 每页流水线（`exportDeckPptx` 内编排）

对每张 slide：
1. `withSlideIframe` 渲染到原生 1920×1080。
2. **先读版面**（必须在去文字之前）：`extractTextBoxes(doc, dims)` → `TextBoxDescriptor[]`。
3. **去文字底图**：`stripTextForBackground(els)` → 再 `iframeToBlob` 截图 → 「无文字」PNG。
4. **拼页**：`addSlide()` → `addImage(底图 dataUrl, 满铺)` → 对每个 descriptor `s.addText(text, { x,y,w,h, fontFace, fontSize, color, bold, italic, align, valign:"top" })`。`slide.notes` → `addNotes` 照旧。
5. **单页兑底**：第 2/3 步任一抛错，或 `descriptors.length === 0` → 退回今天的「整张含文字 PNG 满铺」。永不比现状更差。

---

## 5. 映射数学

画布 1920px ↔ `LAYOUT_WIDE` 13.333in（宽）/ 7.5in（高），即 **144 px/in**，横竖同比。
- 位置/尺寸：`inches = px * (13.333 / 1920)`（= `px / 144`）。
- 字号：`pt = px * 72 / 144 = px * 0.5`。
- 颜色：计算值 `rgb()/rgba()` → `RRGGBB`（丢弃 alpha；全透明文本视为无文字，跳过）。
- 粗体：`font-weight ≥ 600`；斜体：`font-style === "italic"`；对齐：`text-align → left|center|right`（`justify`/`start` 归 left，`end` 归 right）。
- 字体：`font-family` 首个族名去引号原样写入。**已知 v1 限制**：CJK 字体（Noto Sans SC 等）若用户机器没有，由 PowerPoint 替换。

---

## 6. 边界与取舍（v1）

- **块级粒度**：一个块级元素 = 一个文本框，用该块的计算样式。块内混排（`<p>` 里的 `<strong>`）v1 用块的主样式，**不做 run 级**粗体/分色（YAGNI；后续可加）。
- **空白/空文本节点**：跳过。
- **旋转/溢出文本**：bounding box 可能不准；交由单页兑底兜底。
- **非 deck 产物**：本特性仅对 `isDeck`（`parseDeck` 检测到 `<section class="slide">`）生效，与现有 `exportDeckPptx` 一致。

---

## 7. 测试策略

| 层 | 工具 | 覆盖 |
|----|------|------|
| 纯映射 | vitest / happy-dom | `pxToInches` / `pxToPt` / `cssColorToHex` / `fontWeightToBold` / `textAlignToPptx` / `mapFontFamily` / `cssToPptxTextProps` —— 真行为、非套套逻辑 |
| 浏览器真相 | Playwright（`e2e/` 唯一来源） | 跑一次 deck 导出，断言下载到合法 .pptx（zip 解出 ≥1 slide XML 且含文本 run） |
| 人工冒烟 | PowerPoint/Keynote | 文字可选中可编辑、视觉与预览一致、底图无重影 |

> happy-dom 无真实 layout（`getBoundingClientRect` 返 0），故提取/截图层不走单测，由 e2e + 冒烟兜。这与仓库现状一致（浏览器行为以 `e2e/` 为准，见 AGENTS.md）。

---

## 8. 改动面 / 回退

- **改**：`next/src/lib/export/deck.ts`（抽 `withSlideIframe` + 改写 `exportDeckPptx` 编排 + 兜底）。
- **新增**：`next/src/lib/export/pptx-textbox.ts` + `next/src/lib/export/__tests__/pptx-textbox.test.ts` + 1 个 `e2e/ui/*.spec.ts`。
- **不碰**：`invoke` / `store` / `skills` / `scenarios` / 其它 `export/*`。
- 回退 = revert 这几个文件（`exportDeckPptx` 回到 PNG-满铺）。

---

## 9. 验收

- 对一个 deck（如 `deck-open-slide-canvas` 的 `example.html`）导出 PPTX：打开后**文字为可选中、可编辑的原生文本框**，位置/字号/颜色/对齐与预览基本一致，背景视觉（渐变/SVG）保真，无文字重影。
- 提取失败的页自动退回整张 PNG，导出整体不崩。
- 纯映射单测通过；e2e 导出断言通过。

---

## 10. 与 Phase 3 的边界

本期**不**引入「非 HTML 产物发现」「工具链探测」「agent 跑脚本产出二进制」。这些随 Phase 3（动画→MP4/GIF + 长视频）一起做，因为只有视频产出才真正需要把 agent 写到 cwd 的文件捞进 UI。可编辑 PPTX 完全留在现有浏览器侧 export 架构内，不依赖任何 Phase 3 地基。
