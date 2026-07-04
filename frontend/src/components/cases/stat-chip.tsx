import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatChip({
  icon: Icon,
  label,
  value,
  color,
  onClick,
  active,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  color: string;
  onClick?: () => void;
  active?: boolean;
  testId?: string;
}) {
  const inner = (
    <>
      <div className={`h-9 w-9 rounded-lg bg-muted grid place-items-center ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-right">
        <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
        <div className={`text-lg font-black ${color}`}>{value}</div>
      </div>
    </>
  );
  if (onClick) {
    return (
      <Card
        role="button"
        tabIndex={0}
        aria-pressed={active}
        data-testid={testId}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={`border-none shadow-sm p-3 flex items-center gap-3 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          active ? "ring-2 ring-slate-500/60 bg-slate-100/80" : ""
        }`}
      >
        {inner}
      </Card>
    );
  }
  return (
    <Card data-testid={testId} className="border-none shadow-sm p-3 flex items-center gap-3">
      {inner}
    </Card>
  );
}
