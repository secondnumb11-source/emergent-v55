import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ScrollText,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Printer,
  CalendarClock,
  User,
  ShieldCheck,
  FileSignature,
  Trash2,
  Pencil,
  Network,
  Plus,
  X,
  Eye,
  BookOpen,
  Building2,
  FileText,
  Scale,
} from "lucide-react";
import { PageHeader } from "@/components/section-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useList, useUpsert, useDelete } from "@/lib/data-hooks";
import { useRealtimeTable } from "@/lib/realtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { exportRecordPdf, exportRecordsBundle } from "@/lib/pdf-export";
import { useExpiryWarnDays, EXPIRY_WARN_OPTIONS } from "@/lib/expiry-window";
import { parsePowerRow, cleanNajizTitle } from "@/lib/najiz-display";

export const Route = createFileRoute("/_authenticated/app/powers")({
  component: PowersPage,
});

type ClientRow = { id: string; full_name: string };
type CaseRow = { id: string; case_number: string; title: string; client_id?: string | null };
type PowerRow = {
  id: string;
  wakalah_number: string;
  issuer_name: string | null;
  agent_name: string | null;
  issuer_id_number: string | null;
  agent_id_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  scope: string | null;
  client_id: string | null;
  najiz_id: string | null;
  najiz_synced_at: string | null;
  status: string;
  notes: string | null;
  issuer_entity: string | null;
  usage_method: string | null;
  issuer_capacity: string | null;
  issuer_nationality: string | null;
  issuer_identity_type: string | null;
  issuer_status_in_agency: string | null;
  agent_capacity: string | null;
  agent_nationality: string | null;
  agent_identity_type: string | null;
  agent_status_in_agency: string | null;
  agency_clauses: string | null;
  agency_text: string | null;
  agency_data: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  active: "سارية",
  expired: "منتهية",
  revoked: "ملغاة",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  expired: "bg-gray-500/15 text-gray-700 border-gray-500/30",
  revoked: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

const daysLeft = (d?: string | null) => {
  if (!d) return null;
  const t = new Date(d).getTime();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((t - now.getTime()) / 86_400_000);
};
const makeExpiryClass =
  (warnDays: number) =>
  (d?: string | null): { className: string; level: "ok" | "warn" | "danger" | "expired" } => {
    const dl = daysLeft(d);
    if (dl == null) return { className: "", level: "ok" };
    if (dl < 0) return { className: "expiry-pulse", level: "expired" };
    if (dl <= warnDays) return { className: "expiry-pulse", level: "danger" };
    return { className: "", level: "ok" };
  };

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return dateStr;
  }
};

function PowersPage() {
  useRealtimeTable("powers_of_attorney", ["powers_of_attorney"]);
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useList<PowerRow>("powers_of_attorney");
  const { data: clients = [] } = useList<ClientRow>("clients");
  const { data: cases = [] } = useList<CaseRow>("cases");
  const upsert = useUpsert("powers_of_attorney");
  const del = useDelete("powers_of_attorney");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PowerRow | null>(null);
  const [warnDays, setWarnDays] = useExpiryWarnDays();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bundleBusy, setBundleBusy] = useState<"" | "combined" | "zip">("");
  const [selectedPower, setSelectedPower] = useState<PowerRow | null>(null);
  const expiryClass = useMemo(() => makeExpiryClass(warnDays), [warnDays]);

  const expiringCount = useMemo(
    () =>
      rows.filter((r) => {
        const dl = daysLeft(r.expiry_date);
        return dl != null && dl >= 0 && dl <= warnDays;
      }).length,
    [rows, warnDays],
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const exportSelected = async (mode: "combined" | "zip") => {
    const items = rows.filter((r) => selected.has(r.id));
    if (items.length === 0) return;
    setBundleBusy(mode);
    try {
      await exportRecordsBundle({
        mode,
        bundleName: `wakalat-${new Date().toISOString().slice(0, 10)}`,
        records: items.map((row) => {
          const clientName = clients.find((c) => c.id === row.client_id)?.full_name;
          return {
            title: `وكالة قضائية رقم ${row.wakalah_number}`,
            subtitle: clientName ? `العميل: ${clientName}` : undefined,
            fileName: `wakalah-${row.wakalah_number}.pdf`,
            fields: [
              { label: "رقم الوكالة", value: row.wakalah_number },
              { label: "اسم المُصدر", value: row.issuer_name },
              { label: "صفته", value: row.issuer_capacity },
              { label: "جنسيته", value: row.issuer_nationality },
              { label: "نوع هويته", value: row.issuer_identity_type },
              { label: "رقم هويته", value: row.issuer_id_number },
              { label: "حالته في الوكالة", value: row.issuer_status_in_agency },
              { label: "اسم الوكيل", value: row.agent_name },
              { label: "صفته", value: row.agent_capacity },
              { label: "جنسيته", value: row.agent_nationality },
              { label: "نوع هويته", value: row.agent_identity_type },
              { label: "رقم هويته", value: row.agent_id_number },
              { label: "حالته في الوكالة", value: row.agent_status_in_agency },
              { label: "جهة الإصدار", value: row.issuer_entity },
              { label: "كيفية الاستخدام", value: row.usage_method },
              { label: "العميل المرتبط", value: clientName },
              { label: "تاريخ الإصدار", value: row.issue_date },
              { label: "تاريخ الانتهاء", value: row.expiry_date },
              { label: "الحالة", value: row.status },
              { label: "نطاق / موضوع الوكالة", value: row.scope },
              { label: "بنود الوكالة", value: row.agency_clauses },
              { label: "نص الوكالة", value: row.agency_text },
              { label: "بيانات الوكالة", value: row.agency_data },
              { label: "ملاحظات", value: row.notes },
            ],
          };
        }),
      });
      toast.success(`تم تصدير ${items.length} وكالة`);
      clearSelection();
    } catch (e: any) {
      toast.error(e?.message || "فشل التصدير");
    } finally {
      setBundleBusy("");
    }
  };

  const sync = useMutation({
    mutationFn: async () => {
      const { data: logs } = await supabase
        .from("najiz_sync_logs")
        .select("created_at, items_count, source, status")
        .like("source", "extension:powers%")
        .order("created_at", { ascending: false })
        .limit(1);
      return logs?.[0] || null;
    },
    onSuccess: (log) => {
      qc.invalidateQueries({ queryKey: ["powers_of_attorney"] });
      if (log) {
        const when = new Date(log.created_at).toLocaleString("ar-SA-u-ca-gregory", {
          dateStyle: "medium",
          timeStyle: "short",
        });
        toast.success(`تمت المزامنة — آخر دفعة من ناجز: ${log.items_count ?? 0} عنصر · ${when}`);
      } else {
        toast.message("تم تحديث البيانات — في انتظار أول دفعة من أداة ناجز");
      }
    },
    onError: (e: any) => toast.error(e.message || "فشل المزامنة"),
  });

  return (
    <>
      <PageHeader
        icon={ScrollText}
        title="الوكالات القضائية"
        subtitle={`${rows.length} وكالة · ${expiringCount} توشك على الانتهاء`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-white/70">
              نافذة التنبيه:
              <select
                value={warnDays}
                onChange={(e) => setWarnDays(Number(e.target.value))}
                className="h-8 rounded-md border bg-background px-2 text-xs"
                title="عدد الأيام قبل الانتهاء التي يظهر فيها التنبيه"
              >
                {EXPIRY_WARN_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} يوم
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              variant="outline"
              className="gap-2"
            >
              {sync.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              مزامنة مع ناجز
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              className="btn-gold gap-2"
            >
              <Plus className="h-4 w-4" /> إضافة وكالة
            </Button>
          </div>
        }
      />

      {selected.size > 0 && (
        <div className="card-luxe mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="text-sm text-white/80">{selected.size} عنصر محدد</div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportSelected("combined")}
              disabled={!!bundleBusy}
            >
              {bundleBusy === "combined" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}
              <span className="mx-1">تصدير PDF مجمّع</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportSelected("zip")}
              disabled={!!bundleBusy}
            >
              {bundleBusy === "zip" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Printer className="h-3.5 w-3.5" />
              )}
              <span className="mx-1">تصدير ZIP</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              إلغاء التحديد
            </Button>
          </div>
        </div>
      )}

      <PowerDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        clients={clients}
        cases={cases}
        loading={upsert.isPending}
        onSubmit={async (payload) => {
          await upsert.mutateAsync({ ...payload, id: editing?.id });
        }}
      />

      {isLoading ? (
        <p className="text-center text-muted-foreground py-10">جارٍ التحميل...</p>
      ) : rows.length === 0 ? (
        <Card className="card-luxe border-none p-10 text-center">
          <p className="text-sm">
            لا توجد وكالات حتى الآن — استخدم زر "إضافة وكالة" أو "مزامنة مع ناجز"
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[...rows]
            .sort((a, b) => {
              const completenessScore = (r: PowerRow) => {
                const p = parsePowerRow(r);
                let s = 0;
                if (p.issuer.name) s++;
                if (p.agent.name) s++;
                if (p.issuer.idNumber) s++;
                if (p.agent.idNumber) s++;
                if (p.issueDate) s++;
                if (p.expiryDate) s++;
                return s;
              };
              const cA = completenessScore(a);
              const cB = completenessScore(b);
              if (cA !== cB) return cB - cA;
              const dA = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
              const dB = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
              return dA - dB;
            })
            .map((r) => {
              const clientName = clients.find((c) => c.id === r.client_id)?.full_name;
              return (
                <PowerCard
                  key={r.id}
                  row={r}
                  clientName={clientName}
                  onView={() => setSelectedPower(r)}
                  onEdit={() => {
                    setEditing(r);
                    setOpen(true);
                  }}
                  onDelete={() => {
                    if (confirm(`حذف الوكالة ${r.wakalah_number}؟`)) del.mutate(r.id);
                  }}
                  onSync={() => sync.mutate()}
                  syncing={sync.isPending}
                  expiryClass={expiryClass}
                  selected={selected.has(r.id)}
                  onToggleSelect={() => toggleSelect(r.id)}
                />
              );
            })}
        </div>
      )}

      <Dialog open={!!selectedPower} onOpenChange={(v) => !v && setSelectedPower(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-black text-[#1f1810]">
                <span className="text-[#8a6a1a]">
                  #
                  {selectedPower
                    ? parsePowerRow(selectedPower).wakalahNumber || selectedPower.wakalah_number
                    : ""}
                </span>{" "}
                تفاصيل الوكالة
              </DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setSelectedPower(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </DialogHeader>

          {selectedPower && (
            <PowerDetailView
              row={selectedPower}
              clientName={clients.find((c) => c.id === selectedPower.client_id)?.full_name}
              onEdit={() => {
                setSelectedPower(null);
                setEditing(selectedPower);
                setOpen(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function displayWakalahNumber(parsed: { wakalahNumber?: string | null }, row: PowerRow) {
  return parsed.wakalahNumber || row.wakalah_number || null;
}

function PowerDetailView({
  row,
  clientName,
  onEdit,
}: {
  row: PowerRow;
  clientName?: string;
  onEdit: () => void;
}) {
  const [activeTab, setActiveTab] = useState("basic");
  const parsed = parsePowerRow(row);
  const wakalahNum = displayWakalahNumber(parsed, row);
  const issuersList = parsed.issuers && parsed.issuers.length > 0 ? parsed.issuers : [parsed.issuer];
  const agentsList = parsed.agents && parsed.agents.length > 0 ? parsed.agents : [parsed.agent];

  const tabs = [
    { id: "basic", label: "البيانات الأساسية", icon: BookOpen },
    { id: "issuer", label: "بيانات المُصدر", icon: User },
    { id: "agent", label: "بيانات الوكيل", icon: ShieldCheck },
    { id: "agency", label: "بيانات الوكالة", icon: FileText },
  ];

  return (
    <ScrollArea className="flex-1 -mx-2">
      <div className="px-2 space-y-4">
        <div className="flex gap-1 border-b pb-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? "bg-[#c9a227]/15 text-[#8a6a1a] border border-[#c9a227]/30" : "text-muted-foreground hover:bg-muted"}`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "basic" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="رقم الوكالة" value={wakalahNum} />
              <InfoField
                label="الحالة"
                value={row.status ? STATUS_LABEL[row.status] || row.status : null}
              />
              <InfoField label="تاريخ الإصدار" value={formatDate(row.issue_date)} />
              <InfoField label="تاريخ الانتهاء" value={formatDate(row.expiry_date)} />
              <InfoField label="جهة الإصدار" value={cleanNajizTitle(parsed.issuerEntity)} />
              <InfoField label="كيفية الاستخدام" value={cleanNajizTitle(parsed.usageMethod)} />
              {clientName && <InfoField label="العميل المرتبط" value={clientName} />}
              {row.najiz_id && <InfoField label="معرّف ناجز" value={row.najiz_id} />}
              {row.najiz_synced_at && (
                <InfoField
                  label="آخر مزامنة"
                  value={new Date(row.najiz_synced_at).toLocaleString("ar-SA-u-ca-gregory", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                />
              )}
            </div>
            {row.scope && (
              <InfoField label="نطاق / موضوع الوكالة" value={cleanNajizTitle(row.scope)} full />
            )}
            {row.notes && <InfoField label="ملاحظات" value={row.notes} full />}
          </div>
        )}

        {activeTab === "issuer" && (
          <div className="space-y-4">
            {issuersList.map((p, i) => (
              <Card
                key={i}
                className="p-4 border-emerald-200/40 bg-gradient-to-l from-emerald-50/40 to-transparent"
              >
                {issuersList.length > 1 && (
                  <div className="mb-2 text-[11px] font-black text-emerald-800">مُصدر ({i + 1})</div>
                )}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <InfoField label="اسم المُصدر" value={p.name} />
                  <InfoField label="صفة المُصدر" value={p.capacity} />
                  <InfoField label="جنسية المُصدر" value={p.nationality} />
                  <InfoField label="نوع هوية المُصدر" value={p.idType} />
                  <InfoField label="رقم هوية المُصدر" value={p.idNumber} />
                  <InfoField label="حالته بالوكالة" value={p.status} />
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "agent" && (
          <div className="space-y-4">
            {agentsList.map((p, i) => (
              <Card
                key={i}
                className="p-4 border-blue-200/40 bg-gradient-to-l from-blue-50/40 to-transparent"
              >
                {agentsList.length > 1 && (
                  <div className="mb-2 text-[11px] font-black text-blue-800">وكيل ({i + 1})</div>
                )}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <InfoField label="اسم الوكيل" value={p.name} />
                  <InfoField label="صفة الوكيل" value={p.capacity} />
                  <InfoField label="جنسية الوكيل" value={p.nationality} />
                  <InfoField label="نوع هوية الوكيل" value={p.idType} />
                  <InfoField label="رقم هوية الوكيل" value={p.idNumber} />
                  <InfoField label="حالته بالوكالة" value={p.status} />
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "agency" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="جهة الإصدار" value={cleanNajizTitle(parsed.issuerEntity)} />
              <InfoField label="كيفية الاستخدام" value={cleanNajizTitle(parsed.usageMethod)} />
            </div>
            <Separator />
            {row.agency_data && (
              <div>
                <h4 className="text-sm font-black text-[#8a6a1a] mb-2 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#c9a227]" /> بيانات الوكالة
                </h4>
                <Card className="p-3 border-[#c9a227]/20 bg-gradient-to-l from-amber-50/40 to-transparent">
                  <p className="text-xs text-[#1f1810] whitespace-pre-wrap leading-relaxed">
                    {cleanNajizTitle(row.agency_data)}
                  </p>
                </Card>
              </div>
            )}
            {parsed.agencyClauses && (
              <div>
                <h4 className="text-sm font-black text-[#8a6a1a] mb-2 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#c9a227]" /> بنود الوكالة
                </h4>
                <Card className="p-3 border-[#c9a227]/20 bg-gradient-to-l from-amber-50/40 to-transparent">
                  <p className="text-xs text-[#1f1810] whitespace-pre-wrap leading-relaxed">
                    {parsed.agencyClauses}
                  </p>
                </Card>
              </div>
            )}
            {row.agency_text && (
              <div>
                <h4 className="text-sm font-black text-[#8a6a1a] mb-2 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#c9a227]" /> نص الوكالة
                </h4>
                <Card className="p-3 border-[#c9a227]/20 bg-gradient-to-l from-amber-50/40 to-transparent">
                  <p className="text-xs text-[#1f1810] whitespace-pre-wrap leading-relaxed">
                    {cleanNajizTitle(row.agency_text)}
                  </p>
                </Card>
              </div>
            )}
            {!row.agency_data && !row.agency_clauses && !row.agency_text && (
              <p className="text-xs text-muted-foreground">لا توجد بيانات وكالة تفصيلية</p>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t">
          <Button className="btn-gold gap-2" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            تعديل
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}

function PowerCard({
  row,
  clientName,
  onView,
  onEdit,
  onDelete,
  onSync,
  syncing,
  expiryClass,
  selected,
  onToggleSelect,
}: {
  row: PowerRow;
  clientName?: string;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSync: () => void;
  syncing: boolean;
  expiryClass: (d?: string | null) => {
    className: string;
    level: "ok" | "warn" | "danger" | "expired";
  };
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const { className, level } = expiryClass(row.expiry_date);
  const dl = daysLeft(row.expiry_date);
  const parsed = parsePowerRow(row);
  const wakalahNum = parsed.wakalahNumber || row.wakalah_number;

  return (
    <Card
      data-testid="power-card"
      className="card-luxe border-none p-0 cursor-pointer relative hover:shadow-2xl transition-all duration-300 overflow-hidden group"
      onClick={onView}
    >
      <div className="h-2 bg-gradient-to-l from-[#c9a227] via-[#d4af37] to-[#c9a227]" />

      <div className="p-5">
        <div className="flex justify-between items-start mb-3 gap-2">
          <div className="flex-1">
            <div
              className={`inline-flex items-center h-7 px-2 text-[11px] font-bold border-2 rounded ${STATUS_COLORS[row.status] || STATUS_COLORS.active}`}
            >
              {STATUS_LABEL[row.status] || row.status}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {row.najiz_id ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <Network className="h-3 w-3" /> ناجز
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                يدوي
              </span>
            )}
            {dl != null && (level === "danger" || level === "expired" || level === "warn") && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-extrabold shadow-md border-2 border-red-600 bg-red-600 text-white ${level === "warn" ? "" : "animate-pulse"}`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {level === "expired" ? `منتهية منذ ${Math.abs(dl)} يوم` : `تنتهي خلال ${dl} يوم`}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-black text-[#8a6a1a] tracking-wide" title={wakalahNum}>
            <span className="text-muted-foreground font-bold">رقم الوكالة: </span>
            <span className="font-black">#{wakalahNum}</span>
          </span>
          {row.issue_date && (
            <span className="text-[10px] text-muted-foreground">{formatDate(row.issue_date)}</span>
          )}
        </div>

        <div className="mb-3 p-3 bg-gradient-to-l from-amber-50/80 to-amber-50/30 rounded-lg border border-amber-200/40">
          <div className="flex items-center gap-2 mb-2">
            <User className="h-3.5 w-3.5 text-[#8a6a1a]" />
            <span className="text-[11px] font-black text-[#5a4510]">أطراف الوكالة</span>
          </div>
          <div className="mb-2 space-y-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-black text-emerald-700 shrink-0">المُصدر:</span>
              <span className="text-xs font-black text-[#1f1810]">{parsed.issuer.name || "—"}</span>
            </div>
            {(parsed.issuer.idNumber || parsed.issuer.nationality) && (
              <div className="text-[10.5px] text-[#3a2f1e] pr-3 leading-relaxed">
                {parsed.issuer.idNumber && (
                  <>
                    <span className="font-bold text-[#5a4510]">رقم الهوية: </span>
                    <span className="font-normal">{parsed.issuer.idNumber}</span>
                  </>
                )}
                {parsed.issuer.idNumber && parsed.issuer.nationality && (
                  <span className="mx-1 text-muted-foreground">·</span>
                )}
                {parsed.issuer.nationality && (
                  <>
                    <span className="font-bold text-[#5a4510]">الجنسية: </span>
                    <span className="font-normal">{parsed.issuer.nationality}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-black text-blue-700 shrink-0">الوكيل:</span>
              <span className="text-xs font-black text-[#1f1810]">{parsed.agent.name || "—"}</span>
            </div>
            {(parsed.agent.idNumber || parsed.agent.nationality) && (
              <div className="text-[10.5px] text-[#3a2f1e] pr-3 leading-relaxed">
                {parsed.agent.idNumber && (
                  <>
                    <span className="font-bold text-[#5a4510]">رقم الهوية: </span>
                    <span className="font-normal">{parsed.agent.idNumber}</span>
                  </>
                )}
                {parsed.agent.idNumber && parsed.agent.nationality && (
                  <span className="mx-1 text-muted-foreground">·</span>
                )}
                {parsed.agent.nationality && (
                  <>
                    <span className="font-bold text-[#5a4510]">الجنسية: </span>
                    <span className="font-normal">{parsed.agent.nationality}</span>
                  </>
                )}
              </div>
            )}
          </div>
          {clientName && (
            <div className="mt-1.5 pt-1.5 border-t border-amber-200/40">
              <span className="text-[10px] font-black text-[#8a6a1a]">العميل: </span>
              <span className="text-xs font-semibold text-[#1f1810] mr-1">{clientName}</span>
            </div>
          )}
        </div>

        <div className="mb-3 space-y-1">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3 w-3 text-[#8a6a1a]" />
            <span className="text-[10px] text-muted-foreground font-black">تاريخ الإصدار:</span>
            <span className="text-xs font-normal text-[#1f1810]">
              {formatDate(row.issue_date) || "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3 w-3 text-[#8a6a1a]" />
            <span className="text-[10px] text-muted-foreground font-black">تاريخ الانتهاء:</span>
            <span
              className={`text-xs font-normal ${level !== "ok" ? "text-red-600" : "text-[#1f1810]"}`}
            >
              {formatDate(row.expiry_date) || "—"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 border-t-2 border-[#c9a227]/20">
          <label
            className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="accent-[#c9a227]"
            />
            تحديد
          </label>
        </div>

        <div className="flex gap-2 mt-3 pt-3 border-t border-border/40">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-[11px] gap-1"
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
          >
            <Eye className="h-3 w-3" /> الاطلاع على التفاصيل
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onSync();
            }}
            disabled={syncing}
            title="مزامنة"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="تعديل"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="حذف"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function InfoField({ label, value, full }: { label: string; value: any; full?: boolean }) {
  if (!value) return null;
  return (
    <div className={full ? "col-span-2" : ""}>
      <span className="text-[10px] font-bold text-muted-foreground block">{label}</span>
      <span className="text-xs font-semibold text-[#1f1810] leading-relaxed whitespace-pre-wrap">
        {value}
      </span>
    </div>
  );
}

function PowerDialog({
  open,
  onOpenChange,
  editing,
  clients,
  cases,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PowerRow | null;
  clients: ClientRow[];
  cases: CaseRow[];
  loading: boolean;
  onSubmit: (payload: Record<string, any>) => Promise<void>;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [clientId, setClientId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [v, setV] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!open) return;
    setV({
      wakalah_number: editing?.wakalah_number ?? "",
      issuer_name: editing?.issuer_name ?? "",
      agent_name: editing?.agent_name ?? "",
      issuer_id_number: editing?.issuer_id_number ?? "",
      agent_id_number: editing?.agent_id_number ?? "",
      issue_date: editing?.issue_date ?? "",
      expiry_date: editing?.expiry_date ?? "",
      scope: editing?.scope ?? "",
      notes: editing?.notes ?? "",
      issuer_entity: editing?.issuer_entity ?? "",
      usage_method: editing?.usage_method ?? "",
      issuer_capacity: editing?.issuer_capacity ?? "",
      issuer_nationality: editing?.issuer_nationality ?? "",
      issuer_identity_type: editing?.issuer_identity_type ?? "",
      issuer_status_in_agency: editing?.issuer_status_in_agency ?? "",
      agent_capacity: editing?.agent_capacity ?? "",
      agent_nationality: editing?.agent_nationality ?? "",
      agent_identity_type: editing?.agent_identity_type ?? "",
      agent_status_in_agency: editing?.agent_status_in_agency ?? "",
      agency_clauses: editing?.agency_clauses ?? "",
      agency_text: editing?.agency_text ?? "",
      agency_data: editing?.agency_data ?? "",
    });
    setClientId(editing?.client_id ?? "");
    setCaseId("");
    setNewClientName("");
    setNewClientPhone("");
    setMode("existing");
  }, [open, editing]);

  const filteredCases = useMemo(
    () => cases.filter((c) => !clientId || c.client_id === clientId),
    [cases, clientId],
  );

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    let finalClientId = clientId || null;
    if (mode === "new" && newClientName.trim()) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("غير مسجل دخول");
        return;
      }
      const { data, error } = await supabase
        .from("clients")
        .insert({
          full_name: newClientName.trim(),
          phone: newClientPhone.trim() || null,
          owner_id: user.id,
        } as never)
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      finalClientId = (data as any).id;
    }
    const payload: Record<string, any> = {
      wakalah_number: v.wakalah_number,
      issuer_name: v.issuer_name || null,
      agent_name: v.agent_name || null,
      issuer_id_number: v.issuer_id_number || null,
      agent_id_number: v.agent_id_number || null,
      issue_date: v.issue_date || null,
      expiry_date: v.expiry_date || null,
      scope: v.scope || null,
      notes: v.notes || null,
      client_id: finalClientId,
      issuer_entity: v.issuer_entity || null,
      usage_method: v.usage_method || null,
      issuer_capacity: v.issuer_capacity || null,
      issuer_nationality: v.issuer_nationality || null,
      issuer_identity_type: v.issuer_identity_type || null,
      issuer_status_in_agency: v.issuer_status_in_agency || null,
      agent_capacity: v.agent_capacity || null,
      agent_nationality: v.agent_nationality || null,
      agent_identity_type: v.agent_identity_type || null,
      agent_status_in_agency: v.agent_status_in_agency || null,
      agency_clauses: v.agency_clauses || null,
      agency_text: v.agency_text || null,
      agency_data: v.agency_data || null,
    };
    if (caseId) payload.notes = `${payload.notes ?? ""}\nقضية مرتبطة: ${caseId}`.trim();
    await onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-xl">
            {editing ? "تعديل وكالة" : "وكالة قضائية جديدة"}
          </DialogTitle>
          <DialogDescription className="text-right text-xs">
            اربط الوكالة بعميل مسجّل أو سجّل عميلاً جديداً.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handle} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <Label className="text-xs font-semibold ml-1">العميل:</Label>
            <div className="inline-flex rounded-lg border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={`px-3 py-1 text-xs rounded ${mode === "existing" ? "bg-primary text-primary-foreground" : ""}`}
              >
                عميل مسجّل
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className={`px-3 py-1 text-xs rounded ${mode === "new" ? "bg-primary text-primary-foreground" : ""}`}
              >
                عميل جديد
              </button>
            </div>
          </div>

          {mode === "existing" ? (
            <>
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">اختر العميل</Label>
                <Select
                  value={clientId}
                  onValueChange={(v) => {
                    setClientId(v);
                    setCaseId("");
                  }}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="— اختر —" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">
                  القضية المرتبطة (اختياري)
                </Label>
                <Select value={caseId} onValueChange={setCaseId}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="— اختر —" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCases.length === 0 && (
                      <SelectItem disabled value="__none__">
                        لا توجد قضايا
                      </SelectItem>
                    )}
                    {filteredCases.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        #{c.case_number} — {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">اسم العميل الجديد</Label>
                <Input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  required
                  className="text-right"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">جوال العميل</Label>
                <Input
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="text-right"
                />
              </div>
            </>
          )}

          <FieldInput v={v} setV={setV} name="wakalah_number" label="رقم الوكالة" required />
          <FieldInput v={v} setV={setV} name="issuer_name" label="اسم المُصدر" />
          <FieldInput v={v} setV={setV} name="agent_name" label="اسم الوكيل" />
          <FieldInput v={v} setV={setV} name="issuer_id_number" label="رقم هوية المُصدر" />
          <FieldInput v={v} setV={setV} name="agent_id_number" label="رقم هوية الوكيل" />
          <FieldInput v={v} setV={setV} name="issue_date" label="تاريخ الإصدار" type="date" />
          <FieldInput v={v} setV={setV} name="expiry_date" label="تاريخ الانتهاء" type="date" />
          <FieldInput v={v} setV={setV} name="issuer_entity" label="جهة الإصدار" />
          <FieldInput v={v} setV={setV} name="usage_method" label="كيفية الاستخدام" />
          <FieldInput v={v} setV={setV} name="issuer_capacity" label="صفة المُصدر" />
          <FieldInput v={v} setV={setV} name="issuer_nationality" label="جنسية المُصدر" />
          <FieldInput v={v} setV={setV} name="issuer_identity_type" label="نوع هوية المُصدر" />
          <FieldInput
            v={v}
            setV={setV}
            name="issuer_status_in_agency"
            label="حالة المُصدر في الوكالة"
          />
          <FieldInput v={v} setV={setV} name="agent_capacity" label="صفة الوكيل" />
          <FieldInput v={v} setV={setV} name="agent_nationality" label="جنسية الوكيل" />
          <FieldInput v={v} setV={setV} name="agent_identity_type" label="نوع هوية الوكيل" />
          <FieldInput
            v={v}
            setV={setV}
            name="agent_status_in_agency"
            label="حالة الوكيل في الوكالة"
          />

          <div className="md:col-span-2">
            <Label className="text-xs font-semibold mb-1.5 block">نطاق / موضوع الوكالة</Label>
            <Textarea
              value={v.scope ?? ""}
              onChange={(e) => setV({ ...v, scope: e.target.value })}
              className="text-right min-h-[70px]"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs font-semibold mb-1.5 block">بيانات الوكالة</Label>
            <Textarea
              value={v.agency_data ?? ""}
              onChange={(e) => setV({ ...v, agency_data: e.target.value })}
              className="text-right min-h-[70px]"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs font-semibold mb-1.5 block">بنود الوكالة</Label>
            <Textarea
              value={v.agency_clauses ?? ""}
              onChange={(e) => setV({ ...v, agency_clauses: e.target.value })}
              className="text-right min-h-[70px]"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs font-semibold mb-1.5 block">نص الوكالة</Label>
            <Textarea
              value={v.agency_text ?? ""}
              onChange={(e) => setV({ ...v, agency_text: e.target.value })}
              className="text-right min-h-[70px]"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs font-semibold mb-1.5 block">ملاحظات</Label>
            <Textarea
              value={v.notes ?? ""}
              onChange={(e) => setV({ ...v, notes: e.target.value })}
              className="text-right min-h-[60px]"
            />
          </div>

          <DialogFooter className="md:col-span-2 gap-2 mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" className="btn-gold" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldInput({
  v,
  setV,
  name,
  label,
  type = "text",
  required,
}: {
  v: Record<string, any>;
  setV: (x: Record<string, any>) => void;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs font-semibold mb-1.5 block">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        type={type}
        value={v[name] ?? ""}
        onChange={(e) => setV({ ...v, [name]: e.target.value })}
        required={required}
        className="text-right"
      />
    </div>
  );
}
