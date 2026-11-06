import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetch } from "@tauri-apps/plugin-http";
import { closeGitLabIssue, createGitLabIssue, getUserProjects } from "./gitlabWrite";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

function lastCall() {
  const [url, init] = vi.mocked(fetch).mock.lastCall as [string, RequestInit];
  return { url, init, body: init.body ? JSON.parse(init.body as string) : undefined };
}

beforeEach(() => {
  vi.mocked(fetch).mockResolvedValue(new Response("{}"));
});

describe("createGitLabIssue", () => {
  it("posts to the project on the URL's origin and maps the result", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: 1, iid: 2, web_url: "https://x/2", project_id: 3 })));
    const created = await createGitLabIssue("https://gitlab.com/acme", "tok", "acme/app", "Fix", "Why", "2026-07-01", ["a", "b"]);

    const { url, init, body } = lastCall();
    expect(url).toBe("https://gitlab.com/api/v4/projects/acme%2Fapp/issues");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "PRIVATE-TOKEN": "tok" });
    expect(body).toEqual({ title: "Fix", description: "Why", due_date: "2026-07-01", labels: "a,b" });
    expect(created).toEqual({ id: 1, iid: 2, webUrl: "https://x/2", projectId: 3 });
  });

  it("sends empty values for the optional fields", async () => {
    await createGitLabIssue("https://gitlab.com", "tok", "1", "Fix");
    expect(lastCall().body).toEqual({ title: "Fix", description: "", due_date: null, labels: "" });
  });

  it("reports the status when GitLab refuses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("forbidden", { status: 403 }));
    await expect(createGitLabIssue("https://gitlab.com", "tok", "1", "Fix")).rejects.toThrow("GitLab 403: forbidden");
  });
});

describe("closeGitLabIssue", () => {
  it("puts the close event on the issue", async () => {
    await closeGitLabIssue("https://gitlab.com", "tok", 3, 2);
    const { url, init, body } = lastCall();
    expect(url).toBe("https://gitlab.com/api/v4/projects/3/issues/2");
    expect(init.method).toBe("PUT");
    expect(body).toEqual({ state_event: "close" });
  });

  it("reports the status when GitLab refuses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("gone", { status: 404 }));
    await expect(closeGitLabIssue("https://gitlab.com", "tok", 3, 2)).rejects.toThrow("GitLab 404: gone");
  });
});

describe("getUserProjects", () => {
  it("maps the projects the user belongs to", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([{ id: 1, name: "App", path_with_namespace: "acme/app" }])));
    expect(await getUserProjects("https://gitlab.com/acme", "tok")).toEqual([
      { id: 1, name: "App", pathWithNamespace: "acme/app" },
    ]);
    expect(lastCall().url).toContain("https://gitlab.com/api/v4/projects?membership=true");
  });

  it("returns nothing when GitLab refuses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 401 }));
    expect(await getUserProjects("https://gitlab.com", "tok")).toEqual([]);
  });
});
