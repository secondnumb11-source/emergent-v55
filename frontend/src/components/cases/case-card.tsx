import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Landmark,
  Hash,
  ScrollText,
  CalendarClock,
  Calendar,
  Clock,
  FileText,
  Gavel,
  Copy,
  Eye,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate, type CaseView } from "@/lib/cases-view";

export interface CaseCardProps {
  c: any;
  v: CaseView;
  statusLabel: Record<string, string>;
  statusColors: Record<string, string>;
  transferLabels: Record<string, string>;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void;
  onStatusChange: (val: string) => void;
  onTransfer: (val: string) => void;
  counts: { session: number; memo: number; judgment: number };
}

export function CaseCard({
  c,
  v,
  statusLabel,
  statusColors,
  transferLabels,
  onOpen,
  onDelete,
  onArchive,
  onStatusChange,
  onTransfer,
  counts,
}: CaseCardProps) {
  const isArchived = c.status === "archived";
  return (
    <Card
      data-testid={`case-card-${c.case_number}`}
      className="card-luxe border-none p-0 cursor-pointer relative hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group"
      onClick={onOpen}
    >
      <div className="h-1 bg-gradient-to-l from-[#c9a227] via-[#e8cd6f] to-[#c9a227]" />
      <div className="p-3">
        <div className="flex justify-between items-start mb-2.5 gap-2">
          <div className="flex-1" onClick={(e) => e.stopPropagation()}>
            <Select value={c.status || "open"} onValueChange={onStatusChange}>
              <SelectTrigger
                data-testid={`case-status-select-${c.case_number}`}
                className={`h-7 text-[11px] font-bold border-2 rounded-full px-3 ${statusColors[c.status] || statusColors.open}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabel).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36" onClick={(e) => e.stopPropagation()}>
            <Select value={c.transferred_to || "none"} onValueChange={onTransfer}>
              <SelectTrigger
                data-testid={`case-transfer-select-${c.case_number}`}
                className="h-7 text-[10px] border border-border rounded-full px-3"
              >
                <SelectValue placeholder="نقل إلى..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون نقل —</SelectItem>
                {Object.entries(transferLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2.5 gap-1.5 flex-wrap">
          <span
            data-testid={`case-number-${c.case_number}`}
            className="text-[13px] font-black tracking-wide text-[#7a5a10] px-2 py-0.5 rounded-lg bg-[#fff8e6] inline-flex items-center gap-1.5"
            style={{ textShadow: "0 0 10px rgba(59,130,246,0.55), 0 0 4px rgba(59,130,246,0.35)" }}
          >
            #{v.caseNumber}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard?.writeText(String(v.caseNumber || ""));
                toast.success("تم نسخ رقم القضية");
              }}
              className="opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              aria-label={`نسخ رقم القضية ${v.caseNumber}`}
              title="نسخ رقم القضية"
            >
              <Copy className="h-3 w-3" />
            </button>
          </span>
          {(v.registeredAt || v.caseDate) && (
            <span
              className="text-[11.5px] font-black text-[#7a5a10] px-2 py-0.5 rounded-lg bg-[#fff8e6] inline-flex items-center gap-1"
              style={{
                textShadow: "0 0 10px rgba(59,130,246,0.55), 0 0 4px rgba(59,130,246,0.35)",
              }}
            >
              <CalendarClock className="h-3 w-3" />
              {formatDate(v.registeredAt || v.caseDate)}
            </span>
          )}
        </div>

        {(v.classification || v.typeDetail) && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {v.classification && (
              <Badge
                variant="outline"
                className="text-[10.5px] font-bold bg-blue-50 text-blue-900 border-blue-400/60 max-w-full whitespace-normal break-words text-right leading-snug"
              >
                {v.classification}
              </Badge>
            )}
            {v.typeDetail && v.typeDetail !== v.classification && (
              <Badge
                variant="outline"
                className="text-[10.5px] font-bold bg-indigo-50 text-indigo-900 border-indigo-400/60 max-w-full whitespace-normal break-words text-right leading-snug"
              >
                {v.typeDetail}
              </Badge>
            )}
          </div>
        )}

        <div className="mb-2.5 p-2.5 rounded-xl border border-amber-300/40 bg-gradient-to-l from-amber-50/60 to-transparent">
          <div className="flex items-center gap-2 mb-1.5">
            <Users className="h-3.5 w-3.5 text-[#8a6a1a]" />
            <span className="text-[10.5px] font-black text-[#5a4510]">أطراف الدعوى</span>
          </div>
          {v.plaintiffNames ? (
            <div className="mb-1">
              <span className="text-[10px] font-black text-emerald-800 block">المدعي</span>
              <span className="text-[12.5px] font-extrabold text-emerald-700 leading-snug break-words">
                {v.plaintiffNames}
              </span>
            </div>
          ) : null}
          {v.defendantNames ? (
            <div>
              <span className="text-[10px] font-black text-rose-800 block">المدعى عليه</span>
              <span className="text-[12.5px] font-extrabold text-rose-700 leading-snug break-words">
                {v.defendantNames}
              </span>
            </div>
          ) : null}
          {!v.plaintiffNames && !v.defendantNames && (
            <span className="text-[11px] text-[#7a6a4a]">
              لا توجد بيانات أطراف — شغّل المزامنة المعمقة
            </span>
          )}
        </div>

        {/* موضوع الدعوى يُعرض داخل كارت التفاصيل فقط — لا يظهر على الكارت الخارجي */}

        <div className="mb-2.5 space-y-1 text-[#1a1208]">
          {v.court && (
            <div className="flex items-start gap-1.5">
              <Landmark className="h-3 w-3 text-[#8a6a1a] shrink-0 mt-0.5" />
              <span className="text-[10px] font-bold text-[#5a4510] shrink-0">المحكمة:</span>
              <span className="text-[11px] font-bold break-words leading-snug">{v.court}</span>
            </div>
          )}
          {v.circuit && (
            <div className="flex items-center gap-1.5">
              <Hash className="h-3 w-3 text-[#8a6a1a] shrink-0" />
              <span className="text-[10px] font-bold text-[#5a4510] shrink-0">رقم الدائرة:</span>
              <span className="text-[11px] font-bold">{v.circuit}</span>
            </div>
          )}
          {v.deedNumber && (
            <div className="flex items-center gap-1.5">
              <ScrollText className="h-3 w-3 text-[#8a6a1a] shrink-0" />
              <span className="text-[10px] font-bold text-[#5a4510] shrink-0">صك الحكم:</span>
              <span className="text-[11px] font-bold">{v.deedNumber}</span>
              {v.deedDate && (
                <span className="text-[10px] font-semibold text-[#5a4510]">
                  ({formatDate(v.deedDate)})
                </span>
              )}
            </div>
          )}
        </div>

        {v.nextSession && (
          <div className="mb-3 p-2 bg-blue-50/70 rounded-xl border border-blue-300/50 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-blue-700 shrink-0" />
            <span className="text-[10px] font-black text-blue-800">الجلسة القادمة:</span>
            <span className="text-[11px] font-bold text-blue-900">
              {formatDate(v.nextSession.session_date)}
            </span>
            {v.nextSession.session_time && (
              <span className="text-[10px] font-bold text-blue-700 flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                {v.nextSession.session_time}
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 pt-2.5 border-t-2 border-[#c9a227]/25">
          <div className="text-center">
            <Calendar className="h-3.5 w-3.5 mx-auto text-[#8a6a1a] mb-0.5" />
            <div
              className="text-sm font-black text-[#1f1810]"
              data-testid={`case-sessions-count-${c.case_number}`}
            >
              {counts.session}
            </div>
            <div className="text-[10px] text-[#7a6a4a] font-bold">جلسات</div>
          </div>
          <div className="text-center">
            <FileText className="h-3.5 w-3.5 mx-auto text-[#8a6a1a] mb-0.5" />
            <div
              className="text-sm font-black text-[#1f1810]"
              data-testid={`case-memos-count-${c.case_number}`}
            >
              {counts.memo}
            </div>
            <div className="text-[10px] text-[#7a6a4a] font-bold">مذكرات</div>
          </div>
          <div className="text-center">
            <Gavel className="h-3.5 w-3.5 mx-auto text-[#8a6a1a] mb-0.5" />
            <div
              className="text-sm font-black text-[#1f1810]"
              data-testid={`case-judgments-count-${c.case_number}`}
            >
              {counts.judgment}
            </div>
            <div className="text-[10px] text-[#7a6a4a] font-bold">أحكام</div>
          </div>
        </div>

        <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-border/40">
          <Button
            data-testid={`case-details-btn-${c.case_number}`}
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-[11.5px] font-bold gap-1.5 rounded-full border-[#c9a227]/40 hover:bg-[#c9a227]/10"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
          >
            <Eye className="h-3.5 w-3.5" /> الاطلاع على التفاصيل
          </Button>
          <Button
            size="sm"
            variant="outline"
            title={isArchived ? "استعادة من الأرشيف" : "أرشفة القضية"}
            className={`h-9 w-9 p-0 rounded-full ${isArchived ? "text-slate-800 border-slate-400 hover:bg-slate-100" : "text-slate-700 border-slate-300 hover:bg-slate-50"}`}
            onClick={onArchive}
            data-testid={`case-archive-btn-${c.case_number}`}
          >
            {isArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </Button>
          <Button
            data-testid={`case-delete-btn-${c.case_number}`}
            size="sm"
            variant="outline"
            className="h-9 w-9 p-0 rounded-full text-rose-600 border-rose-200 hover:bg-rose-50"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
