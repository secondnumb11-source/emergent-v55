import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PagerBar({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const canPrev = page > 1;
  const canNext = page < totalPages;
  return (
    <nav aria-label="ترقيم الصفحات" className="mt-4 flex items-center justify-between gap-2 px-2">
      <span className="text-[11px] text-muted-foreground">
        صفحة <b className="text-[#5a4510]">{page}</b> من{" "}
        <b className="text-[#5a4510]">{totalPages}</b> · إجمالي {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 rounded-full"
          onClick={() => onPage(1)}
          disabled={!canPrev}
          aria-label="أول صفحة"
        >
          «
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 rounded-full"
          onClick={() => onPage(page - 1)}
          disabled={!canPrev}
          aria-label="الصفحة السابقة"
        >
          <ChevronRight className="h-3.5 w-3.5" /> السابق
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 rounded-full"
          onClick={() => onPage(page + 1)}
          disabled={!canNext}
          aria-label="الصفحة التالية"
        >
          التالي <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 rounded-full"
          onClick={() => onPage(totalPages)}
          disabled={!canNext}
          aria-label="آخر صفحة"
        >
          »
        </Button>
      </div>
    </nav>
  );
}
