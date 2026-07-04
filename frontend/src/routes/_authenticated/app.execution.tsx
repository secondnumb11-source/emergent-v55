import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Gavel,
  RefreshCw,
  Loader2,
  Network,
  Download,
  Upload,
  Search,
  X,
  Printer,
  Trash2,
  Pencil,
  Plus,
  User,
  Building2,
  CalendarClock,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/section-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { useList, useUpsert, useDelete } from "@/lib/data-hooks";
import { syncNajizExecutions } from "@/lib/portal.functions";
import { useRealtimeTable } from "@/lib/realtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { exportRecordPdf, exportRecordsBundle } from "@/lib/pdf-export";
import { parseExecutionRow } from "@/lib/najiz-display";

export const Route = createFileRoute("/_authenticated/app/execution")({
  component: ExecutionPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد الانتظار",
  in_progress: "جارٍ التنفيذ",
  completed: "مكتمل",
  rejected: "مرفوض",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "border-amber-400/50 bg-amber-400/15 text-amber-200",
  in_progress: "border-sky-400/50 bg-sky-400/15 text-sky-200",
  completed: "border-emerald-400/50 bg-emerald-400/15 text-emerald-200",
  rejected: "border-rose-400/50 bg-rose-400/15 text-rose-200",
};

type ExecRow = {
  id: string;
  execution_number: string;
  court: string | null;
  debtor_name: string | null;
  amount: number | null;
  status: string;
  filed_date: string | null;
  case_id: string | null;
  client_id: string | null;
  notes: string | null;
  creditor_name: string | null;
  creditor_id_number: string | null;
  debtor_id_number: string | null;
  request_type: string | null;
  execution_data: string | null;
  najiz_id: string | null;
  najiz_synced_at: string | null;
};
type ClientRow = { id: string; full_name: string };
type CaseRow = { id: string; case_number: string; title: string; client_id?: string | null };

const CSV_COLUMNS = [
  "execution_number",
  "court",
  "creditor_name",
  "debtor_name",
  "amount",
  "request_type",
  "creditor_id_number",
  "debtor_id_number",
  "status",
  "filed_date",
  "case_id",
  "client_id",
  "notes",
] as const;
const CSV_HEADER_AR: Record<string, string> = {
  execution_number: "رقم الطلب",
  court: "المحكمة",
  creditor_name: "المنفذ",
  debtor_name: "المنفذ ضده",
  amount: "المبلغ",
  request_type: "نوع الطلب",
  creditor_id_number: "هوية المنفذ",
  debtor_id_number: "هوية المنفذ ضده",
  status: "الحالة",
  filed_date: "تاريخ الإيداع",
  case_id: "معرّف القضية",
  client_id: "معرّف العميل",
  notes: "ملاحظات",
};

function toCsv(rows: any[]) {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const header = CSV_COLUMNS.map((c) => CSV_HEADER_AR[c]).join(",");
  const body = rows.map((r) => CSV_COLUMNS.map((c) => esc(r[c])).join(",")).join("\n");
  return "\uFEFF" + header + "\n" + body;
}
function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, "");
  const lines: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of clean) {
    if (ch === '"') {
      inQ = !inQ;
      cur += ch;
      continue;
    }
    if (ch === "\n" && !inQ) {
      lines.push(cur);
      cur = "";
      continue;
    }
    if (ch === "\r" && !inQ) continue;
    cur += ch;
  }
  if (cur) lines.push(cur);
  if (lines.length === 0) return [];
  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let buf = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          buf += '"';
          i++;
        } else q = !q;
      } else if (c === "," && !q) {
        out.push(buf);
        buf = "";
      } else buf += c;
    }
    out.push(buf);
    return out;
  };
  const headers = splitRow(lines[0]).map((h) => h.trim());
  const headerKey = (h: string) => {
    const entry = Object.entries(CSV_HEADER_AR).find(([, ar]) => ar === h);
    return entry ? entry[0] : h;
  };
  const keys = headers.map(headerKey);
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => {
      const vals = splitRow(l);
      const obj: Record<string, string> = {};
      keys.forEach((k, i) => {
        obj[k] = (vals[i] ?? "").trim();
      });
      return obj;
    });
}

function ExecutionPage() {
  useRealtimeTable("executions", ["executions"]);
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useList<ExecRow>("executions");
  const { data: cases = [] } = useList<CaseRow>("cases");
  const { data: clients = [] } = useList<ClientRow>("clients");
  const upsert = useUpsert("executions");
  const del = useDelete("executions");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExecRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fCase, setFCase] = useState("");
  const [fClient, setFClient] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fStatus && r.status !== fStatus) return false;
      if (fCase && r.case_id !== fCase) return false;
      if (fClient && r.client_id !== fClient) return false;
      if (fFrom && (!r.filed_date || r.filed_date < fFrom)) return false;
      if (fTo && (!r.filed_date || r.filed_date > fTo)) return false;
      if (q) {
        const hay =
          `${r.execution_number ?? ""} ${r.court ?? ""} ${r.debtor_name ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, fStatus, fCase, fClient, fFrom, fTo]);

  const clearFilters = () => {
    setSearch("");
    setFStatus("");
    setFCase("");
    setFClient("");
    setFFrom("");
    setFTo("");
  };

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bundleBusy, setBundleBusy] = useState<"" | "combined" | "zip">("");
  const toggleSelect = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const exportSelected = async (mode: "combined" | "zip") => {
    const items = rows.filter((r) => selected.has(r.id));
    if (items.length === 0) return;
    setBundleBusy(mode);
    try {
      await exportRecordsBundle({
        mode,
        bundleName: `executions-${new Date().toISOString().slice(0, 10)}`,
        records: items.map((row) => {
          const clientName = clients.find((c) => c.id === row.client_id)?.full_name;
          const caseRow = cases.find((c) => c.id === row.case_id);
          return {
            title: `طلب تنفيذ رقم ${row.execution_number}`,
            subtitle: clientName ? `العميل: ${clientName}` : undefined,
            fileName: `execution-${row.execution_number}.pdf`,
            fields: [
              { label: "رقم الطلب", value: row.execution_number },
              { label: "محكمة التنفيذ", value: row.court },
              { label: "المنفذ ضده", value: row.debtor_name },
              { label: "العميل", value: clientName },
              { label: "القضية المرتبطة", value: caseRow ? `#${caseRow.case_number}` : null },
              {
                label: "المبلغ",
                value: row.amount ? `${Number(row.amount).toLocaleString("ar-SA")} ر.س` : null,
              },
              { label: "الحالة", value: STATUS_LABEL[row.status] ?? row.status },
              { label: "تاريخ الإيداع", value: row.filed_date },
              { label: "ملاحظات", value: row.notes },
            ],
          };
        }),
      });
      toast.success(`تم تصدير ${items.length} طلب`);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message || "فشل التصدير");
    } finally {
      setBundleBusy("");
    }
  };

  const sync = useMutation({
    mutationFn: async () => await syncNajizExecutions(),
    onSuccess: (r: any) => {
      toast.success(`المزامنة تمت — ${r.inserted} جديد · ${r.updated} محدّث · ${r.skipped} متجاهل`);
      qc.invalidateQueries({ queryKey: ["executions"] });
      qc.invalidateQueries({ queryKey: ["najiz_sync_logs"] });
    },
    onError: (e: any) => toast.error(e.message || "فشل المزامنة"),
  });

  const handleExport = () => {
    if (filtered.length === 0) return toast.error("لا توجد بيانات للتصدير");
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `executions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast.success(`تم تصدير ${filtered.length} صفّاً`);
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const records = parseCsv(text);
      if (records.length === 0) return toast.error("الملف فارغ أو غير صالح");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("غير مسجل دخول");
      const valid: any[] = [];
      const errors: string[] = [];
      records.forEach((r, idx) => {
        const n = (r.execution_number || "").trim();
        if (!n) {
          errors.push(`السطر ${idx + 2}: رقم الطلب مفقود`);
          return;
        }
        const status = (r.status || "pending").trim();
        if (!Object.keys(STATUS_LABEL).includes(status)) {
          errors.push(`السطر ${idx + 2}: حالة غير صالحة (${status})`);
          return;
        }
        valid.push({
          owner_id: user.id,
          execution_number: n,
          court: r.court || null,
          debtor_name: r.debtor_name || null,
          amount: r.amount ? Number(r.amount) || null : null,
          status,
          filed_date: r.filed_date || null,
          case_id: r.case_id || null,
          client_id: r.client_id || null,
          notes: r.notes || null,
        });
      });
      if (valid.length === 0)
        return toast.error(`فشل الاستيراد — لا توجد سجلات صالحة. ${errors[0] ?? ""}`);
      const { error } = await supabase.from("executions").insert(valid as never);
      if (error) throw new Error(error.message);
      qc.invalidateQueries({ queryKey: ["executions"] });
      if (errors.length) toast.warning(`تم استيراد ${valid.length} — تم تجاهل ${errors.length}`);
      else toast.success(`تم استيراد ${valid.length} طلب تنفيذ بنجاح`);
    } catch (e: any) {
      toast.error(e.message || "فشل الاستيراد");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const najizCount = rows.filter((r) => r.najiz_id).length;
  const hasFilters = !!(search || fStatus || fCase || fClient || fFrom || fTo);

  return (
    <>
      <PageHeader
        icon={Gavel}
        title="طلبات التنفيذ"
        subtitle={`${rows.length} طلب — منها ${najizCount} من ناجز${hasFilters ? ` · ${filtered.length} نتيجة` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExport} variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> تصدير CSV
            </Button>
            <Button
              onClick={() => fileRef.current?.click()}
              variant="outline"
              className="gap-2"
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              استيراد CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
              }}
            />
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
              <Plus className="h-4 w-4" /> إضافة طلب تنفيذ
            </Button>
          </div>
        }
      />

      {/* Filter bar */}
      <Card className="card-3d border-none p-4 mb-4">
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث في رقم الطلب، المحكمة، المنفذ ضده..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-right pr-9"
            />
          </div>
          <select
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
            className="h-10 rounded-lg border bg-background px-3 text-sm text-right"
          >
            <option value="">كل الحالات</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={fCase}
            onChange={(e) => setFCase(e.target.value)}
            className="h-10 rounded-lg border bg-background px-3 text-sm text-right"
          >
            <option value="">كل القضايا</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.case_number}
              </option>
            ))}
          </select>
          <select
            value={fClient}
            onChange={(e) => setFClient(e.target.value)}
            className="h-10 rounded-lg border bg-background px-3 text-sm text-right"
          >
            <option value="">كل العملاء</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={fFrom}
            onChange={(e) => setFFrom(e.target.value)}
            className="text-right h-10"
            title="من تاريخ"
          />
          <Input
            type="date"
            value={fTo}
            onChange={(e) => setFTo(e.target.value)}
            className="text-right h-10"
            title="إلى تاريخ"
          />
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters} className="gap-1 text-muted-foreground">
              <X className="h-4 w-4" /> مسح الفلاتر
            </Button>
          )}
        </div>
      </Card>

      <ExecDialog
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

      {selected.size > 0 && (
        <div className="card-luxe mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="text-sm text-white/80">{selected.size} طلب محدد</div>
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
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              إلغاء التحديد
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-center text-muted-foreground py-10">جارٍ التحميل...</p>
      ) : filtered.length === 0 ? (
        <div className="card-luxe p-12 text-center text-white/70">
          {rows.length === 0
            ? "لا توجد طلبات تنفيذ بعد — استخدم زر الإضافة أو زر مزامنة مع ناجز"
            : "لا توجد نتائج مطابقة للفلاتر"}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((r) => (
            <ExecCard
              key={r.id}
              row={r}
              clientName={clients.find((c) => c.id === r.client_id)?.full_name}
              caseLabel={(() => {
                const c = cases.find((x) => x.id === r.case_id);
                return c ? `#${c.case_number}` : undefined;
              })()}
              onEdit={() => {
                setEditing(r);
                setOpen(true);
              }}
              onDelete={() => {
                if (confirm(`حذف طلب التنفيذ ${r.execution_number}؟`)) del.mutate(r.id);
              }}
              onSync={() => sync.mutate()}
              syncing={sync.isPending}
              selected={selected.has(r.id)}
              onToggleSelect={() => toggleSelect(r.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ExecCard({
  row,
  clientName,
  caseLabel,
  onEdit,
  onDelete,
  onSync,
  syncing,
  selected,
  onToggleSelect,
}: {
  row: ExecRow;
  clientName?: string;
  caseLabel?: string;
  onEdit: () => void;
  onDelete: () => void;
  onSync: () => void;
  syncing: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const handlePrint = () =>
    exportRecordPdf({
      title: `طلب تنفيذ رقم ${row.execution_number}`,
      subtitle: clientName ? `العميل: ${clientName}` : undefined,
      fields: [
        { label: "رقم الطلب", value: row.execution_number },
        { label: "محكمة التنفيذ", value: row.court },
        { label: "المنفذ ضده", value: row.debtor_name },
        { label: "العميل", value: clientName },
        { label: "القضية المرتبطة", value: caseLabel },
        {
          label: "المبلغ",
          value: row.amount ? `${Number(row.amount).toLocaleString("ar-SA")} ر.س` : null,
        },
        { label: "الحالة", value: STATUS_LABEL[row.status] ?? row.status },
        { label: "تاريخ الإيداع", value: row.filed_date },
        { label: "ملاحظات", value: row.notes },
        { label: "مصدر", value: row.najiz_id ? "ناجز" : "يدوي" },
        { label: "آخر مزامنة مع ناجز", value: row.najiz_synced_at },
      ],
      fileName: `execution-${row.execution_number}.pdf`,
    }).catch((e) => toast.error(e?.message || "فشل التصدير"));

  const fmtAmount = row.amount != null ? `${Number(row.amount).toLocaleString("ar-SA")} ر.س` : null;
  const parsed = parseExecutionRow(row);
  const displayAmount = fmtAmount || parsed.amount || null;
  const agentIds = parsed.agentIds;

  return (
    <div
      data-testid="execution-card"
      className={`card-luxe flex flex-col p-5 relative ${selected ? "ring-2 ring-gold/70" : ""}`}
    >
      <label className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-md bg-black/30 px-2 py-1 text-[10px] text-white/80 cursor-pointer">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="accent-gold"
        />
        تحديد
      </label>

      {/* Top row — icon + Najiz + status (unchanged position/colors) */}
      <div className="flex items-start justify-between gap-2 relative z-10">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-gold to-gold/60 text-primary shadow-md shrink-0">
          <Gavel className="h-5 w-5" />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {row.najiz_id ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              <Network className="h-3 w-3" /> ناجز
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/70">
              يدوي
            </span>
          )}
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[row.status] ?? STATUS_COLOR.pending}`}
          >
            {STATUS_LABEL[row.status] ?? row.status}
          </span>
        </div>
      </div>

      {/* Header block: request # + court + type/basis */}
      <div className="mt-3 space-y-1.5 text-[13px] relative z-10">
        <FieldLine bold label="رقم الطلب" value={row.execution_number} highlight />
        <FieldLine bold label="المحكمة" value={parsed.court} />
        <FieldLine bold label="الدائرة" value={parsed.circuit} />
        <FieldLine bold label="الصفة في الطلب" value={parsed.requestType} />
        <FieldLine bold label="نوع السند الرئيسي" value={parsed.bondMain} />
        <FieldLine bold label="نوع السند الفرعي" value={parsed.bondSub} />
        {parsed.requestStatus && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-white/70 font-extrabold">حالة الطلب:</span>
            <span className="inline-flex rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-bold text-gold">
              {parsed.requestStatus}
            </span>
          </div>
        )}
      </div>

      <div className="my-3 h-px bg-white/10 relative z-10" />

      {/* Creditor party */}
      <PartyBlock
        title="المنفذ"
        name={parsed.creditor.name}
        capacity={parsed.creditor.capacity}
        idType={parsed.creditor.idType}
        idNumber={parsed.creditor.idNumber}
        extraLabel="الرقم الموحد"
        extraValue={parsed.creditor.unifiedNumber}
        secondaryLabel={parsed.creditor.amountDue ? "المبلغ المستحق" : undefined}
        secondaryValue={parsed.creditor.amountDue}
      />

      <div className="my-3 h-px bg-white/10 relative z-10" />

      {/* Debtor party */}
      <PartyBlock
        title="المنفذ ضده"
        name={parsed.debtor.name}
        capacity={parsed.debtor.capacity}
        idType={parsed.debtor.idType}
        idNumber={parsed.debtor.idNumber}
        extraLabel="الجنسية"
        extraValue={parsed.debtor.nationality}
      />

      <div className="my-3 h-px bg-white/10 relative z-10" />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px] relative z-10">
        {parsed.decisions && <FieldLine bold label="القرارات" value={parsed.decisions} />}
        {agentIds && <FieldLine bold label="هوية الوكلاء" value={agentIds} />}
        <FieldLine bold label="المبلغ" value={displayAmount} />
        <FieldLine bold label="تقديم الطلب" value={parsed.filedDate} />
      </div>

      {/* Bottom row — action buttons (unchanged position/colors) */}
      <div className="mt-4 grid grid-cols-4 gap-1.5 relative z-10">
        <button
          onClick={onSync}
          disabled={syncing}
          title="مزامنة مع ناجز"
          className="h-8 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20 transition grid place-items-center"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={handlePrint}
          title="طباعة PDF"
          className="h-8 rounded-lg border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 transition grid place-items-center"
        >
          <Printer className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onEdit}
          title="تعديل"
          className="h-8 rounded-lg border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 transition grid place-items-center"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          title="حذف"
          className="h-8 rounded-lg border border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20 transition grid place-items-center"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function FieldLine({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: any;
  bold?: boolean;
  highlight?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className={`shrink-0 text-white/70 ${bold ? "font-extrabold" : "font-normal"}`}>
        {label}:
      </span>
      <span
        className={`break-words leading-snug min-w-0 ${highlight ? "font-extrabold text-gold text-[14px]" : "font-normal text-white/95"}`}
        title={String(value)}
      >
        {value}
      </span>
    </div>
  );
}

function PartyBlock({
  title,
  name,
  capacity,
  idType,
  idNumber,
  extraLabel,
  extraValue,
  secondaryLabel,
  secondaryValue,
}: {
  title: string;
  name: any;
  capacity?: any;
  idType?: any;
  idNumber?: any;
  extraLabel: string;
  extraValue?: any;
  secondaryLabel?: string;
  secondaryValue?: any;
}) {
  return (
    <div className="space-y-1 relative z-10 text-[12.5px]">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-extrabold text-gold/90 text-[13px]">{title}:</span>
        <span className="break-words leading-snug min-w-0 font-extrabold text-white text-[14px]" title={String(name ?? "")}>
          {name || "—"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pr-2 text-white/90">
        {capacity && <MiniLine label="الصفة" value={capacity} />}
        {idType && <MiniLine label="نوع الهوية" value={idType} />}
        {idNumber && <MiniLine label="رقم الهوية" value={idNumber} />}
        {extraValue && <MiniLine label={extraLabel} value={extraValue} />}
        {secondaryLabel && secondaryValue && (
          <MiniLine label={secondaryLabel} value={secondaryValue} />
        )}
      </div>
    </div>
  );
}

function MiniLine({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="shrink-0 text-white/60 font-bold text-[11px]">{label}:</span>
      <span className="break-words leading-snug min-w-0 text-white/95 text-[12px]" title={String(value)}>
        {value}
      </span>
    </div>
  );
}

function ExecDialog({
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
  editing: ExecRow | null;
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
  const [v, setV] = useState<Record<string, any>>({ status: "pending" });

  useEffect(() => {
    if (!open) return;
    setV({
      execution_number: editing?.execution_number ?? "",
      court: editing?.court ?? "",
      debtor_name: editing?.debtor_name ?? "",
      amount: editing?.amount ?? "",
      status: editing?.status ?? "pending",
      filed_date: editing?.filed_date ?? "",
      notes: editing?.notes ?? "",
    });
    setClientId(editing?.client_id ?? "");
    setCaseId(editing?.case_id ?? "");
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
      execution_number: v.execution_number,
      court: v.court || null,
      debtor_name: v.debtor_name || null,
      amount: v.amount ? Number(v.amount) : null,
      status: v.status || "pending",
      filed_date: v.filed_date || null,
      notes: v.notes || null,
      client_id: finalClientId,
      case_id: caseId || null,
    };
    await onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right text-xl">
            {editing ? "تعديل طلب تنفيذ" : "طلب تنفيذ جديد"}
          </DialogTitle>
          <DialogDescription className="text-right text-xs">
            اربط الطلب بعميل مسجّل وقضية، أو سجّل عميلاً جديداً.
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
                <Label className="text-xs font-semibold mb-1.5 block">القضية المرتبطة</Label>
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

          <Field v={v} setV={setV} name="execution_number" label="رقم طلب التنفيذ" required />
          <Field v={v} setV={setV} name="court" label="محكمة التنفيذ" />
          <Field v={v} setV={setV} name="debtor_name" label="المنفذ ضده" />
          <Field v={v} setV={setV} name="amount" label="المبلغ (ر.س)" type="number" />
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">الحالة</Label>
            <select
              value={v.status ?? "pending"}
              onChange={(e) => setV({ ...v, status: e.target.value })}
              className="w-full h-10 rounded-lg border bg-background px-3 text-sm text-right"
            >
              {Object.entries(STATUS_LABEL).map(([val, l]) => (
                <option key={val} value={val}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <Field v={v} setV={setV} name="filed_date" label="تاريخ الإيداع" type="date" />

          <div className="md:col-span-2">
            <Label className="text-xs font-semibold mb-1.5 block">ملاحظات</Label>
            <Textarea
              value={v.notes ?? ""}
              onChange={(e) => setV({ ...v, notes: e.target.value })}
              className="text-right min-h-[70px]"
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

function Field({
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
