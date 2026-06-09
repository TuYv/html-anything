import { promises as fsp, chmodSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Local TTS credentials, stored at `~/.html-anything/tts.json` (chmod 600),
 * mirroring `lib/deploy/config.ts`. The plaintext key never leaves the server:
 * the public shape masks it. `HTML_ANYTHING_USER_STATE_DIR` redirects storage
 * (used by tests).
 */
export type TtsConfig = { endpoint: string; apiKey: string; model: string; voice: string };
export type PublicTtsConfig = {
  configured: boolean;
  endpoint: string;
  model: string;
  voice: string;
  apiKeyMask: string;
};

export const SAVED_TTS_KEY_MASK = "saved-tts-key";

export function ttsConfigPath(): string {
  const base = process.env.HTML_ANYTHING_USER_STATE_DIR || path.join(homedir(), ".html-anything");
  return path.join(base, "tts.json");
}

function isEnoent(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === "object" && err !== null && "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function readTtsConfig(): Promise<TtsConfig> {
  try {
    const raw = await fsp.readFile(ttsConfigPath(), "utf8");
    const p = JSON.parse(raw) as Partial<TtsConfig>;
    return {
      endpoint: typeof p.endpoint === "string" ? p.endpoint : "",
      apiKey: typeof p.apiKey === "string" ? p.apiKey : "",
      model: typeof p.model === "string" ? p.model : "",
      voice: typeof p.voice === "string" ? p.voice : "",
    };
  } catch (err) {
    if (isEnoent(err)) return { endpoint: "", apiKey: "", model: "", voice: "" };
    throw err;
  }
}

export function publicTtsConfig(cfg: TtsConfig): PublicTtsConfig {
  return {
    configured: !!cfg.apiKey,
    endpoint: cfg.endpoint,
    model: cfg.model,
    voice: cfg.voice,
    apiKeyMask: cfg.apiKey ? SAVED_TTS_KEY_MASK : "",
  };
}

export async function writeTtsConfig(input: Partial<TtsConfig>): Promise<PublicTtsConfig> {
  const current = await readTtsConfig();
  const keyInput = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const next: TtsConfig = {
    endpoint: typeof input.endpoint === "string" ? input.endpoint.trim() : current.endpoint,
    // mask string means "keep existing" — never persist the mask as the key.
    apiKey: keyInput && keyInput !== SAVED_TTS_KEY_MASK ? keyInput : current.apiKey,
    model: typeof input.model === "string" ? input.model.trim() : current.model,
    voice: typeof input.voice === "string" ? input.voice.trim() : current.voice,
  };
  if (!next.endpoint) throw new Error("TTS endpoint is required");
  if (!next.apiKey) throw new Error("TTS API key is required");
  const file = ttsConfigPath();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    /* best-effort on FS without mode support */
  }
  return publicTtsConfig(next);
}

export async function deleteTtsConfig(): Promise<PublicTtsConfig> {
  try {
    await fsp.unlink(ttsConfigPath());
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
  return publicTtsConfig({ endpoint: "", apiKey: "", model: "", voice: "" });
}

/**
 * The `TTS_*` env to inject into the agent process — ONLY for `video`
 * scenarios with a configured key. Returns undefined otherwise (no secret
 * exposure to non-video tasks).
 */
export function ttsEnvForSkill(scenario: string, cfg: TtsConfig): Record<string, string> | undefined {
  if (scenario !== "video" || !cfg.apiKey) return undefined;
  return {
    TTS_ENDPOINT: cfg.endpoint,
    TTS_API_KEY: cfg.apiKey,
    ...(cfg.model ? { TTS_MODEL: cfg.model } : {}),
    ...(cfg.voice ? { TTS_VOICE: cfg.voice } : {}),
  };
}
