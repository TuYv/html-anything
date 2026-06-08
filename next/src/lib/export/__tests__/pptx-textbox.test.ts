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
