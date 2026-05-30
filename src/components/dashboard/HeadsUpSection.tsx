import { AlertTriangle, Calendar, Clock, Info, CheckCircle } from "lucide-react";
import { HeadsUpItem } from "../../types";

const typeConfig: Record<HeadsUpItem["type"], { icon: React.ReactNode; bg: string; border: string; text: string }> = {
  overdue: {
    icon: <Clock size={14} className="text-orange-600 shrink-0 mt-0.5" />,
    bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-900",
  },
  tentative: {
    icon: <Calendar size={14} className="text-yellow-600 shrink-0 mt-0.5" />,
    bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-900",
  },
  back_to_back: {
    icon: <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />,
    bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-900",
  },
  tomorrow: {
    icon: <CheckCircle size={14} className="text-green-600 shrink-0 mt-0.5" />,
    bg: "bg-green-50", border: "border-green-200", text: "text-green-900",
  },
  info: {
    icon: <AlertTriangle size={14} className="text-gray-500 dark:text-gray-500 shrink-0 mt-0.5" />,
    bg: "bg-gray-50 dark:bg-gray-900", border: "border-gray-200 dark:border-gray-700", text: "text-gray-700 dark:text-gray-300",
  },
};

interface HeadsUpSectionProps {
  items: HeadsUpItem[];
}

export function HeadsUpSection({ items }: HeadsUpSectionProps) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-500 mb-3">
        <AlertTriangle size={12} />
        Heads Up
      </h2>
      <div className="space-y-2">
        {items.map((item, i) => {
          const cfg = typeConfig[item.type];
          return (
            <div key={i} className={`flex gap-2.5 px-3 py-2.5 rounded-lg border ${cfg.bg} ${cfg.border}`}>
              {cfg.icon}
              <p className={`text-sm ${cfg.text} leading-snug`}>{item.message}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
