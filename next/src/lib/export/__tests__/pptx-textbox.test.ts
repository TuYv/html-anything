import { describe, it, expect } from "vitest";
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
  styleToRun,
  mergeRuns,
  type RunDescriptor,
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
    expect(texts).toEqual(["A", "B", "Hello world"]);
  });

  it("stripTextForBackground: 把文本设为透明", () => {
    const doc = docFrom('<p id="a">hi</p>');
    const el = doc.getElementById("a") as HTMLElement;
    stripTextForBackground([el]);
    expect(el.style.getPropertyValue("color")).toBe("transparent");
    expect(el.style.getPropertyValue("-webkit-text-fill-color")).toBe("transparent");
    expect(el.style.getPropertyValue("text-shadow")).toBe("none");
    expect(el.style.getPropertyPriority("color")).toBe("important");
    expect(el.style.getPropertyPriority("-webkit-text-fill-color")).toBe("important");
    expect(el.style.getPropertyPriority("text-shadow")).toBe("important");
  });
});

describe("run-level styling", () => {
  it("styleToRun maps per-run bold/italic/color/size", () => {
    expect(styleToRun("hi", { fontWeight: "700", fontStyle: "italic", color: "rgb(10,10,10)", fontSize: "48px" })).toEqual({
      text: "hi", bold: true, italic: true, colorHex: "0A0A0A", fontSizePt: 24,
    });
  });
  it("mergeRuns merges adjacent same-style runs and drops empties", () => {
    const runs: RunDescriptor[] = [
      { text: "a", bold: false, italic: false, colorHex: "000000", fontSizePt: 12 },
      { text: "b", bold: false, italic: false, colorHex: "000000", fontSizePt: 12 },
      { text: "", bold: true, italic: false, colorHex: "000000", fontSizePt: 12 },
      { text: "c", bold: true, italic: false, colorHex: "000000", fontSizePt: 12 },
    ];
    expect(mergeRuns(runs)).toEqual([
      { text: "ab", bold: false, italic: false, colorHex: "000000", fontSizePt: 12 },
      { text: "c", bold: true, italic: false, colorHex: "000000", fontSizePt: 12 },
    ]);
  });
});
