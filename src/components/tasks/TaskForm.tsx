import { useState } from "react";
import { X } from "lucide-react";
import { useTaskStore } from "../../stores/tasks";
import { Task } from "../../types";

interface TaskFormProps {
  onClose: () => void;
  task?: Task; // if provided, editing an existing task
}

export function TaskForm({ onClose, task }: TaskFormProps) {
  const { add, update } = useTaskStore();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<Task["priority"]>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [tagsInput, setTagsInput] = useState(task?.tags.join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  const isEditing = !!task;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);

    if (isEditing) {
      await update(task.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
        tags,
      });
    } else {
      await add({
        title: title.trim(),
        description: description.trim() || undefined,
        status: "open",
        priority,
        dueDate: dueDate || undefined,
        tags,
      });
    }
    setSaving(false);
    onClose();
  }

  return (
    <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-700 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:bg-gray-100">{isEditing ? "Edit Task" : "New Task"}</h3>
        <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          autoFocus
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
        />
        <textarea
          spellCheck
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
        />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Task["priority"])}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tags (comma-sep)</label>
            <input
              type="text"
              placeholder="work, meeting"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : isEditing ? "Save" : "Add task"}
          </button>
        </div>
      </form>
    </div>
  );
}
