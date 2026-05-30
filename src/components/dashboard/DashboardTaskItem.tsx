import { memo } from "react";
import { format, parseISO, isBefore } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Task } from "../../types";
import { useTaskStore } from "../../stores/tasks";

interface DashboardTaskItemProps {
  task: Task;
}

const priorityColors: Record<Task["priority"], string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-gray-100 text-gray-600",
  low: "bg-gray-50 text-gray-400",
};

export const DashboardTaskItem = memo(function DashboardTaskItem({ task }: DashboardTaskItemProps) {
  const { complete } = useTaskStore();
  const isOverdue = task.dueDate && isBefore(parseISO(task.dueDate), new Date());

  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
        onChange={() => complete(task.id)}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isOverdue ? "text-red-700 font-medium" : "text-gray-800"}`}>
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {task.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{tag}</span>
          ))}
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${priorityColors[task.priority]}`}>
            {task.priority}
          </span>
          {task.dueDate && (
            <span className={`flex items-center gap-1 text-xs ${isOverdue ? "text-red-600" : "text-gray-400"}`}>
              <CalendarDays size={11} />
              {isOverdue ? "Due today · overdue" : `Due ${format(parseISO(task.dueDate), "MMM d")}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
