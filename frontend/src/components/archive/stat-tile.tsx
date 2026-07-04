import type { LucideIcon } from "lucide-react";

export interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "rose" | "violet" | "emerald" | "slate";
}

const TONE_MAP: Record<StatTileProps["tone"], string> = {
  rose: "from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-400",
  violet: "from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400",
  emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  slate: "from-slate-500/15 to-slate-500/5 text-slate-600 dark:text-slate-400",
};

export function StatTile({ icon: Icon, label, value, tone }: StatTileProps) {
  return (
    <div
      className={`rounded-lg bg-gradient-to-br ${TONE_MAP[tone]} p-2 flex flex-col items-center gap-0.5`}
    >
      <Icon className="h-3.5 w-3.5" />
      <div className="text-base font-bold leading-none">{value}</div>
      <div className="text-[10px] font-semibold">{label}</div>
    </div>
  );
}
