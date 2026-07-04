import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { Briefcase, Layers, Gavel, Archive, Plus, Filter, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/section-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useList, useUpsert, useDelete } from "@/lib/data-hooks";
import { PdfPreviewDialog, type PdfPreviewRecord } from "@/components/pdf-preview-dialog";

import {
  casesSearchSchema,
  buildCaseView,
  completenessScore,
  STATUS_LABEL,
  STATUS_COLORS,
  TRANSFER_LABELS,
  type CasesSearch,
} from "@/lib/cases-view";
import { extractCaseNumber, looksLikeBlob } from "@/lib/najiz-parse";
import { CasesToolbar } from "@/components/cases/cases-toolbar";
import { CasesFilters } from "@/components/cases/cases-filters";
import { CasesList } from "@/components/cases/cases-list";
import { StatChip } from "@/components/cases/stat-chip";
import { CaseCard } from "@/components/cases/case-card";
import { PagerBar } from "@/components/cases/pager-bar";
import { AddCaseDialog } from "@/components/cases/add-case-dialog";
import { CaseDetailView } from "@/components/cases/case-detail-view";

export const Route = createFileRoute("/_authenticated/app/cases")({
  validateSearch: zodValidator(casesSearchSchema),
  component: CasesPage,
});

function CasesPage() {
  const navigate = useNavigate({ from: "/app/cases" });
  const search = Route.useSearch();
  const {
    q: qNumber,
    party: qParty,
    status: fStatus,
    classification: fClassification,
    archived: showArchived,
    sort,
    dir,
    view,
    page,
    pageSize,
  } = search;
  const setSearch = (patch: Partial<CasesSearch>) =>
    navigate({
      search: (prev: CasesSearch) => ({ ...prev, ...patch, page: patch.page ?? 1 }),
      replace: true,
    });

  const { data: cases = [], isLoading, isError, error, refetch } = useList<any>("cases");
  const { data: clients = [] } = useList<any>("clients");
  const { data: sessions = [] } = useList<any>("sessions");
  const { data: docs = [] } = useList<any>("documents");
  const { data: caseDetails = [] } = useList<any>("case_details");
  const { data: caseParties = [] } = useList<any>("case_parties");
  const { data: caseSessions = [] } = useList<any>("case_sessions_detail");
  const { data: caseJudgments = [] } = useList<any>("case_judgments");
  const { data: lawsuitRequests = [] } = useList<any>("lawsuit_requests");
  const upsert = useUpsert("cases");
  const del = useDelete("cases");

  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const norm = (v: any) => String(v || "").replace(/\s/g, "");
  // Robust matching: detail rows arrive from the bot with GLUED case numbers
  // ("4570242787تصنيفالقضية…") — compare on the extracted numeric part too.
  const cleanNum = (v: any) => extractCaseNumber(v) || norm(v);
  const matchCase = (row: any, c: any) => {
    if (row.case_id && row.case_id === c.id) return true;
    if (!row.case_number) return false;
    const rowNum = cleanNum(row.case_number);
    return (
      rowNum === cleanNum(c.case_number) ||
      rowNum === cleanNum(norm(c.najiz_id).replace(/^case_/, ""))
    );
  };

  const getPartiesForCase = (c: any) => caseParties.filter((p: any) => matchCase(p, c));
  const getSessionsForCase = (c: any) => caseSessions.filter((s: any) => matchCase(s, c));
  const getJudgmentsForCase = (c: any) => caseJudgments.filter((j: any) => matchCase(j, c));
  const getRequestsForCase = (c: any) => lawsuitRequests.filter((r: any) => matchCase(r, c));
  // Several detail rows can exist for one case (clean rows + blob rows pushed
  // by the bot). Merge them field-by-field, preferring clean short values so
  // the card always gets the best available data.
  const getDetailsForCase = (c: any) => {
    const rows = caseDetails.filter((d: any) => matchCase(d, c));
    if (rows.length === 0) return undefined;
    if (rows.length === 1) return rows[0];
    const score = (d: any) =>
      ["case_classification", "case_type_detail", "subject_matter", "court_name", "circuit_number", "case_date"].reduce(
        (n, f) => n + (d[f] ? (looksLikeBlob(String(d[f])) ? 0.25 : 1) : 0),
        0,
      );
    const sorted = [...rows].sort((a: any, b: any) => score(b) - score(a));
    const merged: Record<string, any> = { ...sorted[0] };
    for (const row of sorted.slice(1)) {
      for (const [k, val] of Object.entries(row)) {
        if (merged[k] == null && val != null) merged[k] = val;
      }
    }
    return merged;
  };

  const MANUAL_SESSION_STATUS: Record<string, string> = {
    scheduled: "مجدولة",
    postponed: "مؤجلة",
    held: "منعقدة",
    cancelled: "ملغاة",
  };
  // Manual sessions (جدول الجلسات) mapped to the Najiz detail shape so the case
  // detail dialog shows ALL sessions linked to the case (upcoming & past).
  const getManualSessionsForCase = (c: any) =>
    sessions
      .filter((s: any) => s.case_id === c.id)
      .map((s: any) => ({
        session_status: MANUAL_SESSION_STATUS[s.status] || s.status || null,
        court_name: s.court || null,
        circuit_number: s.room || null,
        session_date: s.session_date || null,
        session_time: s.session_date
          ? new Date(s.session_date).toLocaleTimeString("ar-SA", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : null,
        session_details: s.notes || null,
        __manual: true,
      }));

  // Deep-link: /app/cases?case=<number> — opens the case detail card
  // automatically (used by "تفاصيل القضية" buttons in الطلبات/الأرشيف وغيرها).
  useEffect(() => {
    if (!search.case || cases.length === 0) return;
    const target = cleanNum(search.case);
    const match = cases.find(
      (c: any) =>
        c.id === search.case ||
        cleanNum(c.case_number) === target ||
        cleanNum(norm(c.najiz_id).replace(/^case_/, "")) === target,
    );
    if (match) setSelectedCase(match);
    setSearch({ case: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.case, cases]);

  const handleStatusChange = async (caseId: string, newStatus: string) => {
    const caseData = cases.find((c: any) => c.id === caseId);
    if (caseData) await upsert.mutateAsync({ ...caseData, status: newStatus });
  };
  const handleTransfer = async (caseId: string, section: string) => {
    const caseData = cases.find((c: any) => c.id === caseId);
    if (caseData)
      await upsert.mutateAsync({
        ...caseData,
        transferred_to: section === "none" ? null : section,
      });
  };
  const handleDelete = (caseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("هل أنت متأكد من حذف هذه القضية؟")) del.mutate(caseId);
  };
  const handleArchive = async (c: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const isArchived = c.status === "archived";
    await upsert.mutateAsync({ ...c, status: isArchived ? "open" : "archived" });
    toast.success(isArchived ? "تم استعادة القضية من الأرشيف" : "تمت أرشفة القضية");
  };

  const countFor = (c: any, type: "session" | "memo" | "judgment") => {
    if (type === "session") {
      const detail = getSessionsForCase(c).length;
      return detail || sessions.filter((s: any) => s.case_id === c.id).length;
    }
    if (type === "memo")
      return docs.filter(
        (d: any) =>
          d.case_id === c.id && (d.doc_type === "memorandum_reply" || d.doc_type === "memorandum"),
      ).length;
    const detail = getJudgmentsForCase(c).length;
    return (
      detail ||
      docs.filter(
        (d: any) =>
          d.case_id === c.id &&
          ["judgment_final", "judgment_non_final", "appeal_judgment"].includes(d.doc_type),
      ).length
    );
  };

  const enriched = useMemo(
    () =>
      cases.map((c: any) => {
        const details = getDetailsForCase(c);
        const parties = getPartiesForCase(c);
        const judgments = getJudgmentsForCase(c);
        const cs = getSessionsForCase(c);
        const v = buildCaseView(c, details, parties, cs, judgments);
        return { c, v, score: completenessScore(v), parties, judgments, cs, details };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cases, caseDetails, caseParties, caseSessions, caseJudgments],
  );

  const classifications = useMemo(() => {
    const s = new Set<string>();
    enriched.forEach(({ v }: { v: ReturnType<typeof buildCaseView> }) => {
      if (v.classification) s.add(v.classification);
    });
    return Array.from(s).sort();
  }, [enriched]);

  const filtered = useMemo(() => {
    const numQ = qNumber.trim().toLowerCase();
    const partyQ = qParty.trim().toLowerCase();
    const list = enriched.filter(({ c, v }: any) => {
      const isArchived = c.status === "archived";
      if (showArchived !== isArchived) return false;
      if (
        numQ &&
        !String(v.caseNumber || "")
          .toLowerCase()
          .includes(numQ)
      )
        return false;
      if (partyQ) {
        const hay = `${v.plaintiffNames} ${v.defendantNames}`.toLowerCase();
        if (!hay.includes(partyQ)) return false;
      }
      if (fStatus !== "__all__" && c.status !== fStatus) return false;
      if (fClassification !== "__all__" && v.classification !== fClassification) return false;
      return true;
    });
    const factor = dir === "asc" ? 1 : -1;
    list.sort((a: any, b: any) => {
      if (sort === "case_number") {
        const an = String(a.v.caseNumber || "");
        const bn = String(b.v.caseNumber || "");
        return an.localeCompare(bn, "ar", { numeric: true }) * factor;
      }
      if (sort === "registered") {
        const at = new Date(a.v.registeredAt || a.c.created_at || 0).getTime();
        const bt = new Date(b.v.registeredAt || b.c.created_at || 0).getTime();
        return (at - bt) * factor;
      }
      return (
        (a.score - b.score) * factor ||
        new Date(b.c.created_at || 0).getTime() - new Date(a.c.created_at || 0).getTime()
      );
    });
    return list;
  }, [enriched, qNumber, qParty, fStatus, fClassification, showArchived, sort, dir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  const stats = useMemo(() => {
    const total = cases.length;
    const open = cases.filter((c: any) => c.status === "open").length;
    const archived = cases.filter((c: any) => c.status === "archived").length;
    const closed = cases.filter((c: any) => c.status?.startsWith("closed")).length;
    return { total, open, archived, closed, categories: classifications.length };
  }, [cases, classifications]);

  const hasFilters = !!(
    qNumber ||
    qParty ||
    fStatus !== "__all__" ||
    fClassification !== "__all__"
  );
  const clearFilters = () =>
    setSearch({ q: "", party: "", status: "__all__", classification: "__all__" });

  const fmtDate = (d?: string | null) =>
    d
      ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium" }).format(new Date(d))
      : "";

  const pdfRecords: PdfPreviewRecord[] = useMemo(
    () =>
      filtered.map(({ c, v }: any) => {
        const clientName = clients.find((cl: any) => cl.id === c.client_id)?.name;
        return {
          title: `قضية رقم ${v.caseNumber || "—"}`,
          subtitle: v.title,
          fields: [
            { label: "رقم القضية", value: v.caseNumber },
            { label: "التصنيف", value: v.classification },
            { label: "النوع", value: v.typeDetail },
            { label: "الحالة", value: STATUS_LABEL[c.status] ?? c.status },
            { label: "المحكمة", value: v.court },
            { label: "الدائرة", value: v.circuit },
            { label: "المدعي / الموكل", value: v.plaintiffNames },
            { label: "المدعى عليه", value: v.defendantNames },
            { label: "العميل", value: clientName },
            { label: "تاريخ القيد", value: fmtDate(v.registeredAt) },
            { label: "تاريخ الجلسة القادمة", value: fmtDate(v.nextSession?.session_date) },
          ],
          fileName: `case-${v.caseNumber || c.id}.pdf`,
        };
      }),
    [filtered, clients],
  );

  return (
    <>
      <PageHeader
        icon={Briefcase}
        title="إدارة القضايا"
        subtitle={`${cases.length} قضية · ${stats.categories} تصنيف`}
        action={
          <CasesToolbar
            view={view}
            showArchived={showArchived}
            archivedCount={stats.archived}
            filteredCount={filtered.length}
            onSearch={setSearch}
            onOpenPdf={() => setShowPdfPreview(true)}
            onOpenAdd={() => setShowAdd(true)}
          />
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatChip
          icon={Briefcase}
          label="إجمالي القضايا"
          value={stats.total}
          color="text-[#8a6a1a]"
        />
        <StatChip icon={Layers} label="التصنيفات" value={stats.categories} color="text-blue-800" />
        <StatChip icon={Gavel} label="مفتوحة" value={stats.open} color="text-emerald-700" />
        <StatChip
          icon={Archive}
          label={showArchived ? "عرض القضايا النشطة" : "قسم الأرشفة — اضغط للدخول"}
          value={stats.archived}
          color="text-slate-700"
          active={showArchived}
          onClick={() => setSearch({ archived: !showArchived })}
          testId="cases-archive-statchip"
        />
      </div>

      <CasesFilters
        qNumber={qNumber}
        qParty={qParty}
        fStatus={fStatus}
        fClassification={fClassification}
        sort={sort}
        dir={dir}
        pageSize={pageSize}
        classifications={classifications}
        filteredCount={filtered.length}
        totalCount={cases.length}
        hasFilters={hasFilters}
        onChange={setSearch}
        onClear={clearFilters}
      />

      {isLoading ? (
        <div
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-live="polite"
          aria-busy="true"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="card-luxe border-none p-4 space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-8 w-full" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card className="card-luxe border-none p-10 text-center space-y-3" role="alert">
          <p className="text-sm text-rose-800 font-bold">تعذّر تحميل القضايا</p>
          <p className="text-xs text-muted-foreground">
            {(error as any)?.message || "خطأ غير معروف"}
          </p>
          <Button size="sm" onClick={() => refetch()} className="rounded-full">
            إعادة المحاولة
          </Button>
        </Card>
      ) : cases.length === 0 ? (
        <Card
          className="card-luxe border-none p-10 text-center space-y-3"
          data-testid="cases-empty-state"
        >
          <Briefcase className="h-8 w-8 mx-auto text-[#c9a227]" />
          <p className="text-sm font-bold">لا توجد قضايا حتى الآن</p>
          <p className="text-xs text-muted-foreground">
            قم بمزامنة بيانات ناجز أو أضف قضية يدوياً للبدء
          </p>
          <div className="flex gap-2 justify-center">
            <Button
              size="sm"
              className="rounded-full bg-[#8a6a1a] hover:bg-[#6d5415]"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="h-4 w-4 ml-1" /> إضافة قضية
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => navigate({ to: "/app/najiz" })}
            >
              مزامنة من ناجز
            </Button>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="card-luxe border-none p-10 text-center space-y-3">
          <Filter className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">لا توجد قضايا مطابقة للفلاتر الحالية</p>
          <Button size="sm" variant="outline" className="rounded-full" onClick={clearFilters}>
            مسح الفلاتر
          </Button>
        </Card>
      ) : view === "grid" ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="cases-grid">
            {paged.map(({ c, v }: any) => (
              <CaseCard
                key={c.id}
                c={c}
                v={v}
                statusLabel={STATUS_LABEL}
                statusColors={STATUS_COLORS}
                transferLabels={TRANSFER_LABELS}
                onOpen={() => setSelectedCase(c)}
                onDelete={(e) => handleDelete(c.id, e)}
                onArchive={(e) => handleArchive(c, e)}
                onStatusChange={(val) => handleStatusChange(c.id, val)}
                onTransfer={(val) => handleTransfer(c.id, val)}
                counts={{
                  session: countFor(c, "session"),
                  memo: countFor(c, "memo"),
                  judgment: countFor(c, "judgment"),
                }}
              />
            ))}
          </div>
          <PagerBar
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            onPage={(p) => setSearch({ page: p })}
          />
        </>
      ) : (
        <CasesList
          items={paged}
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          onPage={(p) => setSearch({ page: p })}
          onOpen={(c) => setSelectedCase(c)}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      )}

      <Dialog open={!!selectedCase} onOpenChange={(v) => !v && setSelectedCase(null)}>
        <DialogContent
          className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col"
          dir="rtl"
          data-testid="case-detail-dialog"
          aria-labelledby="case-detail-title"
          aria-describedby="case-detail-desc"
        >
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle id="case-detail-title" className="text-xl font-black text-[#1f1810]">
                <span className="text-[#8a6a1a]">
                  #{extractCaseNumber(selectedCase?.case_number) || selectedCase?.case_number}
                </span>{" "}
                تفاصيل القضية
              </DialogTitle>
              <Button
                data-testid="case-detail-close-btn"
                variant="ghost"
                size="icon"
                onClick={() => setSelectedCase(null)}
                aria-label="إغلاق النافذة"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <DialogDescription id="case-detail-desc" className="sr-only">
              تفاصيل شاملة للقضية تشمل الأطراف والجلسات والأحكام والطلبات
            </DialogDescription>
          </DialogHeader>
          {selectedCase && (
            <CaseDetailView
              caseData={cases.find((c: any) => c.id === selectedCase.id) || selectedCase}
              details={getDetailsForCase(selectedCase)}
              parties={getPartiesForCase(selectedCase)}
              sessions={[
                ...getSessionsForCase(selectedCase),
                ...getManualSessionsForCase(selectedCase),
              ]}
              judgments={getJudgmentsForCase(selectedCase)}
              requests={getRequestsForCase(selectedCase)}
              onSave={(row: Record<string, unknown>) => upsert.mutateAsync(row)}
              onNavigateDocs={() => {
                const cn = extractCaseNumber(selectedCase.case_number) || selectedCase.case_number;
                setSelectedCase(null);
                navigate({ to: "/app/archive", search: { case: cn } as any });
              }}
              onNavigateSessions={() => {
                const cn = extractCaseNumber(selectedCase.case_number) || selectedCase.case_number;
                setSelectedCase(null);
                navigate({ to: "/app/sessions", search: { case: cn } as any });
              }}
              onNavigateRequests={() => {
                const cn = extractCaseNumber(selectedCase.case_number) || selectedCase.case_number;
                setSelectedCase(null);
                navigate({ to: "/app/lawsuit-requests", search: { case: cn } as any });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AddCaseDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        clients={clients}
        onCreate={async (payload) => {
          await upsert.mutateAsync(payload);
          toast.success("تم إضافة القضية");
        }}
      />

      <PdfPreviewDialog
        open={showPdfPreview}
        onOpenChange={setShowPdfPreview}
        records={pdfRecords}
        bundleName={`cases-${new Date().toISOString().slice(0, 10)}`}
        headline="معاينة تصدير القضايا"
      />
    </>
  );
}
