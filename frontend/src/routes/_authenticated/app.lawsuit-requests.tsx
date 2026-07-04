import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  FileText,
  Eye,
  Scale,
  Hash,
  Calendar,
  User,
  Gavel,
  X as XClear,
  X,
  Search,
  Filter,
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { PageHeader } from "@/components/section-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useList, useUpsert, useDelete } from "@/lib/data-hooks";

const searchSchema = z.object({
  case: fallback(z.string(), "").default(""),
  type: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/app/lawsuit-requests")({
  validateSearch: zodValidator(searchSchema),
  component: LawsuitRequestsPage,
});

type LawsuitRequest = {
  id: string;
  case_number: string | null;
  request_number: string | null;
  request_type: string | null;
  request_date: string | null;
  request_status: string | null;
  court_name: string | null;
  circuit_number: string | null;
  case_status: string | null;
  case_date: string | null;
  case_classification: string | null;
  case_type_detail: string | null;
  applicant_name: string | null;
  applicant_type: string | null;
  judgment_number: string | null;
  submissions: string | null;
  request_reasons: string | null;
  document_type: string | null;
  reason_1: string | null;
  reason_2: string | null;
  reason_3: string | null;
  reason_4: string | null;
  reason_5: string | null;
  reason_6: string | null;
};

type CaseRow = { id: string; case_number: string; title?: string };

const REQUEST_TYPES = [
  "طلب إدخال",
  "طلب إيداع مذكرة",
  "طلب الاعتراض على حكم",
  "طلب استئناف",
  "طلب تدخل",
  "طلب رد",
  "طلب تأجيل",
  "طلب إثبات",
  "طلب أخرى",
];

const DOCUMENT_TYPES = [
  "صحيفة دعوى",
  "مذكرة جوابية",
  "مذكرة اعتراض",
  "مستند إثبات",
  "محضر ضبط جلسة",
  "أخرى",
];

// Dedupe on the logical key
function dedupe(list: LawsuitRequest[]): LawsuitRequest[] {
  const map = new Map<string, LawsuitRequest>();
  for (const r of list) {
    const key = `${(r.case_number || "").trim()}|${(r.request_number || "").trim()}|${(r.request_type || "").trim()}`;
    if (!map.has(key)) map.set(key, r);
  }
  return Array.from(map.values());
}

// Rich requests come first
function completeness(r: LawsuitRequest): number {
  let n = 0;
  const fields = [
    r.case_number,
    r.request_number,
    r.request_type,
    r.request_date,
    r.court_name,
    r.circuit_number,
    r.applicant_name,
    r.request_status,
    r.case_status,
    r.submissions,
    r.request_reasons,
  ];
  fields.forEach((v) => {
    if (v && String(v).trim()) n++;
  });
  return n;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

function LawsuitRequestsPage() {
  const navigate = useNavigate({ from: "/app/lawsuit-requests" });
  const { case: caseFilter, type: typeFilter, q: qFilter } = Route.useSearch();
  const { data: rawRequests = [], isLoading } = useList<LawsuitRequest>("lawsuit_requests");
  const { data: cases = [] } = useList<CaseRow>("cases");
  const upsert = useUpsert("lawsuit_requests");
  const del = useDelete("lawsuit_requests");

  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<LawsuitRequest | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LawsuitRequest | null>(null);
  const [search, setSearch] = useState(qFilter || "");

  useEffect(() => {
    setSearch(qFilter || "");
  }, [qFilter]);

  const requests = useMemo(() => dedupe(rawRequests), [rawRequests]);

  // Case numbers list (only)
  const caseNumbers = useMemo(() => {
    const set = new Set<string>();
    requests.forEach((r) => {
      if (r.case_number) set.add(String(r.case_number));
    });
    return Array.from(set).sort();
  }, [requests]);

  const requestTypes = useMemo(() => {
    const set = new Set<string>();
    requests.forEach((r) => {
      if (r.request_type) set.add(r.request_type);
    });
    return Array.from(set).sort();
  }, [requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (caseFilter && String(r.case_number || "").trim() !== String(caseFilter).trim())
        return false;
      if (typeFilter && r.request_type !== typeFilter) return false;
      if (q) {
        const hay =
          `${r.case_number ?? ""} ${r.request_number ?? ""} ${r.request_type ?? ""} ${r.court_name ?? ""} ${r.applicant_name ?? ""} ${r.request_status ?? ""} ${r.case_status ?? ""} ${r.submissions ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requests, caseFilter, typeFilter, search]);

  // Group by case_number
  const grouped = useMemo(() => {
    const map = new Map<string, LawsuitRequest[]>();
    for (const r of filtered) {
      const key = r.case_number || "غير محدد";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const arr = Array.from(map.entries()).map(([caseNumber, items]) => ({
      caseNumber,
      items,
      completeness: Math.max(...items.map(completeness)),
      types: Array.from(new Set(items.map((i) => i.request_type).filter(Boolean))) as string[],
      shared: items[0], // used for case-level fields
    }));
    // sort: richer data first
    arr.sort((a, b) => b.completeness - a.completeness);
    return arr;
  }, [filtered]);

  // Stats
  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const caseSet = new Set<string>();
    for (const r of requests) {
      if (r.case_number) caseSet.add(r.case_number);
      const t = r.request_type || "بدون نوع";
      byType[t] = (byType[t] || 0) + 1;
      const s = r.request_status || "بدون حالة";
      byStatus[s] = (byStatus[s] || 0) + 1;
    }
    return { total: requests.length, cases: caseSet.size, byType, byStatus };
  }, [requests]);

  const updateSearch = (patch: Record<string, string>) => {
    navigate({
      search: (prev: any) => {
        const next = { ...prev, ...patch };
        Object.keys(next).forEach((k) => {
          if (!next[k]) delete next[k];
        });
        return next;
      },
    });
  };

  const clearFilters = () => navigate({ search: {} as any });
  const hasFilters = !!(caseFilter || typeFilter || search);

  const goToCase = (caseNumber: string) => {
    navigate({ to: "/app/cases", search: { case: caseNumber } as any });
  };

  const handleDeleteRequest = (r: LawsuitRequest) => {
    if (confirm(`حذف الطلب ${r.request_number || "بدون رقم"} من القضية #${r.case_number}؟`)) {
      del.mutate(r.id);
      setSelectedRequest(null);
    }
  };

  return (
    <>
      <PageHeader
        icon={FileText}
        title="الطلبات على القضايا"
        subtitle={`${grouped.length} قضية · ${filtered.length} طلب${hasFilters ? ` من أصل ${requests.length}` : ""}`}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="h-4 w-4" /> طلب جديد
          </Button>
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
        <StatTile label="القضايا" value={stats.cases} color="from-purple-500 to-fuchsia-500" />
        <StatTile
          label="إجمالي الطلبات"
          value={stats.total}
          color="from-indigo-500 to-purple-500"
        />
        {Object.entries(stats.byType)
          .slice(0, 4)
          .map(([t, n]) => (
            <StatTile key={t} label={t} value={n} color="from-emerald-500 to-teal-500" small />
          ))}
      </div>

      {/* Filters */}
      <Card className="p-3 mb-4 bg-card border">
        <div className="grid gap-2 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث برقم القضية، الطلب، النوع، المحكمة، مقدم الطلب..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => updateSearch({ q: search })}
              onKeyDown={(e) => {
                if (e.key === "Enter") updateSearch({ q: search });
              }}
              className="text-right pr-9 h-10"
            />
          </div>
          <Select
            value={caseFilter || "__all__"}
            onValueChange={(v) => updateSearch({ case: v === "__all__" ? "" : v })}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="كل القضايا" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">كل القضايا</SelectItem>
              {caseNumbers.map((n) => (
                <SelectItem key={n} value={n}>
                  قضية #{n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={typeFilter || "__all__"}
            onValueChange={(v) => updateSearch({ type: v === "__all__" ? "" : v })}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="كل الأنواع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">كل الأنواع</SelectItem>
              {requestTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <div className="mt-2 flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-purple-600" />
            <span className="text-xs text-muted-foreground">فلاتر نشطة</span>
            <Button size="sm" variant="ghost" className="h-7 gap-1 mr-auto" onClick={clearFilters}>
              <XClear className="h-3.5 w-3.5" /> مسح الفلاتر
            </Button>
          </div>
        )}
      </Card>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-10" aria-live="polite">
          جارٍ التحميل...
        </p>
      ) : requests.length === 0 ? (
        <Card className="p-10 text-center border-2 border-dashed">
          <p className="text-sm text-muted-foreground">
            لا توجد طلبات على القضايا — قم بمزامنة بيانات ناجز أو أضف طلباً يدوياً
          </p>
        </Card>
      ) : grouped.length === 0 ? (
        <Card className="p-10 text-center border-2 border-dashed space-y-2">
          <p className="text-sm text-muted-foreground">لا توجد نتائج مطابقة</p>
          <Button size="sm" variant="outline" onClick={clearFilters}>
            مسح الفلاتر
          </Button>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {grouped.map((g) => (
            <GroupCard
              key={g.caseNumber}
              group={g}
              onOpenGroup={() => setSelectedGroup(g)}
              onOpenRequest={(r) => setSelectedRequest(r)}
              onDeleteRequest={handleDeleteRequest}
              onGoCase={() => goToCase(g.caseNumber)}
              onEditRequest={(r) => {
                setEditing(r);
                setFormOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Group dialog — shows ALL requests for this case */}
      <Dialog open={!!selectedGroup} onOpenChange={(v) => !v && setSelectedGroup(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-black">
                جميع الطلبات على القضية{" "}
                <span className="text-purple-700">#{selectedGroup?.caseNumber}</span>
                <span className="mr-2 text-sm text-muted-foreground font-normal">
                  ({selectedGroup?.items.length} طلب)
                </span>
              </DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setSelectedGroup(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </DialogHeader>
          {selectedGroup && (
            <ScrollArea className="flex-1 -mx-2">
              <div className="px-2 grid gap-4 md:grid-cols-2">
                {selectedGroup.items.map((r: LawsuitRequest) => (
                  <RequestMiniCard
                    key={r.id}
                    request={r}
                    onOpen={() => {
                      setSelectedGroup(null);
                      setSelectedRequest(r);
                    }}
                    onDelete={() => handleDeleteRequest(r)}
                    onEdit={() => {
                      setSelectedGroup(null);
                      setEditing(r);
                      setFormOpen(true);
                    }}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Single request detail dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(v) => !v && setSelectedRequest(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-black">
                <span className="text-purple-700">تفاصيل الطلب</span>
                {selectedRequest?.request_number && (
                  <span className="mr-2">#{selectedRequest.request_number}</span>
                )}
              </DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setSelectedRequest(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </DialogHeader>
          {selectedRequest && (
            <ScrollArea className="flex-1 -mx-2">
              <div className="px-2 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <InfoField label="رقم الطلب" value={selectedRequest.request_number} />
                  <InfoField label="تاريخ الطلب" value={formatDate(selectedRequest.request_date)} />
                  <InfoField label="حالة الطلب" value={selectedRequest.request_status} />
                  <InfoField label="نوع الطلب" value={selectedRequest.request_type} />
                  <InfoField label="رقم القضية" value={selectedRequest.case_number} />
                  <InfoField label="تاريخ القضية" value={formatDate(selectedRequest.case_date)} />
                  <InfoField label="المحكمة" value={selectedRequest.court_name} />
                  <InfoField label="الدائرة" value={selectedRequest.circuit_number} />
                  <InfoField label="حالة القضية" value={selectedRequest.case_status} />
                  <InfoField label="تصنيف القضية" value={selectedRequest.case_classification} />
                  <InfoField label="نوع القضية" value={selectedRequest.case_type_detail} />
                  <InfoField label="مقدم الطلب" value={selectedRequest.applicant_name} />
                  <InfoField label="نوع مقدم الطلب" value={selectedRequest.applicant_type} />
                  <InfoField label="رقم الحكم" value={selectedRequest.judgment_number} />
                </div>

                {selectedRequest.submissions && (
                  <LongText label="التسبيبات" value={selectedRequest.submissions} />
                )}
                {selectedRequest.request_reasons && (
                  <LongText label="أسباب الطلب" value={selectedRequest.request_reasons} />
                )}
                {[1, 2, 3, 4, 5, 6].map((n) => {
                  const reason = (selectedRequest as any)[`reason_${n}`];
                  if (!reason) return null;
                  const labels = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];
                  return (
                    <div key={n}>
                      <span className="text-xs font-bold text-purple-700 block mb-1">
                        السبب {labels[n - 1]}
                      </span>
                      <div className="p-3 bg-purple-50/60 dark:bg-purple-900/20 rounded-lg text-sm leading-relaxed border border-purple-200/40">
                        {reason}
                      </div>
                    </div>
                  );
                })}

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() =>
                      selectedRequest.case_number && goToCase(selectedRequest.case_number)
                    }
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> تفاصيل القضية
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => {
                      setEditing(selectedRequest);
                      setSelectedRequest(null);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1 mr-auto"
                    onClick={() => handleDeleteRequest(selectedRequest)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> حذف الطلب
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Add / edit form */}
      <RequestFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        cases={cases}
        loading={upsert.isPending}
        onSubmit={async (payload) => {
          await upsert.mutateAsync({ ...payload, id: editing?.id });
          setFormOpen(false);
        }}
      />
    </>
  );
}

function GroupCard({
  group,
  onOpenGroup,
  onOpenRequest,
  onDeleteRequest,
  onGoCase,
  onEditRequest,
}: {
  group: { caseNumber: string; items: LawsuitRequest[]; types: string[]; shared: LawsuitRequest };
  onOpenGroup: () => void;
  onOpenRequest: (r: LawsuitRequest) => void;
  onDeleteRequest: (r: LawsuitRequest) => void;
  onGoCase: () => void;
  onEditRequest: (r: LawsuitRequest) => void;
}) {
  const [pickedId, setPickedId] = useState<string>("__all__");
  const picked = group.items.find((i) => i.id === pickedId) || null;
  const shared = group.shared;

  return (
    <Card className="border-none p-0 overflow-hidden shadow-md hover:shadow-xl transition-shadow bg-card">
      <div className="h-2 bg-gradient-to-l from-purple-600 via-fuchsia-500 to-purple-600" />
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              قضية
            </div>
            <h3 className="font-black text-lg text-foreground">#{group.caseNumber}</h3>
          </div>
          <Badge className="bg-purple-600 text-white font-bold">{group.items.length} طلب</Badge>
        </div>

        {/* Case shared fields */}
        <div className="space-y-1.5 text-[13px]">
          {shared.court_name && (
            <ShareLine icon={Scale} label="المحكمة" value={shared.court_name} />
          )}
          {shared.circuit_number && (
            <ShareLine icon={Hash} label="الدائرة" value={shared.circuit_number} />
          )}
          {shared.case_status && (
            <ShareLine icon={Gavel} label="حالة القضية" value={shared.case_status} />
          )}
          {shared.case_classification && (
            <ShareLine icon={FileText} label="التصنيف" value={shared.case_classification} />
          )}
        </div>

        {/* Types badges */}
        {group.types.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {group.types.map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="text-[10px] font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200 border-purple-300"
              >
                {t}
              </Badge>
            ))}
          </div>
        )}

        {/* Selector */}
        <div className="pt-2 border-t space-y-2">
          <Label className="text-[11px] font-bold text-muted-foreground">اعرض طلباً</Label>
          <Select value={pickedId} onValueChange={setPickedId}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">عرض الكل ({group.items.length})</SelectItem>
              {group.items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.request_type || "طلب"} — {i.request_number || "بدون رقم"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {picked ? (
            <RequestMiniCard
              request={picked}
              onOpen={() => onOpenRequest(picked)}
              onDelete={() => onDeleteRequest(picked)}
              onEdit={() => onEditRequest(picked)}
              compact
            />
          ) : (
            <Button size="sm" variant="outline" className="w-full h-9 gap-1" onClick={onOpenGroup}>
              <ChevronDown className="h-3.5 w-3.5" /> عرض كل الطلبات ({group.items.length})
            </Button>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs gap-1"
            onClick={onGoCase}
          >
            <ExternalLink className="h-3 w-3" /> تفاصيل القضية
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RequestMiniCard({
  request,
  onOpen,
  onDelete,
  onEdit,
  compact,
}: {
  request: LawsuitRequest;
  onOpen: () => void;
  onDelete: () => void;
  onEdit: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-gradient-to-br from-amber-50/40 to-transparent dark:from-amber-900/10 dark:to-transparent p-3 ${compact ? "" : "shadow-sm"}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge
          variant="outline"
          className="text-[10px] font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200 border-purple-300"
        >
          {request.request_type || "طلب"}
        </Badge>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="h-6 w-6 grid place-items-center rounded border border-border hover:bg-muted transition"
            title="تعديل"
            aria-label="تعديل الطلب"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={onDelete}
            className="h-6 w-6 grid place-items-center rounded border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive transition"
            title="حذف"
            aria-label="حذف الطلب"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="space-y-1 text-[12px] text-foreground">
        {request.request_number && (
          <MiniLine label="رقم الطلب" value={request.request_number} strong />
        )}
        {request.request_date && (
          <MiniLine label="التاريخ" value={formatDate(request.request_date)} />
        )}
        {request.applicant_name && <MiniLine label="مقدم الطلب" value={request.applicant_name} />}
        {request.request_status && <MiniLine label="الحالة" value={request.request_status} />}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full h-7 text-[11px] mt-2 gap-1"
        onClick={onOpen}
      >
        <Eye className="h-3 w-3" /> التفاصيل
      </Button>
    </div>
  );
}

function ShareLine({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <Icon className="h-3 w-3 text-purple-600 shrink-0" />
      <span className="text-[11px] font-bold text-muted-foreground shrink-0">{label}:</span>
      <span className="truncate font-semibold text-foreground text-[12.5px]" title={String(value)}>
        {value}
      </span>
    </div>
  );
}

function MiniLine({ label, value, strong }: { label: string; value: any; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5 truncate">
      <span className="shrink-0 text-[10.5px] font-bold text-muted-foreground">{label}:</span>
      <span
        className={`truncate ${strong ? "font-extrabold text-foreground" : "font-semibold text-foreground/90"}`}
        title={String(value)}
      >
        {value}
      </span>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: any }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-[10px] font-bold text-muted-foreground block">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function LongText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-bold text-muted-foreground block mb-1">{label}</span>
      <div className="p-3 bg-muted/40 rounded-lg text-sm leading-relaxed whitespace-pre-wrap">
        {value}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  color,
  small,
}: {
  label: string;
  value: number;
  color: string;
  small?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 bg-gradient-to-br ${color} text-white shadow-md`}>
      <div
        className={`${small ? "text-[10px]" : "text-[11px]"} font-bold opacity-90 truncate`}
        title={label}
      >
        {label}
      </div>
      <div className={`${small ? "text-lg" : "text-2xl"} font-black leading-tight mt-1`}>
        {value}
      </div>
    </div>
  );
}

function RequestFormDialog({
  open,
  onOpenChange,
  editing,
  cases,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: LawsuitRequest | null;
  cases: CaseRow[];
  loading: boolean;
  onSubmit: (payload: Record<string, any>) => Promise<void>;
}) {
  const [v, setV] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!open) return;
    setV({
      case_number: editing?.case_number ?? "",
      request_number: editing?.request_number ?? "",
      request_type: editing?.request_type ?? "",
      document_type: editing?.document_type ?? "",
      request_date: editing?.request_date ?? "",
      request_status: editing?.request_status ?? "",
      court_name: editing?.court_name ?? "",
      circuit_number: editing?.circuit_number ?? "",
      applicant_name: editing?.applicant_name ?? "",
      submissions: editing?.submissions ?? "",
      request_reasons: editing?.request_reasons ?? "",
    });
  }, [open, editing]);

  const set = (k: string, val: any) => setV((p) => ({ ...p, [k]: val }));

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.case_number || !v.request_type) return;
    const payload: Record<string, any> = { ...v };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null;
    });
    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-xl">
            {editing ? "تعديل الطلب" : "طلب جديد"}
          </DialogTitle>
          <DialogDescription className="text-right text-xs">
            أدخل بيانات الطلب واختر القضية المرتبطة.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handle} className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          <div className="md:col-span-2">
            <Label className="text-xs font-semibold mb-1.5 block">القضية المرتبطة *</Label>
            <Select value={v.case_number || ""} onValueChange={(val) => set("case_number", val)}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="اختر رقم القضية" />
              </SelectTrigger>
              <SelectContent>
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.case_number}>
                    #{c.case_number}
                    {c.title ? ` — ${c.title}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold mb-1.5 block">نوع الطلب *</Label>
            <Select value={v.request_type || ""} onValueChange={(val) => set("request_type", val)}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="اختر النوع" />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold mb-1.5 block">نوع المستند</Label>
            <Select
              value={v.document_type || ""}
              onValueChange={(val) => set("document_type", val)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="اختر نوع المستند" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TextField
            label="رقم الطلب"
            value={v.request_number}
            onChange={(x) => set("request_number", x)}
          />
          <TextField
            label="تاريخ الطلب"
            type="date"
            value={v.request_date}
            onChange={(x) => set("request_date", x)}
          />
          <TextField
            label="حالة الطلب"
            value={v.request_status}
            onChange={(x) => set("request_status", x)}
          />
          <TextField label="المحكمة" value={v.court_name} onChange={(x) => set("court_name", x)} />
          <TextField
            label="رقم الدائرة"
            value={v.circuit_number}
            onChange={(x) => set("circuit_number", x)}
          />
          <TextField
            label="مقدم الطلب"
            value={v.applicant_name}
            onChange={(x) => set("applicant_name", x)}
          />

          <div className="md:col-span-2">
            <Label className="text-xs font-semibold mb-1.5 block">التسبيبات</Label>
            <Textarea
              value={v.submissions ?? ""}
              onChange={(e) => set("submissions", e.target.value)}
              className="text-right min-h-[70px]"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs font-semibold mb-1.5 block">أسباب الطلب</Label>
            <Textarea
              value={v.request_reasons ?? ""}
              onChange={(e) => set("request_reasons", e.target.value)}
              className="text-right min-h-[70px]"
            />
          </div>

          <DialogFooter className="md:col-span-2 gap-2 mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null} حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs font-semibold mb-1.5 block">{label}</Label>
      <Input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="text-right h-10"
      />
    </div>
  );
}
