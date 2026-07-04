import { FileText, Plus, Archive, ArchiveRestore, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CasesSearch } from "@/lib/cases-view";

export interface CasesToolbarProps {
  view: CasesSearch["view"];
  showArchived: boolean;
  archivedCount: number;
  filteredCount: number;
  onSearch: (patch: Partial<CasesSearch>) => void;
  onOpenPdf: () => void;
  onOpenAdd: () => void;
}

export function CasesToolbar({
  view,
  showArchived,
  archivedCount,
  filteredCount,
  onSearch,
  onOpenPdf,
  onOpenAdd,
}: CasesToolbarProps) {
  return (
    <div className="flex gap-2 items-center flex-wrap justify-end">
      <Button
        size="sm"
        variant="outline"
        className="h-9 gap-1.5 rounded-full border-[#c9a227]/40"
        onClick={onOpenPdf}
        data-testid="cases-pdf-preview-btn"
        aria-label="معاينة وتصدير PDF"
        disabled={filteredCount === 0}
      >
        <FileText className="h-4 w-4" /> معاينة PDF ({filteredCount})
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-9 gap-1.5 rounded-full border-[#c9a227]/40"
        onClick={onOpenAdd}
        data-testid="cases-add-btn"
        aria-label="إضافة قضية يدوياً"
      >
        <Plus className="h-4 w-4" /> إضافة قضية يدوياً
      </Button>
      <Button
        size="sm"
        variant={showArchived ? "default" : "outline"}
        className={`h-9 gap-1.5 rounded-full ${showArchived ? "bg-slate-700 hover:bg-slate-800 text-white" : "border-slate-400/40"}`}
        onClick={() => onSearch({ archived: !showArchived })}
        data-testid="cases-archived-toggle"
        aria-pressed={showArchived}
        aria-label={showArchived ? "الرجوع للقضايا النشطة" : "عرض أرشيف القضايا"}
      >
        {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        {showArchived ? "الرجوع للقضايا النشطة" : `أرشيف القضايا (${archivedCount})`}
      </Button>
      <div className="flex rounded-lg border bg-card p-1" role="group" aria-label="نمط العرض">
        <Button
          data-testid="cases-view-grid-btn"
          size="sm"
          variant={view === "grid" ? "default" : "ghost"}
          onClick={() => onSearch({ view: "grid" })}
          className="h-8 px-3 gap-1"
          aria-pressed={view === "grid"}
          aria-label="عرض بطاقات"
        >
          <LayoutGrid className="h-4 w-4" /> بطاقات
        </Button>
        <Button
          data-testid="cases-view-list-btn"
          size="sm"
          variant={view === "list" ? "default" : "ghost"}
          onClick={() => onSearch({ view: "list" })}
          className="h-8 px-3 gap-1"
          aria-pressed={view === "list"}
          aria-label="عرض قائمة"
        >
          <List className="h-4 w-4" /> قائمة
        </Button>
      </div>
    </div>
  );
}
