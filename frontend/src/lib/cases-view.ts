import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";
import { pickField, pickFirst, looksLikeBlob, extractCaseNumber } from "@/lib/najiz-parse";

export const STATUS_LABEL: Record<string, string> = {
  open: "مفتوحة",
  in_study: "قيد الدراسة",
  appealed: "مستأنفة",
  postponed: "مؤجلة",
  closed_non_final: "محكوم بها بحكم غير نهائي",
  closed_final: "محكوم بها بحكم نهائي",
  closed: "مغلقة",
  archived: "مؤرشفة",
};

export const STATUS_COLORS: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-800 border-emerald-500/40",
  in_study: "bg-blue-500/15 text-blue-800 border-blue-500/40",
  appealed: "bg-purple-500/15 text-purple-800 border-purple-500/40",
  postponed: "bg-amber-500/15 text-amber-800 border-amber-500/40",
  closed_non_final: "bg-orange-500/15 text-orange-800 border-orange-500/40",
  closed_final: "bg-teal-500/15 text-teal-800 border-teal-500/40",
  closed: "bg-gray-500/15 text-gray-700 border-gray-500/40",
  archived: "bg-slate-500/15 text-slate-700 border-slate-500/40",
};

export const TRANSFER_LABELS: Record<string, string> = {
  executions: "طلبات التنفيذ",
  powers_of_attorney: "الوكالات القضائية",
  documents_archive: "أرشيف المستندات والأحكام",
};

export const LABEL_AR: Record<string, string> = {
  classification: "تصنيف القضية",
  type: "نوع القضية",
  caseDate: "تاريخ القضية",
  subject: "موضوع الدعوى",
  firstDefense: "مذكرة الدفاع الأول",
  parties: "أطراف الدعوى",
  sessions: "الجلسات",
  judgments: "الأحكام",
  requests: "الطلبات",
  procedures: "الإجراءات",
  decisions: "القرارات",
  costs: "التكاليف القضائية",
  attachments: "المرفقات",
  plaintiff: "المدعي",
  defendant: "المدعى عليه",
  court: "المحكمة",
  circuit: "الدائرة",
  status: "الحالة",
  registeredAt: "تاريخ القيد",
  deedNumber: "رقم الصك",
  deedDate: "تاريخ الصك",
};

export const casesSearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  // Deep-link param: opens the matching case's detail dialog automatically.
  case: fallback(z.string(), "").default(""),
  party: fallback(z.string(), "").default(""),
  status: fallback(z.string(), "__all__").default("__all__"),
  classification: fallback(z.string(), "__all__").default("__all__"),
  archived: fallback(z.boolean(), false).default(false),
  sort: fallback(z.enum(["registered", "case_number", "completeness"]), "completeness").default(
    "completeness",
  ),
  dir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
  view: fallback(z.enum(["grid", "list"]), "grid").default("grid"),
  page: fallback(z.number().int().min(1), 1).default(1),
  pageSize: fallback(z.number().int().min(5).max(100), 12).default(12),
});

export type CasesSearch = z.infer<typeof casesSearchSchema>;

export function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return String(dateStr);
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return String(dateStr);
  }
}

// Placeholder rows synthesized from sessions/bot ("قضية (من جلسة) — unknown_…")
// and English enum values must never surface as display values.
const PLACEHOLDER_RE = /^قضية \(من جلسة\)|^unknown[_-]?/i;
const ENUM_JUNK = new Set([
  "other",
  "labor",
  "civil",
  "commercial",
  "criminal",
  "family",
  "administrative",
  "general",
  "unknown",
]);

function usable(v: any): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  if (PLACEHOLDER_RE.test(s)) return undefined;
  if (ENUM_JUNK.has(s.toLowerCase())) return undefined;
  return s;
}

/** Reject over-long values that indicate a mis-sliced blob leaked through. */
function capped(v: string | null | undefined, max: number): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s.length > max) return null;
  return s;
}

export function buildCaseView(
  c: any,
  details: any,
  parties: any[],
  caseSessions: any[],
  judgments: any[],
) {
  const plaintiffs = parties.filter((p: any) => p.party_type === "plaintiff");
  const defendants = parties.filter((p: any) => p.party_type === "defendant");

  const partiesJoin = (arr: any[]) =>
    arr
      .map(
        (p: any) =>
          pickField(p.party_name, "plaintiff") ||
          pickField(p.party_name, "defendant") ||
          pickField(p.party_name, "parties") ||
          p.party_name,
      )
      .filter(Boolean)
      .join("، ");

  const plaintiffFromParties = partiesJoin(plaintiffs);
  const defendantFromParties = partiesJoin(defendants);

  const firstJudgment = judgments[0];
  const upcoming = caseSessions
    .filter((s: any) => s.session_date && new Date(s.session_date) >= new Date())
    .sort(
      (a: any, b: any) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime(),
    );

  const classification = capped(
    pickFirst(
      "classification",
      usable(details?.case_classification),
      usable(c.case_classification),
    ),
    90,
  );
  const typeDetail = capped(
    pickFirst(
      "type",
      usable(details?.case_type_detail),
      usable(c.case_type_name),
      usable(c.case_type),
      usable(details?.case_classification),
    ),
    140,
  );
  const court = capped(
    pickFirst(
      "court",
      usable(details?.court_name),
      usable(c.court),
      usable(firstJudgment?.court_name),
      usable(caseSessions[0]?.court_name),
    ),
    100,
  );
  const circuit = capped(
    pickFirst(
      "circuit",
      usable(details?.circuit_number),
      usable(c.circuit_number),
      usable(firstJudgment?.circuit_number),
      usable(caseSessions[0]?.circuit_number),
    ),
    60,
  );
  const degree = capped(
    usable(c.degree) || usable(details?.degree) || usable(firstJudgment?.degree) || null,
    60,
  );
  const subjectMatter = pickFirst(
    "subject",
    usable(details?.subject_matter),
    usable(c.subject_matter),
    usable(c.case_subject),
    usable(c.description),
  );
  const plaintiffRequests = pickFirst(
    "requests",
    details?.plaintiff_requests,
    c.plaintiff_requests,
  );
  const caseFoundations = pickFirst(
    "firstDefense",
    details?.case_foundations,
    c.case_foundations,
    c.case_grounds,
  );
  const caseDate = pickFirst(
    "caseDate",
    usable(details?.case_date),
    usable(c.case_date),
    usable(c.case_date_hijri),
  );
  const titleForParties =
    usable(c.title) && /المدعي/.test(String(c.title)) ? c.title : undefined;
  const plaintiffNames =
    plaintiffFromParties || pickFirst("plaintiff", usable(c.plaintiff_name), titleForParties) || "";
  const defendantNames =
    defendantFromParties || pickFirst("defendant", usable(c.defendant_name), titleForParties) || "";
  const rawDeed = firstJudgment?.deed_number || c.deed_number || c.judgment_number || null;
  const deedNumber = rawDeed
    ? String(rawDeed).trim().length > 30
      ? extractCaseNumber(String(rawDeed))
      : String(rawDeed).trim()
    : null;
  const deedDate = firstJudgment?.deed_date || c.deed_date || c.judgment_date || null;

  const rawTitle = c.title && !looksLikeBlob(c.title) && usable(c.title) ? c.title : null;
  const title =
    rawTitle ||
    (plaintiffNames && defendantNames ? `${plaintiffNames} ضد ${defendantNames}` : null) ||
    (typeDetail ? typeDetail.slice(0, 80) : null) ||
    `قضية ${extractCaseNumber(c.case_number) || c.case_number}`;

  return {
    caseNumber: extractCaseNumber(c.case_number) || c.case_number,
    caseDate,
    registeredAt: c.opened_at || null,
    classification,
    typeDetail,
    court,
    circuit,
    degree,
    subjectMatter,
    plaintiffRequests,
    caseFoundations,
    plaintiffNames,
    defendantNames,
    plaintiffs,
    defendants,
    deedNumber,
    deedDate,
    nextSession: upcoming[0] || null,
    title,
  };
}

export type CaseView = ReturnType<typeof buildCaseView>;

export function completenessScore(v: CaseView) {
  let n = 0;
  if (v.plaintiffNames) n += 2;
  if (v.defendantNames) n += 2;
  if (v.court) n++;
  if (v.circuit) n++;
  if (v.classification) n++;
  if (v.typeDetail) n++;
  if (v.deedNumber) n++;
  if (v.subjectMatter) n++;
  if (v.nextSession) n++;
  return n;
}
