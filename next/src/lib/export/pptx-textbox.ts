/**
 * Convert a rendered deck slide's text into editable PPTX text boxes.
 *
 * The slide is rendered in a fixed 1920×1080 off-screen iframe; pptxgenjs
 * `LAYOUT_WIDE` is 13.333×7.5in → exactly 144 px/in. So positions/sizes map by
 * `inch = px / 144` and font size by `pt = px / 2` (= px * 72/144).
 *
 * This module is split into PURE mappers (unit-tested) and browser-bound DOM
 * helpers (added in a later task; covered by the Playwright e2e, since
 * happy-dom has no real layout).
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
