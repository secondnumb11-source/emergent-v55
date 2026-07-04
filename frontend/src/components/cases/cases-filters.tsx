import { Search, Users, ArrowUpDown, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABEL, type CasesSearch } from "@/lib/cases-view";

export interface CasesFiltersProps {
  qNumber: string;
  qParty: string;
  fStatus: string;
  fClassification: string;
  sort: CasesSearch["sort"];
  dir: CasesSearch["dir"];
  pageSize: number;
  classifications: string[];
  filteredCount: number;
  totalCount: number;
  hasFilters: boolean;
  onChange: (patch: Partial<CasesSearch>) => void;
  onClear: () => void;
}

export function CasesFilters({
  qNumber,
  qParty,
  fStatus,
  fClassification,
  sort,
  dir,
  pageSize,
  classifications,
  filteredCount,
  totalCount,
  hasFilters,
  onChange,
  onClear,
}: CasesFiltersProps) {
  return (
    <Card className="border-none shadow-sm mb-4 p-3 bg-card">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <label className="sr-only" htmlFor="q-number">
            بحث برقم القضية
          </label>
          <Input
            id="q-number"
            data-testid="cases-search-input"
            placeholder="بحث برقم القضية..."
            value={qNumber}
            onChange={(e) => onChange({ q: e.target.value })}
            className="h-9 pr-8 text-right"
          />
        </div>
        <div className="relative">
          <Users className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <label className="sr-only" htmlFor="q-party">
            بحث باسم الطرف
          </label>
          <Input
            id="q-party"
            data-testid="cases-search-party"
            placeholder="بحث باسم المدعي أو المدعى عليه..."
            value={qParty}
            onChange={(e) => onChange({ party: e.target.value })}
            className="h-9 pr-8 text-right"
          />
        </div>
        <Select value={fStatus} onValueChange={(v) => onChange({ status: v })}>
          <SelectTrigger
            className="h-9"
            data-testid="cases-filter-status"
            aria-label="فلترة حسب الحالة"
          >
            <SelectValue placeholder="حالة القضية" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">جميع الحالات</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fClassification} onValueChange={(v) => onChange({ classification: v })}>
          <SelectTrigger
            className="h-9"
            data-testid="cases-filter-classification"
            aria-label="فلترة حسب التصنيف"
          >
            <SelectValue placeholder="تصنيف القضية" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">جميع التصنيفات</SelectItem>
            {classifications.map((cl) => (
              <SelectItem key={cl} value={cl}>
                {cl}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-border/40">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#5a4510]">
          <ArrowUpDown className="h-3.5 w-3.5" /> الفرز:
        </div>
        <Select value={sort} onValueChange={(v) => onChange({ sort: v as CasesSearch["sort"] })}>
          <SelectTrigger className="h-8 w-44 text-[11px]" aria-label="حقل الفرز">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="completeness">اكتمال البيانات</SelectItem>
            <SelectItem value="registered">تاريخ القيد</SelectItem>
            <SelectItem value="case_number">رقم القضية</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dir} onValueChange={(v) => onChange({ dir: v as CasesSearch["dir"] })}>
          <SelectTrigger className="h-8 w-28 text-[11px]" aria-label="اتجاه الفرز">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">تنازلي</SelectItem>
            <SelectItem value="asc">تصاعدي</SelectItem>
          </SelectContent>
        </Select>
        <div className="mr-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>لكل صفحة</span>
          <Select value={String(pageSize)} onValueChange={(v) => onChange({ pageSize: Number(v) })}>
            <SelectTrigger className="h-8 w-20 text-[11px]" aria-label="عدد النتائج في الصفحة">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[6, 12, 24, 48].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasFilters && (
        <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
          <Filter className="h-3 w-3" /> عرض {filteredCount} من {totalCount}
          <button
            className="text-[#8a6a1a] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            onClick={onClear}
            aria-label="مسح جميع الفلاتر"
          >
            مسح الفلاتر
          </button>
        </div>
      )}
    </Card>
  );
}
