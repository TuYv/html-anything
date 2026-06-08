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
