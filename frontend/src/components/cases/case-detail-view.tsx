import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  Users,
  Calendar,
  Gavel,
  FileText,
  Pencil,
  Save,
  Loader2,
  ExternalLink,
  Upload,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { pickField, parseBlob, looksLikeBlob } from "@/lib/najiz-parse";
import { buildCaseView, formatDate, LABEL_AR, STATUS_LABEL } from "@/lib/cases-view";

export interface CaseDetailViewProps {
  caseData: any;
  details: any;
  parties: any[];
  sessions: any[];
  judgments: any[];
  requests: any[];
  onSave: (row: Record<string, unknown>) => Promise<unknown> | unknown;
  onNavigateDocs: () => void;
  onNavigateSessions: () => void;
  onNavigateRequests: () => void;
}

export function CaseDetailView({
  caseData,
  details,
  parties,
  sessions,
  judgments,
  requests,
  onSave,
  onNavigateDocs,
  onNavigateSessions,
  onNavigateRequests,
}: CaseDetailViewProps) {
  const [activeTab, setActiveTab] = useState("info");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [navBusy, setNavBusy] = useState<null | "docs" | "sessions" | "requests" | "memos">(null);
  const qc = useQueryClient();

  const go = (which: "docs" | "sessions" | "requests" | "memos", fn: () => void) => {
    setNavBusy(which);
    try {
      fn();
    } finally {
      setTimeout(() => setNavBusy(null), 600);
    }
  };

  const v = buildCaseView(caseData, details, parties, sessions, judgments);
  const plaintiffs = parties.filter((p: any) => p.party_type === "plaintiff");
  const defendants = parties.filter((p: any) => p.party_type === "defendant");

  const startEdit = () => {
    setForm({
      title: (caseData.title && !looksLikeBlob(caseData.title) ? caseData.title : "") || "",
      court: v.court || "",
      circuit_number: v.circuit || "",
      plaintiff_name: v.plaintiffNames || "",
      defendant_name: v.defendantNames || "",
      deed_number: caseData.deed_number || "",
      description: caseData.description || "",
    });
    setEditing(true);
  };
  const saveEdit = async () => {
    try {
      await onSave({ ...caseData, ...form });
      setEditing(false);
    } catch {
      /* toast in hook */
    }
  };

  const handleUploadJudgmentDoc = (judgmentId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,image/png,image/jpeg,image/webp";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) return toast.error("حجم الملف يتجاوز 50 ميجابايت");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return toast.error("غير مسجل دخول");
      const ext =
        (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
      const path = `${user.id}/judgments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      toast.info("جارٍ رفع المستند...");
      const { error: upErr } = await (supabase as any).storage
        .from("judgment-documents")
        .upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
      if (upErr) return toast.error(`فشل الرفع: ${upErr.message}`);
      const { error: dbErr } = await (supabase as any)
        .from("case_judgments")
        .update({ judgment_document_url: path })
        .eq("id", judgmentId);
      if (dbErr) return toast.error(`فشل حفظ المرجع: ${dbErr.message}`);
      qc.invalidateQueries({ queryKey: ["case_judgments"] });
      toast.success("تم رفع مستند صك الحكم وحفظه بنجاح");
    };
    input.click();
  };

  const handlePreviewDoc = async (stored: string) => {
    try {
      if (/^https?:\/\//.test(stored)) {
        const m = stored.match(/judgment-documents\/(.+)$/);
        if (m) {
          const { data } = await (supabase as any).storage
            .from("judgment-documents")
            .createSignedUrl(decodeURIComponent(m[1]), 3600);
          if (data?.signedUrl) return window.open(data.signedUrl, "_blank");
        }
        return window.open(stored, "_blank");
      }
      const { data, error } = await (supabase as any).storage
        .from("judgment-documents")
        .createSignedUrl(stored, 3600);
      if (error || !data?.signedUrl) return toast.error("تعذّر إنشاء رابط المعاينة");
      window.open(data.signedUrl, "_blank");
    } catch {
      toast.error("تعذّر فتح المستند");
    }
  };

  const tabs = [
    { id: "info", label: "معلومات القضية", icon: BookOpen },
    { id: "parties", label: `أطراف الدعوى (${parties.length})`, icon: Users },
    { id: "sessions", label: `الجلسات (${sessions.length})`, icon: Calendar },
    { id: "judgments", label: `الأحكام (${judgments.length})`, icon: Gavel },
    { id: "requests", label: `الطلبات (${requests.length})`, icon: FileText },
  ];

  return (
    <ScrollArea className="flex-1 -mx-2">
      <div className="px-2 space-y-4 pb-4">
        <div className="flex items-center justify-between gap-2 border-b pb-2">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                data-testid={`case-detail-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? "bg-[#c9a227]/15 text-[#8a6a1a] border border-[#c9a227]/30" : "text-muted-foreground hover:bg-muted"}`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === "info" && !editing && (
            <Button
              data-testid="case-edit-btn"
              size="sm"
              variant="outline"
              className="h-8 text-[11px] gap-1 shrink-0 rounded-full border-[#c9a227]/40"
              onClick={startEdit}
            >
              <Pencil className="h-3 w-3" /> تعديل البيانات
            </Button>
          )}
        </div>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="أزرار الانتقال للأقسام المرتبطة"
        >
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-full border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            onClick={() => go("docs", onNavigateDocs)}
            disabled={navBusy !== null}
            aria-label={`عرض الأحكام المرتبطة بالقضية ${v.caseNumber}${judgments.length ? ` (${judgments.length})` : " — لا توجد أحكام مسحوبة"}`}
            data-testid="case-goto-judgments-btn"
          >
            {navBusy === "docs" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Gavel className="h-3.5 w-3.5" />
            )}
            الاطلاع على الأحكام{" "}
            {judgments.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                {judgments.length}
              </Badge>
            )}
            <ExternalLink className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-full border-blue-300 text-blue-800 hover:bg-blue-50"
            onClick={() => go("memos", onNavigateDocs)}
            disabled={navBusy !== null}
            aria-label="عرض المذكرات وصحيفة الدعوى ومحاضر الجلسات"
            data-testid="case-goto-memos-btn"
          >
            {navBusy === "memos" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            الاطلاع على المذكرات وصحيفة الدعوى ومحضر الجلسة <ExternalLink className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-full border-amber-300 text-amber-800 hover:bg-amber-50"
            onClick={() => go("sessions", onNavigateSessions)}
            disabled={navBusy !== null}
            aria-label={`عرض مواعيد الجلسات${sessions.length ? ` (${sessions.length})` : " — لا توجد جلسات"}`}
            data-testid="case-goto-sessions-btn"
          >
            {navBusy === "sessions" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Calendar className="h-3.5 w-3.5" />
            )}
            مواعيد الجلسات{" "}
            {sessions.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                {sessions.length}
              </Badge>
            )}
            <ExternalLink className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-full border-purple-300 text-purple-800 hover:bg-purple-50"
            onClick={() => go("requests", onNavigateRequests)}
            disabled={navBusy !== null}
            aria-label={`عرض الطلبات المرتبطة${requests.length ? ` (${requests.length})` : " — لا توجد طلبات"}`}
            data-testid="case-goto-requests-btn"
          >
            {navBusy === "requests" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            الطلبات على القضية{" "}
            {requests.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                {requests.length}
              </Badge>
            )}
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>

        {activeTab === "info" && !editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-4 bg-gradient-to-l from-amber-50/60 to-transparent rounded-xl border border-amber-200/40">
              <InfoField label="رقم القضية" value={v.caseNumber} testId="detail-case-number" />
              <InfoField label="تاريخ القضية" value={formatDate(v.caseDate)} />
              <InfoField label="تصنيف القضية" value={v.classification} />
              <InfoField label="نوع القضية" value={v.typeDetail} />
              <InfoField label="المحكمة" value={v.court} />
              <InfoField label="رقم الدائرة" value={v.circuit} />
              {(v as any).degree && <InfoField label="درجة التقاضي" value={(v as any).degree} />}
              <InfoField label="تاريخ القيد" value={formatDate(v.registeredAt)} />
              <InfoField label="الحالة" value={STATUS_LABEL[caseData.status] || "مفتوحة"} />
              {v.deedNumber && <InfoField label="رقم الصك / الحكم" value={v.deedNumber} />}
              {v.deedDate && <InfoField label="تاريخ الصك" value={formatDate(v.deedDate)} />}
              <InfoField label="المدعي" value={v.plaintiffNames} />
              <InfoField label="المدعى عليه" value={v.defendantNames} />
            </div>
            <LongField
              label="موضوع الدعوى"
              value={v.subjectMatter}
              testId="detail-subject-matter"
            />
            <LongField
              label="طلبات المدعي"
              value={v.plaintiffRequests}
              testId="detail-plaintiff-requests"
            />
            <LongField
              label="أسانيد الدعوى / الدفاع الأول"
              value={v.caseFoundations}
              testId="detail-case-foundations"
            />
          </div>
        )}

        {activeTab === "info" && editing && (
          <div className="space-y-3" data-testid="case-edit-form">
            <div className="grid grid-cols-2 gap-3">
              <EditField
                label="عنوان القضية"
                value={form.title}
                onChange={(x) => setForm({ ...form, title: x })}
                testId="edit-title"
              />
              <EditField
                label="المحكمة"
                value={form.court}
                onChange={(x) => setForm({ ...form, court: x })}
                testId="edit-court"
              />
              <EditField
                label="رقم الدائرة"
                value={form.circuit_number}
                onChange={(x) => setForm({ ...form, circuit_number: x })}
                testId="edit-circuit"
              />
              <EditField
                label="رقم الصك"
                value={form.deed_number}
                onChange={(x) => setForm({ ...form, deed_number: x })}
                testId="edit-deed"
              />
              <EditField
                label="اسم المدعي"
                value={form.plaintiff_name}
                onChange={(x) => setForm({ ...form, plaintiff_name: x })}
                testId="edit-plaintiff"
              />
              <EditField
                label="اسم المدعى عليه"
                value={form.defendant_name}
                onChange={(x) => setForm({ ...form, defendant_name: x })}
                testId="edit-defendant"
              />
            </div>
            <div>
              <span className="text-[11px] font-black text-[#5a4510] block mb-1">
                ملاحظات / وصف
              </span>
              <Textarea
                data-testid="edit-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="min-h-[80px] text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                data-testid="case-edit-save-btn"
                size="sm"
                className="h-9 gap-1.5 rounded-full bg-[#8a6a1a] hover:bg-[#6d5415]"
                onClick={saveEdit}
              >
                <Save className="h-3.5 w-3.5" /> حفظ التعديلات
              </Button>
              <Button
                data-testid="case-edit-cancel-btn"
                size="sm"
                variant="outline"
                className="h-9 rounded-full"
                onClick={() => setEditing(false)}
              >
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {activeTab === "parties" && (
          <div className="space-y-4" data-testid="case-parties-panel">
            <div>
              <h4 className="text-sm font-black text-emerald-800 mb-2 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" /> قائمة المدعين (
                {plaintiffs.length})
              </h4>
              {plaintiffs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  لا توجد بيانات — شغّل المزامنة المعمقة من الإضافة
                </p>
              ) : (
                plaintiffs.map((p: any, i: number) => (
                  <Card key={i} className="p-3 mb-2 border-emerald-200/60 bg-emerald-50/40">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <InfoField
                        label="الاسم"
                        value={pickField(p.party_name, "plaintiff") || p.party_name}
                      />
                      <InfoField label="الصفة" value={p.party_capacity} />
                      <InfoField label="الجنسية" value={p.party_nationality} />
                      <InfoField label="نوع الهوية" value={p.party_identity_type} />
                      <InfoField label="رقم الهوية" value={p.party_id_number} />
                      <InfoField label="الحالة في الدعوى" value={p.party_status_in_case} />
                    </div>
                  </Card>
                ))
              )}
            </div>
            <Separator />
            <div>
              <h4 className="text-sm font-black text-rose-800 mb-2 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-rose-500" /> قائمة المدعى عليهم (
                {defendants.length})
              </h4>
              {defendants.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا توجد بيانات</p>
              ) : (
                defendants.map((p: any, i: number) => (
                  <Card key={i} className="p-3 mb-2 border-rose-200/60 bg-rose-50/40">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <InfoField
                        label="الاسم"
                        value={pickField(p.party_name, "defendant") || p.party_name}
                      />
                      <InfoField label="الصفة" value={p.party_capacity} />
                      <InfoField label="الجنسية" value={p.party_nationality} />
                      <InfoField label="نوع الهوية" value={p.party_identity_type} />
                      <InfoField label="رقم الهوية" value={p.party_id_number} />
                      <InfoField label="الحالة في الدعوى" value={p.party_status_in_case} />
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "sessions" && <SessionsPanel sessions={sessions} />}

        {activeTab === "judgments" && (
          <div className="space-y-3" data-testid="case-judgments-panel">
            <h4 className="text-sm font-black text-[#8a6a1a]">
              تفاصيل الأحكام ({judgments.length})
            </h4>
            {judgments.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد أحكام مسحوبة لهذه القضية</p>
            ) : (
              judgments.map((j: any, i: number) => (
                <Card
                  key={i}
                  className="p-4 border-emerald-200/50 bg-gradient-to-l from-emerald-50/50 to-transparent"
                >
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <InfoField label="نهائي / غير قطعي" value={j.judgment_finality} />
                    <InfoField label="رقم الصك" value={j.deed_number} />
                    <InfoField
                      label="تاريخ صك الحكم"
                      value={j.deed_date ? formatDate(j.deed_date) : null}
                    />
                    <InfoField label="المحكمة" value={j.court_name} />
                    <InfoField label="الدائرة" value={j.circuit_number} />
                    <InfoField label="الدرجة" value={j.degree} />
                    <InfoField
                      label="تاريخ صك الاستئناف"
                      value={j.appeal_deed_date ? formatDate(j.appeal_deed_date) : null}
                    />
                    <InfoField label="رقم دائرة الاستئناف" value={j.appeal_circuit_number} />
                  </div>
                  {j.judgment_details && (
                    <div className="mt-2 p-2.5 bg-muted/40 rounded-lg text-xs font-medium text-[#1f1810] leading-relaxed whitespace-pre-wrap">
                      {j.judgment_details}
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button
                      data-testid={`judgment-upload-btn-${i}`}
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px] gap-1 rounded-full border-[#c9a227]/40"
                      onClick={() => handleUploadJudgmentDoc(j.id)}
                    >
                      <Upload className="h-3 w-3" /> رفع مستند صك الحكم
                    </Button>
                    {j.judgment_document_url && (
                      <Button
                        data-testid={`judgment-preview-btn-${i}`}
                        size="sm"
                        variant="outline"
                        className="h-8 text-[11px] gap-1 rounded-full border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        onClick={() => handlePreviewDoc(j.judgment_document_url)}
                      >
                        <Eye className="h-3 w-3" /> معاينة المستند
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "requests" && (
          <div className="space-y-3" data-testid="case-requests-panel">
            <h4 className="text-sm font-black text-[#8a6a1a]">
              الطلبات على القضية ({requests.length})
            </h4>
            {requests.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد طلبات مسحوبة لهذه القضية</p>
            ) : (
              requests.map((r: any, i: number) => (
                <Card
                  key={i}
                  className="p-4 border-purple-200/50 bg-gradient-to-l from-purple-50/50 to-transparent"
                >
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <InfoField label="رقم القضية" value={r.case_number} />
                    <InfoField
                      label="تاريخ القضية"
                      value={r.case_date ? formatDate(r.case_date) : null}
                    />
                    <InfoField label="المحكمة" value={r.court_name} />
                    <InfoField label="الدائرة" value={r.circuit_number} />
                    <InfoField label="حالة القضية" value={r.case_status} />
                    <InfoField label="تصنيف القضية" value={r.case_classification} />
                    <InfoField label="نوع القضية" value={r.case_type_detail} />
                    <InfoField label="نوع الطلب" value={r.request_type} />
                    <InfoField label="بيانات مقدم الطلب" value={r.applicant_name} />
                    <InfoField label="رقم الحكم" value={r.judgment_number} />
                  </div>
                  {r.submissions && (
                    <div className="mt-2">
                      <span className="text-[10px] font-black text-[#5a4510]">التسبيبات:</span>
                      <div className="p-2.5 bg-muted/40 rounded-lg text-xs mt-1 font-medium leading-relaxed whitespace-pre-wrap">
                        {r.submissions}
                      </div>
                    </div>
                  )}
                  {r.request_reasons && (
                    <div className="mt-2">
                      <span className="text-[10px] font-black text-[#5a4510]">أسباب الطلب:</span>
                      <div className="p-2.5 bg-muted/40 rounded-lg text-xs mt-1 font-medium leading-relaxed whitespace-pre-wrap">
                        {r.request_reasons}
                      </div>
                    </div>
                  )}
                  {[1, 2, 3, 4, 5, 6].map((n) => {
                    const reason = (r as any)[`reason_${n}`];
                    if (!reason) return null;
                    const labels = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];
                    return (
                      <div key={n} className="mt-1.5">
                        <span className="text-[10px] font-black text-[#5a4510]">
                          السبب {labels[n - 1]}:
                        </span>
                        <div className="p-2.5 bg-muted/30 rounded-lg text-[11px] mt-0.5 font-medium leading-relaxed">
                          {reason}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

/** Sessions tab: كل جلسات القضية مقسمة إلى قادمة (تصاعدياً) وسابقة (تنازلياً). */
function SessionsPanel({ sessions }: { sessions: any[] }) {
  const now = Date.now();
  const hasDate = (s: any) => s.session_date && !isNaN(new Date(s.session_date).getTime());
  const dated = sessions.filter(hasDate);
  const undated = sessions.filter((s) => !hasDate(s));
  const upcoming = dated
    .filter((s) => new Date(s.session_date).getTime() >= now)
    .sort((a, b) => +new Date(a.session_date) - +new Date(b.session_date));
  const past = dated
    .filter((s) => new Date(s.session_date).getTime() < now)
    .sort((a, b) => +new Date(b.session_date) - +new Date(a.session_date));

  if (sessions.length === 0) {
    return (
      <div className="space-y-3" data-testid="case-sessions-panel">
        <h4 className="text-sm font-black text-[#8a6a1a]">تفاصيل الجلسات (0)</h4>
        <p className="text-xs text-muted-foreground">لا توجد جلسات مرتبطة بهذه القضية</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="case-sessions-panel">
      <div>
        <h4 className="text-sm font-black text-blue-800 mb-2 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          الجلسات القادمة ({upcoming.length})
        </h4>
        {upcoming.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد جلسات قادمة لهذه القضية</p>
        ) : (
          upcoming.map((s: any, i: number) => <SessionDetailCard key={`u-${i}`} s={s} upcoming />)
        )}
      </div>
      <Separator />
      <div>
        <h4 className="text-sm font-black text-[#8a6a1a] mb-2 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#c9a227]" />
          الجلسات السابقة ({past.length + undated.length})
        </h4>
        {past.length + undated.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد جلسات سابقة</p>
        ) : (
          [...past, ...undated].map((s: any, i: number) => (
            <SessionDetailCard key={`p-${i}`} s={s} />
          ))
        )}
      </div>
    </div>
  );
}

function SessionDetailCard({ s, upcoming }: { s: any; upcoming?: boolean }) {
  return (
    <Card
      className={`p-4 mb-2 ${
        upcoming
          ? "border-blue-300/60 bg-gradient-to-l from-blue-50/60 to-transparent"
          : "border-[#c9a227]/25 bg-gradient-to-l from-amber-50/50 to-transparent"
      }`}
    >
      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoField label="حالة الجلسة" value={s.session_status} />
        <InfoField label="المحكمة" value={s.court_name} />
        <InfoField label="الدائرة" value={s.circuit_number} />
        <InfoField label="آلية الانعقاد" value={s.mechanism} />
        <InfoField label="الدرجة" value={s.degree} />
        <InfoField label="التاريخ" value={s.session_date ? formatDate(s.session_date) : null} />
        <InfoField label="الوقت" value={s.session_time} />
        {s.__manual ? <InfoField label="المصدر" value="مُدخلة يدوياً" /> : null}
      </div>
      {s.session_details && (
        <div className="mt-2 p-2.5 bg-muted/40 rounded-lg text-xs font-medium text-[#1f1810] leading-relaxed whitespace-pre-wrap">
          {s.session_details}
        </div>
      )}
    </Card>
  );
}

function InfoField({ label, value, testId }: { label: string; value: any; testId?: string }) {
  if (typeof value === "string" && looksLikeBlob(value)) {
    const parsed = parseBlob(value);
    const entries = Object.entries(parsed);
    return (
      <div data-testid={testId} className="col-span-2">
        <span className="text-[10px] font-black text-[#7a6a4a] block mb-1">{label}</span>
        <div className="grid grid-cols-2 gap-1.5">
          {entries.map(([k, val]) => (
            <div key={k} className="text-[11px]">
              <span className="text-[9px] font-bold text-[#8a6a1a] block">{LABEL_AR[k] || k}</span>
              <span className="font-bold text-[#1f1810]">{val}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div data-testid={testId}>
      <span className="text-[10px] font-black text-[#7a6a4a] block">{label}</span>
      <span
        className={`text-xs font-bold leading-relaxed ${value ? "text-[#1f1810]" : "text-muted-foreground/60"}`}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function LongField({ label, value, testId }: { label: string; value: any; testId?: string }) {
  const isBlob = typeof value === "string" && looksLikeBlob(value);
  return (
    <div data-testid={testId}>
      <h5 className="text-[12px] font-black text-[#8a6a1a] mb-1.5 flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 rounded-full bg-[#c9a227]" />
        {label}
      </h5>
      {value ? (
        isBlob ? (
          <div className="p-3.5 bg-[#faf8f2] border border-[#e8dfc8] rounded-xl space-y-2">
            {Object.entries(parseBlob(value)).map(([k, val]) => (
              <div key={k} className="pb-2 border-b border-[#e8dfc8]/50 last:border-none last:pb-0">
                <div className="text-[10px] font-black text-[#8a6a1a] mb-0.5">
                  {LABEL_AR[k] || k}
                </div>
                <div className="text-[13px] font-medium text-[#1f1810] leading-[1.9] whitespace-pre-wrap">
                  {val}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3.5 bg-[#faf8f2] border border-[#e8dfc8] rounded-xl text-[13px] font-medium text-[#1f1810] leading-[1.9] whitespace-pre-wrap">
            {value}
          </div>
        )
      ) : (
        <div className="p-3 bg-muted/30 border border-dashed border-border rounded-xl text-xs text-muted-foreground">
          لم يتم سحب هذه البيانات بعد — شغّل المزامنة المعمقة من إضافة ناجز
        </div>
      )}
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <div>
      <span className="text-[11px] font-black text-[#5a4510] block mb-1">{label}</span>
      <Input
        data-testid={testId}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-sm"
      />
    </div>
  );
}
