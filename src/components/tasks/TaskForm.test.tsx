// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, updateTask } from "../../services/db";
import { useTaskStore } from "../../stores/tasks";
import { Task } from "../../types";
import { TaskForm } from "./TaskForm";

vi.mock("../../services/db");

const existing: Task = {
  id: "t1", title: "Old", description: "Why", status: "open", priority: "high",
  dueDate: "2030-01-05", tags: ["a", "b"], createdAt: "c", updatedAt: "u",
};

const onClose = vi.fn();

beforeEach(() => {
  useTaskStore.setState({ tasks: [existing] });
  vi.mocked(createTask).mockImplementation(async (t) => ({ ...t, id: "new", createdAt: "c", updatedAt: "u" } as Task));
});

afterEach(cleanup);

describe("adding a task", () => {
  it("can't be submitted without a title", async () => {
    render(<TaskForm onClose={onClose} />);
    const submit = screen.getByRole("button", { name: "Add task" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await userEvent.type(screen.getByPlaceholderText("Task title"), "   ");
    expect(submit.disabled).toBe(true);
  });

  it("saves the trimmed fields and closes", async () => {
    render(<TaskForm onClose={onClose} />);
    await userEvent.type(screen.getByPlaceholderText("Task title"), "  Book venue  ");
    await userEvent.type(screen.getByPlaceholderText("Description (optional)"), " Soon ");
    await userEvent.selectOptions(screen.getByRole("combobox"), "low");
    await userEvent.type(screen.getByPlaceholderText("work, meeting"), " x, ,y ,");
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createTask).toHaveBeenCalledWith({
      title: "Book venue", description: "Soon", status: "open", priority: "low", dueDate: undefined, tags: ["x", "y"],
    });
  });

  it("defaults to medium priority, with no description", async () => {
    render(<TaskForm onClose={onClose} />);
    await userEvent.type(screen.getByPlaceholderText("Task title"), "Book venue{Enter}");
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(vi.mocked(createTask).mock.lastCall![0]).toMatchObject({ priority: "medium", description: undefined, tags: [] });
  });

  it("closes without saving on Cancel", async () => {
    render(<TaskForm onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
  });
});

describe("editing a task", () => {
  it("starts with the task's values", () => {
    const { container } = render(<TaskForm onClose={onClose} task={existing} />);
    expect(screen.getByText("Edit Task")).toBeTruthy();
    expect((screen.getByPlaceholderText("Task title") as HTMLInputElement).value).toBe("Old");
    expect((screen.getByPlaceholderText("Description (optional)") as HTMLTextAreaElement).value).toBe("Why");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("high");
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe("2030-01-05");
    expect((screen.getByPlaceholderText("work, meeting") as HTMLInputElement).value).toBe("a, b");
  });

  it("updates the task instead of adding one", async () => {
    render(<TaskForm onClose={onClose} task={existing} />);
    await userEvent.clear(screen.getByPlaceholderText("Task title"));
    await userEvent.type(screen.getByPlaceholderText("Task title"), "New");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(createTask).not.toHaveBeenCalled();
    expect(updateTask).toHaveBeenCalledWith("t1", {
      title: "New", description: "Why", priority: "high", dueDate: "2030-01-05", tags: ["a", "b"],
    });
  });

  it("clears the description and due date when they're emptied", async () => {
    const { container } = render(<TaskForm onClose={onClose} task={existing} />);
    await userEvent.clear(screen.getByPlaceholderText("Description (optional)"));
    await userEvent.clear(container.querySelector('input[type="date"]') as HTMLInputElement);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateTask).toHaveBeenCalled());
    const updates = vi.mocked(updateTask).mock.lastCall![1];
    expect(updates).toHaveProperty("description", undefined);
    expect(updates).toHaveProperty("dueDate", undefined);
  });
});
