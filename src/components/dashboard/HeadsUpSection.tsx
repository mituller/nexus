import { AlertTriangle, Calendar, Clock, Info, CheckCircle, ExternalLink, ArrowRight } from "lucide-react";
import { HeadsUpItem } from "../../types";
import { openExternalUrl } from "../../utils/calendar";

const typeConfig: Record<HeadsUpItem["type"], { icon: React.ReactNode; bg: string; border: string; text: string; linkColor: string }> = {
  overdue: {
    icon: <Clock size={14} className="text-orange-600 shrink-0 mt-0.5" />,
    bg: "bg-orange-50 dark:bg-orange-900/20", border: "border-orange-200 dark:border-orange-800",
    text: "text-orange-900 dark:text-orange-200", linkColor: "text-orange-600 dark:text-orange-400",
  },
  tentative: {
    icon: <Calendar size={14} className="text-yellow-600 shrink-0 mt-0.5" />,
    bg: "bg-yellow-50 dark:bg-yellow-900/20", border: "border-yellow-200 dark:border-yellow-800",
    text: "text-yellow-900 dark:text-yellow-200", linkColor: "text-yellow-600 dark:text-yellow-400",
  },
  back_to_back: {
    icon: <Info size={14} className="text-purple-600 shrink-0 mt-0.5" />,
    bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-900 dark:text-blue-200", linkColor: "text-blue-600 dark:text-blue-400",
  },
  tomorrow: {
    icon: <CheckCircle size={14} className="text-green-600 shrink-0 mt-0.5" />,
    bg: "bg-green-50 dark:bg-green-900/20", border: "border-green-200 dark:border-green-800",
    text: "text-green-900 dark:text-green-200", linkColor: "text-green-600 dark:text-green-400",
  },
  info: {
    icon: <AlertTriangle size={14} className="text-gray-500 shrink-0 mt-0.5" />,
    bg: "bg-gray-50 dark:bg-gray-800", border: "border-gray-200 dark:border-gray-700",
    text: "text-gray-700 dark:text-gray-300", linkColor: "text-gray-500 dark:text-gray-400",
  },
};

interface HeadsUpSectionProps {
  items: HeadsUpItem[];
  onNavigateTasks?: () => void;
}

export function HeadsUpSection({ items, onNavigateTasks }: HeadsUpSectionProps) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
        <AlertTriangle size={12} />
        Heads Up
      </h2>
      <div className="space-y-2">
        {items.map((item, i) => {
          const cfg = typeConfig[item.type];
          const content = (
            <>
              {cfg.icon}
              <p className={`text-sm ${cfg.text} leading-snug flex-1`}>{item.message}</p>
              {item.url && <ExternalLink size={13} className={`shrink-0 mt-0.5 ${cfg.linkColor}`} />}
              {item.taskId && !item.url && <ArrowRight size={13} className={`shrink-0 mt-0.5 ${cfg.linkColor}`} />}
            </>
          );

          if (item.url) {
            return (
              <button
                key={i}
                onClick={() => openExternalUrl(item.url!)}
                className={`w-full flex gap-2.5 px-3 py-2.5 rounded-lg border text-left hover:brightness-95 transition-all ${cfg.bg} ${cfg.border}`}
              >
                {content}
              </button>
            );
          }

          if (item.taskId && onNavigateTasks) {
            return (
              <button
                key={i}
                onClick={onNavigateTasks}
                className={`w-full flex gap-2.5 px-3 py-2.5 rounded-lg border text-left hover:brightness-95 transition-all ${cfg.bg} ${cfg.border}`}
              >
                {content}
              </button>
            );
          }

          return (
            <div key={i} className={`flex gap-2.5 px-3 py-2.5 rounded-lg border ${cfg.bg} ${cfg.border}`}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
