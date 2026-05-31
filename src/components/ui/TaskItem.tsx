import { memo } from "react";
import { CalendarDays } from "lucide-react";
import { format, parseISO, isBefore } from "date-fns";
import { Task } from "../../types";

const PRIORITY_BADGE: Record<Task["priority"], string> = {
  high:   "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400",
  medium: "bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
  low:    "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
};

interface TaskItemProps {
  task: Task;
  onComplete?: (id: string) => void;
  showCheckbox?: boolean;
}

export const TaskItem = memo(function TaskItem({ task, onComplete, showCheckbox = true }: TaskItemProps) {
  const isOverdue = task.dueDate && isBefore(parseISO(task.dueDate), new Date()) && task.status !== "done";
  const isDone = task.status === "done";

  return (
    <div className={`flex items-start gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border transition-colors
      ${isDone ? "border-gray-100 dark:border-gray-700 opacity-60" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`}>

      {showCheckbox && onComplete && (
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => onComplete(task.id)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700"
        />
      )}

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug
          ${isDone ? "line-through text-gray-400 dark:text-gray-500"
          : isOverdue ? "text-red-700 dark:text-red-400"
          : "text-gray-800 dark:text-gray-100"}`}>
          {task.title}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {/* Priority badge */}
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${PRIORITY_BADGE[task.priority]}`}>
            {task.priority}
          </span>

          {/* Tags */}
          {task.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded text-xs">
              {tag}
            </span>
          ))}

          {/* Due date */}
          {task.dueDate && (
            <span className={`flex items-center gap-1 text-xs
              ${isOverdue ? "text-red-500 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
              <CalendarDays size={11} />
              {isOverdue ? "Overdue · " : "Due "}
              {format(parseISO(task.dueDate), "MMM d")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

// Sort tasks: high priority first, then medium, then low; done tasks at bottom
export function sortTasks(tasks: Task[]): Task[] {
  const order: Record<Task["priority"], number> = { high: 0, medium: 1, low: 2 };
  return [...tasks].sort((a, b) => {
    const aDone = a.status === "done" ? 1 : 0;
    const bDone = b.status === "done" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return order[a.priority] - order[b.priority];
  });
}
