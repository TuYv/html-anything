import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ttsConfigPath,
  readTtsConfig,
  writeTtsConfig,
  deleteTtsConfig,
  publicTtsConfig,
  ttsEnvForSkill,
  SAVED_TTS_KEY_MASK,
} from "../config";

let dir: string;
const prev = process.env.HTML_ANYTHING_USER_STATE_DIR;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ha-tts-"));
  process.env.HTML_ANYTHING_USER_STATE_DIR = dir;
});
afterEach(() => {
  if (prev === undefined) delete process.env.HTML_ANYTHING_USER_STATE_DIR;
  else process.env.HTML_ANYTHING_USER_STATE_DIR = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("tts config storage", () => {
  it("writes with chmod 600 and round-trips, public masks the key", async () => {
    const pub = await writeTtsConfig({ endpoint: "https://x/v1/audio/speech", apiKey: "secret123", model: "tts-1", voice: "alloy" });
    expect(pub.configured).toBe(true);
    expect(pub.apiKeyMask).toBe(SAVED_TTS_KEY_MASK);
    expect(JSON.stringify(pub)).not.toContain("secret123"); // no plaintext key in public shape

    const file = ttsConfigPath();
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);

    const raw = await readTtsConfig();
    expect(raw.apiKey).toBe("secret123");
    expect(raw.endpoint).toBe("https://x/v1/audio/speech");
  });

  it("PUT with the mask keeps the existing key (does not overwrite with mask)", async () => {
    await writeTtsConfig({ endpoint: "https://x", apiKey: "secret123" });
    await writeTtsConfig({ endpoint: "https://y", apiKey: SAVED_TTS_KEY_MASK });
    const raw = await readTtsConfig();
    expect(raw.apiKey).toBe("secret123");
    expect(raw.endpoint).toBe("https://y");
  });

  it("requires endpoint + apiKey", async () => {
    await expect(writeTtsConfig({ endpoint: "", apiKey: "k" })).rejects.toThrow();
    await expect(writeTtsConfig({ endpoint: "https://x", apiKey: "" })).rejects.toThrow();
  });

  it("delete clears the file", async () => {
    await writeTtsConfig({ endpoint: "https://x", apiKey: "k" });
    const pub = await deleteTtsConfig();
    expect(pub.configured).toBe(false);
    expect(fs.existsSync(ttsConfigPath())).toBe(false);
  });

  it("read returns empty config when absent", async () => {
    const raw = await readTtsConfig();
    expect(raw).toEqual({ endpoint: "", apiKey: "", model: "", voice: "" });
  });
});

describe("ttsEnvForSkill", () => {
  const cfg = { endpoint: "https://x", apiKey: "k", model: "m", voice: "v" };
  it("injects TTS_* only for video scenario with a key", () => {
    expect(ttsEnvForSkill("video", cfg)).toEqual({
      TTS_ENDPOINT: "https://x", TTS_API_KEY: "k", TTS_MODEL: "m", TTS_VOICE: "v",
    });
  });
  it("returns undefined for non-video", () => {
    expect(ttsEnvForSkill("design", cfg)).toBeUndefined();
  });
  it("returns undefined when no key", () => {
    expect(ttsEnvForSkill("video", { endpoint: "https://x", apiKey: "", model: "", voice: "" })).toBeUndefined();
  });
  it("omits optional model/voice when empty", () => {
    expect(ttsEnvForSkill("video", { endpoint: "https://x", apiKey: "k", model: "", voice: "" })).toEqual({
      TTS_ENDPOINT: "https://x", TTS_API_KEY: "k",
    });
  });
});
