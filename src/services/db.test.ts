import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, deleteTask, getAllTasks, getTasks, updateTask } from "./db";

const fake = vi.hoisted(() => ({ select: vi.fn(), execute: vi.fn() }));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: async () => fake },
}));

beforeEach(() => {
  fake.select.mockResolvedValue([]);
  fake.execute.mockResolvedValue(undefined);
});

function lastExecute(): { sql: string; params: unknown[] } {
  const [sql, params] = fake.execute.mock.lastCall as [string, unknown[]];
  return { sql, params };
}

describe("getTasks", () => {
  it("maps a row to a Task", async () => {
    fake.select.mockResolvedValue([{
      id: "t1",
      title: "Title",
      description: "Desc",
      status: "open",
      priority: "high",
      due_date: "2026-06-01",
      source_type: "calendar",
      source_id: "s1",
      tags: '["a","b"]',
      created_at: "c",
      updated_at: "u",
    }]);
    expect(await getTasks()).toEqual([{
      id: "t1",
      title: "Title",
      description: "Desc",
      status: "open",
      priority: "high",
      dueDate: "2026-06-01",
      sourceType: "calendar",
      sourceId: "s1",
      tags: ["a", "b"],
      createdAt: "c",
      updatedAt: "u",
    }]);
  });

  it("turns null columns into undefined and empty tags", async () => {
    fake.select.mockResolvedValue([{
      id: "t1", title: "T", description: null, status: "open", priority: "low",
      due_date: null, source_type: null, source_id: null, tags: null, created_at: "c", updated_at: "u",
    }]);
    const [t] = await getTasks();
    expect(t.description).toBeUndefined();
    expect(t.dueDate).toBeUndefined();
    expect(t.tags).toEqual([]);
  });
});

describe("createTask", () => {
  it("stores tags as JSON, absent fields as null, and returns the new task", async () => {
    const created = await createTask({ title: "T", status: "open", priority: "low", tags: ["x"] });
    const { params } = lastExecute();
    expect(params.slice(1, 9)).toEqual(["T", null, "open", "low", null, null, null, '["x"]']);
    expect(created.id).toBe(params[0]);
    expect(created.createdAt).toBe(created.updatedAt);
  });
});

describe("updateTask", () => {
  it("writes only the supplied fields, with the id last", async () => {
    await updateTask("t1", { title: "New", tags: ["a"] });
    const { sql, params } = lastExecute();
    expect(sql).toBe("UPDATE tasks SET title = $1, tags = $2, updated_at = $3 WHERE id = $4");
    expect(params[0]).toBe("New");
    expect(params[1]).toBe('["a"]');
    expect(params[3]).toBe("t1");
  });

  it("still bumps updated_at with no other fields", async () => {
    await updateTask("t1", {});
    expect(lastExecute().sql).toBe("UPDATE tasks SET updated_at = $1 WHERE id = $2");
  });

  // TaskForm sends `dueDate: undefined` when the date is cleared.
  it("persists clearing a due date", async () => {
    await updateTask("t1", { dueDate: undefined });
    const { sql, params } = lastExecute();
    expect(sql).toBe("UPDATE tasks SET due_date = $1, updated_at = $2 WHERE id = $3");
    expect(params[0]).toBeNull();
  });

  // TaskForm sends `description: undefined` when the text is cleared.
  it("persists clearing a description", async () => {
    await updateTask("t1", { description: undefined });
    const { sql, params } = lastExecute();
    expect(sql).toBe("UPDATE tasks SET description = $1, updated_at = $2 WHERE id = $3");
    expect(params[0]).toBeNull();
  });

  it("leaves optional fields alone when their keys are absent", async () => {
    await updateTask("t1", { status: "done" });
    expect(lastExecute().sql).toBe("UPDATE tasks SET status = $1, updated_at = $2 WHERE id = $3");
  });
});

describe("deleteTask", () => {
  it("deletes by id", async () => {
    await deleteTask("t1");
    expect(lastExecute().params).toEqual(["t1"]);
  });
});

describe("getAllTasks", () => {
  it("lists every task, newest first", async () => {
    await getAllTasks();
    expect(fake.select.mock.lastCall![0]).toBe("SELECT * FROM tasks ORDER BY created_at DESC");
  });
});
