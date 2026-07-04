import { Eye, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, STATUS_COLORS, formatDate, type CaseView } from "@/lib/cases-view";
import { PagerBar } from "./pager-bar";

export interface CasesListItem {
  c: any;
  v: CaseView;
}

export interface CasesListProps {
  items: CasesListItem[];
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  onOpen: (c: any) => void;
  onArchive: (c: any, e: React.MouseEvent) => void;
  onDelete: (caseId: string, e: React.MouseEvent) => void;
}

export function CasesList({
  items,
  page,
  totalPages,
  total,
  onPage,
  onOpen,
  onArchive,
  onDelete,
}: CasesListProps) {
  return (
    <Card className="border-none shadow-sm overflow-hidden" data-testid="cases-list">
      <div className="bg-[#f8f7f4] border-b border-[#e5e2db]">
        <div className="grid grid-cols-[1fr_1fr_1fr_1.2fr_1.2fr_1fr_1fr_0.5fr] gap-2 px-4 py-3 text-[11px] font-black text-[#5a4510]">
          <div>رقم القضية</div>
          <div>تاريخ القيد</div>
          <div>التصنيف</div>
          <div>المدعي</div>
          <div>المدعى عليه</div>
          <div>المحكمة</div>
          <div>الحالة</div>
          <div></div>
        </div>
      </div>
      <div className="divide-y divide-[#f0ede6]">
        {items.map(({ c, v }) => (
          <div
            key={c.id}
            data-testid={`case-row-${c.case_number}`}
            className="grid grid-cols-[1fr_1fr_1fr_1.2fr_1.2fr_1fr_1fr_0.5fr] gap-2 px-4 py-3 items-center hover:bg-[#faf9f6] transition-colors cursor-pointer group focus-within:bg-[#faf9f6]"
            onClick={() => onOpen(c)}
            tabIndex={0}
            role="button"
            aria-label={`فتح تفاصيل القضية رقم ${v.caseNumber}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(c);
              }
            }}
          >
            <div className="text-sm font-bold text-[#8a6a1a]">#{v.caseNumber}</div>
            <div className="text-xs font-semibold text-[#5a4510]">
              {formatDate(v.registeredAt || v.caseDate) || "—"}
            </div>
            <div
              className="text-xs font-semibold text-[#5a4510] truncate"
              title={v.classification || ""}
            >
              {v.classification || "—"}
            </div>
            <div className="text-xs text-emerald-800 font-bold truncate" title={v.plaintiffNames}>
              {v.plaintiffNames || "—"}
            </div>
            <div className="text-xs text-rose-800 font-bold truncate" title={v.defendantNames}>
              {v.defendantNames || "—"}
            </div>
            <div className="text-xs font-semibold text-[#5a4510] truncate" title={v.court || ""}>
              {v.court || "—"}
            </div>
            <div>
              <Badge
                variant="outline"
                className={`text-[10px] font-bold ${STATUS_COLORS[c.status] || STATUS_COLORS.open}`}
              >
                {STATUS_LABEL[c.status] || "مفتوحة"}
              </Badge>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(c);
                }}
                aria-label="عرض التفاصيل"
              >
                <Eye className="h-3.5 w-3.5 text-[#8a6a1a]" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={(e) => onArchive(c, e)}
                aria-label={c.status === "archived" ? "استعادة من الأرشيف" : "أرشفة"}
              >
                {c.status === "archived" ? (
                  <ArchiveRestore className="h-3.5 w-3.5 text-slate-700" />
                ) : (
                  <Archive className="h-3.5 w-3.5 text-slate-600" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={(e) => onDelete(c.id, e)}
                aria-label="حذف"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-[#f8f7f4] border-t border-[#e5e2db] px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-[#5a4510]">{total} نتيجة</span>
      </div>
      <PagerBar page={page} totalPages={totalPages} total={total} onPage={onPage} />
    </Card>
  );
}
