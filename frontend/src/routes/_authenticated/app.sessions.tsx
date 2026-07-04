import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  Clock,
  MapPin,
  Gavel,
  Plus,
  Pencil,
  Trash2,
  Apple,
  CalendarPlus,
  Download,
  RefreshCw,
  X as XClear,
} from "lucide-react";
import { PageHeader } from "@/components/section-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CrudDialog, type Field } from "@/components/crud-dialog";
import { DataTable } from "@/components/data-table";
import { useList, useUpsert, useDelete } from "@/lib/data-hooks";
import { looksLikeBlob, pickField, extractCaseNumber } from "@/lib/najiz-parse";
import { toast } from "sonner";
import { CalendarModeToggle } from "@/components/calendar-mode-toggle";
import { useCalendarMode, formatDateByMode } from "@/hooks/use-calendar-mode";

const sessionsSearchSchema = z.object({
  case: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/app/sessions")({
  validateSearch: zodValidator(sessionsSearchSchema),
  component: SessionsPage,
});

const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "مجدولة", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  postponed: { label: "مؤجلة", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  held: { label: "منعقدة", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled: { label: "ملغاة", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};

type SessionRow = {
  id: string;
  case_id: string;
  session_date: string;
  court?: string | null;
  room?: string | null;
  status: keyof typeof STATUS;
  notes?: string | null;
};
type CaseRow = {
  id: string;
  title: string;
  case_number: string;
  client_id?: string | null;
  court?: string | null;
  circuit_number?: string | null;
  description?: string | null;
  najiz_id?: string | null;
};
type ClientRow = { id: string; full_name: string; phone?: string | null };

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Clean display label for a case — never show glued/placeholder titles. */
function caseLabel(c?: CaseRow | null): string {
  if (!c) return "—";
  const num = extractCaseNumber(c.case_number) || c.case_number || "";
  const t = String(c.title || "").trim();
  if (!t || /^قضية \(من جلسة\)|^unknown[_-]?/i.test(t)) return `قضية #${num}`;
  if (looksLikeBlob(t)) {
    const p = pickField(t, "plaintiff");
    const d = pickField(t, "defendant");
    if (p && d) return `${num} – ${p} ضد ${d}`;
    return `قضية #${num}`;
  }
  return `${num} – ${t}`;
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toICSDate(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

function googleCalendarUrl(s: SessionRow, c?: CaseRow) {
  const start = new Date(s.session_date);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const text = c ? `جلسة ${caseLabel(c)}` : "جلسة قضائية";
  const details = [s.notes, s.court ? `المحكمة: ${s.court}` : "", s.room ? `القاعة: ${s.room}` : ""]
    .filter(Boolean)
    .join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text,
    dates: `${fmt(start)}/${fmt(end)}`,
    details,
    location: [s.court, s.room].filter(Boolean).join(" - "),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadICS(sessions: SessionRow[], cases: Record<string, CaseRow>) {
  const events = sessions
    .map((s) => {
      const c = cases[s.case_id];
      const start = toICSDate(s.session_date);
      const end = toICSDate(
        new Date(new Date(s.session_date).getTime() + 60 * 60 * 1000).toISOString(),
      );
      const title = c ? `جلسة ${caseLabel(c)}` : "جلسة قضائية";
      const desc = [
        s.notes ?? "",
        s.court ? `المحكمة: ${s.court}` : "",
        s.room ? `القاعة: ${s.room}` : "",
      ]
        .filter(Boolean)
        .join("\\n");
      return [
        "BEGIN:VEVENT",
        `UID:${s.id}@adala`,
        `DTSTAMP:${start}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${title}`,
        `DESCRIPTION:${desc}`,
        `LOCATION:${[s.court, s.room].filter(Boolean).join(" - ")}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Adala//Sessions//AR\r\nCALSCALE:GREGORIAN\r\n${events}\r\nEND:VCALENDAR`;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "adala-sessions.ics";
  a.click();
  URL.revokeObjectURL(url);
  toast.success(
    "تم تنزيل ملف التقويم (.ics) — افتحه في Apple Calendar أو استورده إلى Google Calendar",
  );
}

function SessionsPage() {
  const navigate = useNavigate({ from: "/app/sessions" });
  const { case: caseFilter } = Route.useSearch();
  const {
    data: allSessions = [],
    isLoading,
    refetch,
  } = useList<SessionRow>("sessions", "session_date", true);
  const { data: cases = [] } = useList<CaseRow>("cases");
  const { data: clients = [] } = useList<ClientRow>("clients");
  const { data: caseParties = [] } = useList<any>("case_parties");
  const { data: caseDetails = [] } = useList<any>("case_details");
  const upsert = useUpsert("sessions");
  const del = useDelete("sessions");
  const { mode: calMode } = useCalendarMode();

  const caseMap = useMemo(() => Object.fromEntries(cases.map((c) => [c.id, c])), [cases]);
  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  const norm = (v: any) => String(v || "").replace(/\s/g, "");
  const filterCaseIds = useMemo(() => {
    if (!caseFilter) return null;
    const nf = norm(caseFilter);
    return new Set(cases.filter((c) => norm(c.case_number) === nf).map((c) => c.id));
  }, [cases, caseFilter]);
  // ---- Business rule: a session is displayed ONLY when at least one of the
  // following is available (session itself, linked case, Najiz details or
  // parties): اسم المدعي، اسم المدعى عليه، المحكمة، نوع الدعوى، موضوع الدعوى،
  // رقم الدائرة.
  const meaningfulCaseIds = useMemo(() => {
    const set = new Set<string>();
    const match = (row: any, c: CaseRow) =>
      row.case_id === c.id ||
      (row.case_number &&
        (norm(row.case_number) === norm(c.case_number) ||
          norm(row.case_number) === norm(c.najiz_id).replace(/^case_/, "")));
    for (const c of cases) {
      const d = caseDetails.find((x: any) => match(x, c));
      const parties = caseParties.filter((x: any) => match(x, c));
      const hasPlaintiff = parties.some(
        (p: any) => p.party_type === "plaintiff" && String(p.party_name || "").trim(),
      );
      const hasDefendant = parties.some(
        (p: any) => p.party_type === "defendant" && String(p.party_name || "").trim(),
      );
      const placeholder =
        /^قضية \(من جلسة\)/.test(c.title || "") ||
        /^unknown[_-]?/i.test(String(c.case_number || "")) ||
        /^unknown[_-]?/i.test(c.title || "");
      const court = c.court || d?.court_name;
      const caseType = d?.case_type_detail || d?.case_classification;
      const subject = d?.subject_matter || (placeholder ? null : c.description);
      const circuit = c.circuit_number || d?.circuit_number;
      if (hasPlaintiff || hasDefendant || court || caseType || subject || circuit) set.add(c.id);
    }
    return set;
  }, [cases, caseParties, caseDetails]);

  const isMeaningful = (s: SessionRow) => {
    // The session's own fields (court / circuit) also qualify it.
    if (s.court || s.room) return true;
    return !!(s.case_id && meaningfulCaseIds.has(s.case_id));
  };
  const sessions = useMemo(
    () => {
      const base = filterCaseIds
        ? allSessions.filter((s) => filterCaseIds.has(s.case_id))
        : allSessions;
      return base.filter(isMeaningful);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSessions, filterCaseIds, caseMap, meaningfulCaseIds],
  );

  // ---- Conflict detection: أكثر من جلسة في نفس التاريخ والوقت ----
  const conflictGroups = useMemo(() => {
    const m = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      if (s.status === "cancelled") continue;
      const d = new Date(s.session_date);
      if (isNaN(d.getTime())) continue;
      const key = `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const list = m.get(key);
      if (list) list.push(s);
      else m.set(key, [s]);
    }
    return Array.from(m.entries())
      .filter(([, l]) => l.length > 1)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [sessions]);
  const conflictIds = useMemo(
    () => new Set(conflictGroups.flatMap(([, l]) => l.map((s) => s.id))),
    [conflictGroups],
  );

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<string>(ymd(new Date()));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SessionRow | null>(null);

  const sessionsByDay = useMemo(() => {
    const m: Record<string, SessionRow[]> = {};
    for (const s of sessions) {
      const k = ymd(new Date(s.session_date));
      (m[k] = m[k] || []).push(s);
    }
    return m;
  }, [sessions]);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startWeekday = first.getDay(); // 0=Sun
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: { date: Date | null; key: string }[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null, key: `e${i}` });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      cells.push({ date, key: ymd(date) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, key: `t${cells.length}` });
    return cells;
  }, [cursor]);

  const todayKey = ymd(new Date());
  const selectedSessions = sessionsByDay[selectedDay] ?? [];

  const upcoming = useMemo(() => {
    const now = Date.now();
    return [...sessions]
      .filter((s) => new Date(s.session_date).getTime() >= now && s.status !== "cancelled")
      .sort((a, b) => +new Date(a.session_date) - +new Date(b.session_date))
      .slice(0, 5);
  }, [sessions]);

  const fields: Field[] = [
    {
      name: "case_id",
      label: "القضية",
      type: "select",
      required: true,
      full: true,
      options: cases.map((c) => ({ value: c.id, label: caseLabel(c) })),
    },
    { name: "session_date", label: "تاريخ ووقت الجلسة", type: "datetime-local", required: true },
    {
      name: "status",
      label: "الحالة",
      type: "select",
      options: Object.entries(STATUS).map(([v, { label }]) => ({ value: v, label })),
    },
    { name: "court", label: "المحكمة" },
    { name: "room", label: "القاعة / الدائرة" },
    { name: "notes", label: "ملاحظات", type: "textarea", full: true },
  ];

  const submit = async (v: Record<string, any>) => {
    // datetime-local returns local time without TZ – convert to ISO
    const iso = v.session_date ? new Date(v.session_date).toISOString() : null;
    await upsert.mutateAsync({
      ...editing,
      ...v,
      session_date: iso,
      status: v.status || "scheduled",
    });
    setEditing(null);
  };

  const initialForEdit = editing
    ? {
        ...editing,
        session_date: editing.session_date
          ? new Date(editing.session_date).toISOString().slice(0, 16)
          : "",
      }
    : { session_date: selectedDay ? `${selectedDay}T10:00` : "" };

  return (
    <>
      <PageHeader
        icon={CalendarDays}
        title="مواعيد الجلسات"
        subtitle="أجندة تفاعلية مزامَنة مع ناجز — اضغط أي يوم لعرض تفاصيل الجلسة"
        action={
          <div className="flex flex-wrap gap-2">
            <CalendarModeToggle />
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadICS(sessions, caseMap)}
              className="gap-1.5"
            >
              <Apple className="h-3.5 w-3.5" /> تصدير إلى Apple
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadICS(sessions, caseMap)}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> ملف ICS
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
              className="btn-gold gap-2"
            >
              <Plus className="h-4 w-4" /> جلسة جديدة
            </Button>
          </div>
        }
      />

      {caseFilter && (
        <Card
          className="border border-amber-300 bg-amber-50/60 p-3 mb-4 flex items-center gap-2"
          role="status"
        >
          <Badge className="bg-amber-600">فلترة نشطة</Badge>
          <span className="text-sm">
            عرض جلسات القضية <b>#{caseFilter}</b> ({sessions.length})
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 mr-auto gap-1"
            onClick={() => navigate({ search: {} as any })}
            aria-label="إزالة فلتر القضية"
          >
            <XClear className="h-3.5 w-3.5" /> إزالة الفلتر
          </Button>
        </Card>
      )}

      {conflictGroups.length > 0 && (
        <Card
          className="border-2 border-rose-400/70 bg-rose-50/80 dark:bg-rose-950/30 p-4 mb-4 shadow-lg shadow-rose-500/10"
          role="alert"
          data-testid="sessions-conflict-banner"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600" />
            </span>
            <h3 className="text-sm font-black text-rose-800 dark:text-rose-200">
              تنبيه: تعارض في مواعيد الجلسات ({conflictGroups.length})
            </h3>
          </div>
          <div className="space-y-1.5">
            {conflictGroups.slice(0, 4).map(([key, list]) => (
              <button
                key={key}
                onClick={() => {
                  const d = new Date(list[0].session_date);
                  setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                  setSelectedDay(ymd(d));
                }}
                className="w-full text-right text-xs font-bold text-rose-900 dark:text-rose-100 rounded-lg border border-rose-300/60 bg-white/70 dark:bg-rose-900/20 px-3 py-2 hover:bg-white transition"
              >
                {list.length} جلسات في نفس الموعد — {key}
                <span className="font-semibold text-rose-700 dark:text-rose-300 mr-2">
                  ({list.map((s) => caseMap[s.case_id]?.case_number || "؟").join("، ")})
                </span>
              </button>
            ))}
            {conflictGroups.length > 4 && (
              <p className="text-[11px] font-bold text-rose-700">
                + {conflictGroups.length - 4} تعارضات أخرى
              </p>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Calendar — smaller (2/5) so the day panel gets more room */}
        <Card className="card-3d border-none p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <div className="text-center">
              <div className="text-lg font-extrabold text-gradient-royal">
                {AR_MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </div>
              <button
                onClick={() => {
                  const d = new Date();
                  d.setDate(1);
                  setCursor(d);
                  setSelectedDay(ymd(new Date()));
                }}
                className="text-[11px] text-muted-foreground hover:text-gold transition"
              >
                العودة لليوم
              </button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2 text-center text-[11px] font-bold text-muted-foreground">
            {AR_DAYS.map((d) => (
              <div key={d} className="py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {grid.map((cell) => {
              if (!cell.date) return <div key={cell.key} />;
              const key = ymd(cell.date);
              const list = sessionsByDay[key] ?? [];
              const isToday = key === todayKey;
              const isSelected = key === selectedDay;
              const hasSessions = list.length > 0;
              return (
                <button
                  key={cell.key}
                  onClick={() => setSelectedDay(key)}
                  className={[
                    "group relative aspect-square rounded-xl p-1.5 text-right transition-all duration-200",
                    "border bg-card hover:-translate-y-0.5 hover:shadow-lg",
                    isSelected
                      ? "ring-2 ring-gold shadow-xl scale-[1.03] border-gold/50"
                      : "border-border/60",
                    isToday && !isSelected ? "border-primary/60" : "",
                    hasSessions ? "bg-gradient-to-br from-primary/10 to-transparent" : "",
                  ].join(" ")}
                >
                  <div className={`text-sm font-bold ${isToday ? "text-gold" : ""}`}>
                    {cell.date.getDate()}
                  </div>
                  {hasSessions && (
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-wrap gap-0.5 justify-end">
                      {list.slice(0, 3).map((s) => (
                        <span
                          key={s.id}
                          className="h-1.5 w-1.5 rounded-full bg-gold shadow-md shadow-gold/50"
                        />
                      ))}
                      {list.length > 3 && (
                        <span className="text-[9px] font-bold text-gold">+{list.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Selected day panel */}
        <Card className="card-3d border-none p-5 lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-base text-gradient-royal">جلسات اليوم المحدد</h3>
            <Badge variant="outline" className="text-[10px]">
              {selectedSessions.length}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mb-3">
            {formatDateByMode(selectedDay, calMode, { withWeekday: true })}
          </div>
          {isLoading ? (
            <div className="text-center py-6 text-xs text-muted-foreground">جاري التحميل…</div>
          ) : selectedSessions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground mt-2">لا توجد جلسات في هذا اليوم</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 gap-1.5"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="h-3 w-3" /> أضف جلسة
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedSessions.map((s) => {
                const c = caseMap[s.case_id];
                const cl = c?.client_id ? clientMap[c.client_id] : undefined;
                const t = new Date(s.session_date);
                return (
                  <div
                    key={s.id}
                    className="group rounded-xl border border-border/60 p-3 bg-gradient-to-br from-card to-muted/30 hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-gold">
                        <Clock className="h-4 w-4" />
                        <span className="font-bold text-sm">
                          {pad(t.getHours())}:{pad(t.getMinutes())}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {conflictIds.has(s.id) && (
                          <Badge className="text-[10px] border bg-rose-600 text-white border-rose-700 animate-pulse">
                            ⚠ تعارض
                          </Badge>
                        )}
                        <Badge
                          className={`text-[10px] border ${STATUS[s.status]?.cls || ""}`}
                          variant="outline"
                        >
                          {STATUS[s.status]?.label || s.status}
                        </Badge>
                      </div>
                    </div>
                    {c && (
                      <div className="mt-2">
                        <div className="flex items-center gap-1.5 text-sm font-bold">
                          <Gavel className="h-3.5 w-3.5 text-primary" />
                          {caseLabel(c)}
                        </div>
                        {cl && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            العميل: {cl.full_name}
                          </div>
                        )}
                      </div>
                    )}
                    {(s.court || s.room) && (
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="h-3 w-3" />{" "}
                        {[s.court, s.room].filter(Boolean).join(" – ")}
                      </div>
                    )}
                    {s.notes && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{s.notes}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                      <a href={googleCalendarUrl(s, c)} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]">
                          <CalendarPlus className="h-3 w-3" /> Google
                        </Button>
                      </a>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-[11px]"
                        onClick={() => {
                          setEditing(s);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3 w-3" /> تعديل
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-[11px] text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("حذف الجلسة؟")) del.mutate(s.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" /> حذف
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Upcoming + list */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="card-3d border-none p-5">
          <h3 className="font-bold text-base text-gradient-royal mb-3">
            القادم خلال الأيام المقبلة
          </h3>
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد جلسات قادمة.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((s) => {
                const c = caseMap[s.case_id];
                const t = new Date(s.session_date);
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      const d = new Date(s.session_date);
                      setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                      setSelectedDay(ymd(d));
                    }}
                    className="w-full text-right rounded-lg border border-border/60 p-2.5 hover:bg-muted/40 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateByMode(t, calMode, { withTime: true })}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${STATUS[s.status]?.cls || ""}`}
                      >
                        {STATUS[s.status]?.label}
                      </Badge>
                    </div>
                    <div className="text-xs font-bold mt-1">
                      {c ? caseLabel(c) : "—"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="card-3d border-none p-5 lg:col-span-2">
          <h3 className="font-bold text-base text-gradient-royal mb-3">جميع الجلسات</h3>
          <DataTable
            rows={sessions as any}
            columns={[
              {
                key: "session_date",
                header: "التاريخ",
                render: (r: any) => formatDateByMode(r.session_date, calMode, { withTime: true }),
              },
              {
                key: "case",
                header: "القضية",
                render: (r: any) => {
                  const c = caseMap[r.case_id];
                  return c ? caseLabel(c) : "—";
                },
              },
              { key: "court", header: "المحكمة" },
              {
                key: "status",
                header: "الحالة",
                render: (r: any) => (
                  <Badge variant="outline" className={`text-[10px] ${STATUS[r.status]?.cls || ""}`}>
                    {STATUS[r.status]?.label}
                  </Badge>
                ),
              },
            ]}
            onEdit={(r: any) => {
              setEditing(r);
              setOpen(true);
            }}
            onDelete={(r: any) => del.mutate(r.id)}
            emptyTitle="لا توجد جلسات — استورد عبر إضافة ناجز أو أضفها يدوياً"
          />
        </Card>
      </div>

      <CrudDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
        title={editing ? "تعديل جلسة" : "جلسة جديدة"}
        fields={fields}
        initial={initialForEdit as any}
        onSubmit={submit}
        loading={upsert.isPending}
      />
    </>
  );
}
