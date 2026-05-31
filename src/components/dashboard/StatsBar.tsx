import { DailyBriefing } from "../../types";

interface StatsBarProps {
  stats: DailyBriefing["stats"];
  overdueExternal?: number; // overdue GitLab items + Freshservice tickets
}

export function StatsBar({ stats, overdueExternal = 0 }: StatsBarProps) {
  const totalOverdue = stats.overdueTasks + overdueExternal;

  const items = [
    { value: stats.meetingsToday, label: "Meetings today" },
    { value: stats.highPriorityTasks, label: "High-priority tasks", color: stats.highPriorityTasks > 0 ? "text-orange-600" : undefined },
    { value: totalOverdue, label: "Overdue items", color: totalOverdue > 0 ? "text-red-600" : undefined },
    { value: stats.unreadAlerts, label: "Alerts" },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map(({ value, label, color }) => (
        <div key={label} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 text-center">
          <div className={`text-2xl font-bold ${color ?? "text-gray-900 dark:text-white"}`}>{value}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  );
}
