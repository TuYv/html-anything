import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import { audioAssetsDir, audioEnvForSkill } from "../assets";

const prev = process.env.HTML_ANYTHING_AUDIO_DIR;
afterEach(() => {
  if (prev === undefined) delete process.env.HTML_ANYTHING_AUDIO_DIR;
  else process.env.HTML_ANYTHING_AUDIO_DIR = prev;
});

describe("audioAssetsDir", () => {
  it("defaults under src/lib/templates/audio, honors env override", () => {
    delete process.env.HTML_ANYTHING_AUDIO_DIR;
    expect(audioAssetsDir()).toBe(path.join(process.cwd(), "src/lib/templates/audio"));
    process.env.HTML_ANYTHING_AUDIO_DIR = "/tmp/x/audio";
    expect(audioAssetsDir()).toBe("/tmp/x/audio");
  });
});

describe("audioEnvForSkill", () => {
  it("injects HTML_ANYTHING_AUDIO_DIR for video only", () => {
    process.env.HTML_ANYTHING_AUDIO_DIR = "/tmp/x/audio";
    expect(audioEnvForSkill("video")).toEqual({ HTML_ANYTHING_AUDIO_DIR: "/tmp/x/audio" });
    expect(audioEnvForSkill("design")).toBeUndefined();
    expect(audioEnvForSkill("marketing")).toBeUndefined();
  });
});
