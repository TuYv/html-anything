import path from "node:path";

/**
 * Bundled BGM/SFX library (vendored from huashu-design, MIT). The agent runs in
 * an isolated workdir and can't see the app source tree by default, so for
 * `video` scenarios we inject the absolute path to this directory as an env var
 * (`HTML_ANYTHING_AUDIO_DIR`) and the skill prompt reads tracks from it.
 *
 * Overridable via `HTML_ANYTHING_AUDIO_DIR` (used by tests).
 */
export function audioAssetsDir(): string {
  return (
    process.env.HTML_ANYTHING_AUDIO_DIR ||
    path.join(process.cwd(), "src/lib/templates/audio")
  );
}

/** Env to inject so the agent can reach the bundled audio — video scenarios only. */
export function audioEnvForSkill(scenario: string): Record<string, string> | undefined {
  if (scenario !== "video") return undefined;
  return { HTML_ANYTHING_AUDIO_DIR: audioAssetsDir() };
}
