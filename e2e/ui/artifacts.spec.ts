import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

    await expect(page.getByText("hello.txt")).toBeVisible();
    await expect(page.getByRole("link", { name: /下载/ })).toBeVisible();

    const ok = await request.get(`/api/artifacts/file?task=${TASK_ID}&path=hello.txt`);
    expect(ok.status()).toBe(200);
    expect(await ok.text()).toBe("hello");

    const bad = await request.get(`/api/artifacts/file?task=${TASK_ID}&path=${encodeURIComponent("../../etc/passwd")}`);
    expect(bad.status()).toBe(404);
  });
});
