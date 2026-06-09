import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store";

describe("store artifacts", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(() => {
    const t = useStore.getState().tasks[0];
    useStore.setState({ tasks: [t], activeTaskId: t.id });
  });

  it("setArtifactsFor stores artifacts on the task", () => {
    const id = useStore.getState().tasks[0].id;
    useStore.getState().setArtifactsFor(id, [
      { name: "v.mp4", relPath: "v.mp4", size: 10, mime: "video/mp4" },
    ]);
    expect(useStore.getState().tasks[0].artifacts).toEqual([
      { name: "v.mp4", relPath: "v.mp4", size: 10, mime: "video/mp4" },
    ]);
  });

  it("deleteTask best-effort DELETEs the workdir endpoint", () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const id = useStore.getState().tasks[0].id;
    useStore.getState().deleteTask(id);
    expect(calls.some((c) => c.startsWith("DELETE") && c.includes(`/api/artifacts?task=${id}`))).toBe(true);
  });
});
