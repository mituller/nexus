import { beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../services/db";
import { Task } from "../types";
import { useTaskStore } from "./tasks";

vi.mock("../services/db");

function task(id: string, overrides: Partial<Task> = {}): Task {
  return { id, title: id, status: "open", priority: "medium", tags: [], createdAt: "c", updatedAt: "u", ...overrides };
}

beforeEach(() => {
  useTaskStore.setState(useTaskStore.getInitialState(), true);
});

describe("useTaskStore", () => {
  it("loads tasks and clears the loading flag", async () => {
    vi.mocked(db.getTasks).mockResolvedValue([task("a")]);
    const pending = useTaskStore.getState().load();
    expect(useTaskStore.getState().loading).toBe(true);
    await pending;
    expect(useTaskStore.getState().tasks).toEqual([task("a")]);
    expect(useTaskStore.getState().loading).toBe(false);
  });

  it("puts a new task first", async () => {
    useTaskStore.setState({ tasks: [task("old")] });
    vi.mocked(db.createTask).mockResolvedValue(task("new"));
    const created = await useTaskStore.getState().add({ title: "new", status: "open", priority: "medium", tags: [] });
    expect(created.id).toBe("new");
    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(["new", "old"]);
  });

  it("updates only the matching task, in the database and in memory", async () => {
    useTaskStore.setState({ tasks: [task("a"), task("b")] });
    await useTaskStore.getState().update("a", { title: "changed" });
    expect(db.updateTask).toHaveBeenCalledWith("a", { title: "changed" });
    expect(useTaskStore.getState().tasks.map((t) => t.title)).toEqual(["changed", "b"]);
  });

  it("removes a task", async () => {
    useTaskStore.setState({ tasks: [task("a"), task("b")] });
    await useTaskStore.getState().remove("a");
    expect(db.deleteTask).toHaveBeenCalledWith("a");
    expect(useTaskStore.getState().tasks.map((t) => t.id)).toEqual(["b"]);
  });

  it("completes a task", async () => {
    useTaskStore.setState({ tasks: [task("a")] });
    await useTaskStore.getState().complete("a");
    expect(db.updateTask).toHaveBeenCalledWith("a", { status: "done" });
    expect(useTaskStore.getState().tasks[0].status).toBe("done");
  });

  it("leaves memory unchanged when the database write fails", async () => {
    useTaskStore.setState({ tasks: [task("a")] });
    vi.mocked(db.updateTask).mockRejectedValue(new Error("disk full"));
    await expect(useTaskStore.getState().update("a", { title: "changed" })).rejects.toThrow("disk full");
    expect(useTaskStore.getState().tasks[0].title).toBe("a");
  });
});
