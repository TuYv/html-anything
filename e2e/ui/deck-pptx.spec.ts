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
      <p><em>Hello</em> <strong>editable</strong> world</p>
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
    // PPTX export renders each slide to a PNG via modern-screenshot (domToBlob at
    // 1920×1080 scale=2) inside a headless browser — this is significantly slower
    // than a DOM or network operation. Allow up to 90 s so the two-slide render
    // completes before the assertion phase.
    test.setTimeout(90_000);
    // Capture browser console for diagnostics.
    const consoleLogs: string[] = [];
    page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on("pageerror", (err) => consoleLogs.push(`[pageerror] ${err.message}`));
    await seedDeck(page);
    await page.goto("/");

    await page.getByRole("button", { name: /export/i }).click();
    const menu = page.getByTestId("export-menu");
    const pptxButton = menu.getByRole("button", { name: /PowerPoint/ });
    await expect(pptxButton).toBeVisible();

    const downloadPromise = page.waitForEvent("download", { timeout: 80_000 });
    await pptxButton.click();
    const download = await downloadPromise.catch((err: Error) => {
      console.error("Download did not fire. Browser console output:\n" + consoleLogs.join("\n"));
      throw err;
    });
    expect(download.suggestedFilename()).toMatch(/\.pptx$/);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const zip = await JSZip.loadAsync(await readFile(downloadPath!));
    const names = Object.keys(zip.files);

    expect(names).toEqual(
      expect.arrayContaining(["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"]),
    );

    const slide1 = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide1).toContain("First Slide Title");
    expect(slide1).toContain("Hello");
    expect(slide1).toContain("editable");
    expect(slide1).toContain("world");
    // run-level bold: pptxgenjs encodes bold runs as <a:rPr ... b="1"
    expect(slide1).toMatch(/<a:rPr[^>]*\bb="1"/);
    // whitespace between differently-styled spans must survive, not merge words
    const slide1Texts = [...slide1.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join("");
    expect(slide1Texts).toContain("Hello editable world");

    // PptxGenJS names media files as image-{slideN}-{imgN}.png (e.g. image-1-1.png).
    expect(names.some((n) => /^ppt\/media\/image[\d-]+\.(png|jpe?g)$/i.test(n))).toBe(true);
  });
});
