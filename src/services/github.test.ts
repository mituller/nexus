import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";
import { closeIssue } from "./github";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

describe("closeIssue", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}"));
  });

  it("patches the issue to closed as completed", async () => {
    await closeIssue("tok", "acme/app", 12);
    const [url, init] = vi.mocked(fetch).mock.lastCall as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/acme/app/issues/12");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ state: "closed", state_reason: "completed" });
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok", "Content-Type": "application/json" });
  });

  it("reports the status when GitHub refuses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Resource not accessible", { status: 403 }));
    await expect(closeIssue("tok", "acme/app", 12)).rejects.toThrow("GitHub 403");
  });
});
