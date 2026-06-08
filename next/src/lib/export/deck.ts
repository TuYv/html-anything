"use client";

import type { DeckSlide } from "@/lib/deck";
import { iframeToBlob, downloadBlob } from "./image";
import {
  collectTextElements,
  elementsToTextBoxes,
  stripTextForBackground,
} from "./pptx-textbox";

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

/** Export every slide as a PNG and bundle them into a single ZIP. */
export async function exportDeckPngZip(
  slides: DeckSlide[],
  basename = "deck",
  onProgress?: (i: number, total: number) => void,
): Promise<void> {
  if (slides.length === 0) throw new Error("no slides");
  // Lazy-load JSZip — keeps initial bundle small.
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const pad = (n: number) => String(n).padStart(2, "0");
  for (let i = 0; i < slides.length; i++) {
    onProgress?.(i + 1, slides.length);
    const blob = await renderSlideToBlob(slides[i]);
    zip.file(`${basename}-${pad(i + 1)}.png`, blob);
  }
  const out = await zip.generateAsync({ type: "blob" });
  downloadBlob(out, `${basename}-${Date.now()}.zip`);
}

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
    } catch (err) {
      // Fallback: never worse than today — full-bleed screenshot with text.
      // The hybrid (editable-text) path degraded for this slide; surface why.
      console.warn(`[exportDeckPptx] slide ${i + 1} hybrid path failed; falling back to flat image:`, err);
      const blob = await renderSlideToBlob(slides[i]);
      const dataUrl = await blobToDataUrl(blob);
      s.addImage({ data: dataUrl, x: 0, y: 0, w: "100%", h: "100%" });
    }
    if (slides[i].notes) s.addNotes(slides[i].notes);
  }
  await pptx.writeFile({ fileName: `${basename}-${Date.now()}.pptx` });
}

/**
 * Print to PDF. We open a new window stacking every slide back-to-back at
 * 1920×1080 with `@page` matching, then trigger the browser's print dialog —
 * the user picks "Save as PDF". This avoids shipping a PDF lib (which would
 * either render at low fidelity or balloon the bundle).
 */
export function exportDeckPrint(slides: DeckSlide[], title = "deck"): void {
  if (slides.length === 0) throw new Error("no slides");
  const w = window.open("", "_blank");
  if (!w) throw new Error("popup blocked — allow popups to print/PDF the deck");

  // Strip the per-slide centering wrapper we added in `parseDeck`; here we
  // want each slide laid out one after another at native size for printing.
  const sectionsHtml = slides
    .map((s) => {
      // Pull just the <body>...</body> of the standalone doc so the parent
      // print page's <head> wins for sizing/printing.
      const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(s.html);
      const inner = bodyMatch ? bodyMatch[1] : s.html;
      return `<div class="page" style="background:${s.bg ?? "#fff"}">${inner}</div>`;
    })
    .join("\n");

  // Carry over the deck's <head> from the first slide so fonts / Tailwind CDN
  // / inline <style> still apply.
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(slides[0].html);
  const head = headMatch ? headMatch[1] : "";

  w.document.open();
  w.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
${head}
<style>
  @page { size: 1920px 1080px; margin: 0; }
  html, body { margin: 0; padding: 0; background: #000; }
  .page {
    width: 1920px; height: 1080px;
    overflow: hidden; position: relative;
    page-break-after: always; break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  /* Most deck templates apply transform: scale(...) at preview-fit ratios.
     For print we want native size — neutralize. */
  .page .slide { transform: none !important; }
  @media screen {
    body { display: flex; flex-direction: column; gap: 24px; padding: 24px; align-items: center; }
    .page { transform: scale(0.5); transform-origin: top left; height: 540px; width: 960px; }
  }
</style>
</head>
<body>
${sectionsHtml}
<script>
  // Wait for fonts / images / iframes to settle before opening the print
  // dialog — otherwise the Tailwind CDN may still be injecting styles.
  function ready(cb) {
    if (document.readyState === 'complete') return cb();
    window.addEventListener('load', cb, { once: true });
  }
  ready(function () {
    setTimeout(function () { window.focus(); window.print(); }, 600);
  });
</script>
</body>
</html>`);
  w.document.close();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]!);
}
