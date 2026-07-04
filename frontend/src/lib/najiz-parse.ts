// Utility to sanitize concatenated Najiz text blobs (display-only).
// Backed by the space-insensitive engine in najiz-normalize.ts so labels are
// recognised even when the scraper strips ALL whitespace, e.g.:
//   "4570242787تصنيفالقضيةالعمالةالعاديةنوعالقضيةإنهاءالعلاقةالعمالية..."
// It also handles "value-first" columns where the ingested cell holds its own
// value followed by the remainder of the page:
//   case_classification = "العمالة العادية نوع القضية إنهاء العلاقة..."

import {
  type LabelDef,
  findLabelHits,
  smartSlice,
  slicesToMap,
  cleanValue,
  deglueForDisplay,
  extractLongNumber,
  stripJunk,
  stripNavRuns,
} from "@/lib/najiz-normalize";

// Order matters only for tie-breaking; matching itself is longest-first and
// whitespace-insensitive (aliases in spaced form match glued text too).
export const NAJIZ_LABELS: LabelDef[] = [
  { key: "classification", aliases: ["تصنيف القضية", "تصنيف الدعوى"] },
  { key: "type", aliases: ["نوع القضية", "نوع الدعوى"] },
  { key: "caseDate", aliases: ["تاريخ القضية"] },
  { key: "subject", aliases: ["موضوع الدعوى", "موضوع الدعوي", "موضوع القضية"] },
  { key: "firstDefense", aliases: ["مذكرة الدفاع الأولى", "مذكرة الدفاع الأول", "الدفاع الأول"] },
  { key: "parties", aliases: ["أطراف الدعوى", "أطراف الدعوي", "أطراف القضية"] },
  { key: "sessions", aliases: ["الجلسات"] },
  { key: "judgments", aliases: ["الأحكام"] },
  { key: "requests", aliases: ["الطلبات"] },
  { key: "procedures", aliases: ["الإجراءات", "الاجراءات"] },
  { key: "decisions", aliases: ["القرارات"] },
  { key: "costs", aliases: ["التكاليف القضائية"] },
  { key: "attachments", aliases: ["المرفقات"] },
  { key: "defendant", aliases: ["المدعى عليه", "المدعي عليه", "المدعى عليها", "المدعي عليها"] },
  { key: "plaintiff", aliases: ["المدعي", "المدعى", "المدعية"] },
  { key: "court", aliases: ["المحكمة"] },
  { key: "circuit", aliases: ["الدائرة", "رقم الدائرة"] },
  { key: "status", aliases: ["الحالة", "حالة القضية", "حالة الدعوى"] },
  { key: "registeredAt", aliases: ["تاريخ القيد"] },
  { key: "deedNumber", aliases: ["رقم الصك", "صك الحكم", "رقم الحكم"] },
  { key: "deedDate", aliases: ["تاريخ الصك"] },
  { key: "judge", aliases: ["القاضي", "اسم القاضي", "القاضي المسؤول"] },
  { key: "agent", aliases: ["الوكيل", "اسم الوكيل"] },
  { key: "poaNumber", aliases: ["رقم الوكالة"] },
  { key: "amount", aliases: ["المبلغ", "قيمة المطالبة"] },
  { key: "address", aliases: ["العنوان"] },
  { key: "identity", aliases: ["رقم الهوية", "الهوية"] },
  { key: "idType", aliases: ["نوع الهوية"] },
  { key: "capacity", aliases: ["الصفة"] },
  { key: "nationality", aliases: ["الجنسية"] },
  { key: "nextSession", aliases: ["تاريخ الجلسة القادمة", "الجلسة القادمة"] },
  { key: "sessionStatus", aliases: ["حالة الجلسة"] },
  { key: "judgmentType", aliases: ["نوع الحكم"] },
  { key: "executionNumber", aliases: ["رقم التنفيذ", "رقم طلب التنفيذ"] },
  { key: "executionDate", aliases: ["تاريخ التنفيذ"] },
  { key: "degree", aliases: ["الدرجة", "درجة التقاضي"] },
  { key: "mechanism", aliases: ["آلية الانعقاد"] },
  { key: "issuerEntity", aliases: ["جهة الإصدار", "جهة الاصدار"] },
  { key: "usageMethod", aliases: ["كيفية الاستخدام"] },
  { key: "poaIssueDate", aliases: ["تاريخ إصدار الوكالة", "تاريخ اصدار الوكالة"] },
  { key: "poaExpiryDate", aliases: ["تاريخ انتهاء الوكالة", "تاريخ إنتهاء الوكالة"] },
  { key: "poaStatus", aliases: ["حالة الوكالة"] },
  { key: "najizRef", aliases: ["معرف ناجز", "معرّف ناجز"] },
];

// Keys whose sliced values are page-chrome, never real content.
const SECTION_ONLY_KEYS = new Set([
  "sessions",
  "judgments",
  "requests",
  "procedures",
  "decisions",
  "costs",
  "attachments",
  "parties",
  "firstDefense",
]);

const MAX_VALUE_LEN = 400;

// Keys whose values are institution names that legitimately START with the
// label word itself ("المحكمة العامة بالرياض", "الدائرة العامة السابعة").
const NAME_PREFIX: Record<string, string> = {
  court: "المحكمة",
  circuit: "الدائرة",
};

function applyNamePrefix(key: string, value: string): string {
  const prefix = NAME_PREFIX[key];
  if (!prefix) return value;
  if (!value || value.startsWith(prefix)) return value;
  // Only prefix descriptive continuations, not numbers ("الدائرة 25" stays).
  if (/^[\u0621-\u064A]/.test(value)) return `${prefix} ${value}`;
  return value;
}

/**
 * True if the string carries more than one distinct known label AND the
 * labels are dense enough to indicate a scraped-page blob (rather than a
 * legitimate narrative that merely mentions label-like words).
 */
export function looksLikeBlob(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length < 25) return false;
  const hits = findLabelHits(raw, NAJIZ_LABELS);
  const distinct = new Set(hits.map((h) => h.key));
  if (distinct.size < 2) return false;
  if (distinct.size >= 4) return true;
  const labelChars = hits.reduce((n, h) => n + (h.end - h.start), 0);
  return labelChars / raw.length >= 0.12;
}

/** Parse a concatenated blob into a keyed map. Missing labels are omitted. */
export function parseBlob(raw: string): Record<string, string> {
  if (!raw) return {};
  const { slices } = smartSlice(raw, NAJIZ_LABELS);
  const map = slicesToMap(slices);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (SECTION_ONLY_KEYS.has(k)) continue; // tab labels: values are noise
    let val = deglueForDisplay(applyNamePrefix(k, v));
    if (!val) continue;
    if (val.length > MAX_VALUE_LEN) val = val.slice(0, MAX_VALUE_LEN);
    out[k] = val;
  }
  return out;
}

/**
 * Extract a specific labelled slice from a value that may be a concatenated
 * blob. Handles three shapes:
 *  1. clean short value            → returned as-is (junk-stripped)
 *  2. blob containing the label    → only that slice returned
 *  3. "value-first" blob (its own value leads, then other labels follow)
 *     → the leading head is returned
 * Returns null when nothing legible can be extracted.
 */
export function pickField(raw: unknown, wantKey: string): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!looksLikeBlob(s)) {
    const cleaned = cleanValue(stripNavRuns(stripJunk(s)));
    if (!cleaned) return null;
    // Single-label bleed: "منتهية المحكمة المحكمة العامة…" — when the wanted
    // key isn't present but a short head precedes the first label, the head
    // is this field's own value.
    const hits = findLabelHits(cleaned, NAJIZ_LABELS);
    if (hits.length) {
      const { slices, head } = smartSlice(cleaned, NAJIZ_LABELS);
      const map = slicesToMap(slices);
      if (map[wantKey]) {
        const val = deglueForDisplay(applyNamePrefix(wantKey, map[wantKey]));
        return val ? (val.length > MAX_VALUE_LEN ? val.slice(0, MAX_VALUE_LEN) : val) : null;
      }
      if (head && head.length >= 2 && head.length <= 60) return deglueForDisplay(head);
    }
    return cleaned;
  }
  const { slices, head } = smartSlice(s, NAJIZ_LABELS);
  const map = slicesToMap(slices);
  if (map[wantKey]) {
    let val = deglueForDisplay(applyNamePrefix(wantKey, map[wantKey]));
    if (val.length > MAX_VALUE_LEN) val = val.slice(0, MAX_VALUE_LEN);
    return val || null;
  }
  // Value-first blob: the head (text before the first label) is this field's
  // own value — but only when the head isn't itself a long number-only chunk.
  if (head && head.length >= 2) {
    let val = deglueForDisplay(head);
    if (val.length > MAX_VALUE_LEN) val = val.slice(0, MAX_VALUE_LEN);
    return val || null;
  }
  return null;
}

/**
 * Given several candidate raw values, return the first clean value for the
 * requested field. Handles the common case where multiple DB columns each
 * received the same blob.
 */
export function pickFirst(wantKey: string, ...candidates: unknown[]): string | null {
  // Pass 1: prefer candidates that explicitly contain the wanted label or are clean.
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (!s) continue;
    if (!looksLikeBlob(s)) {
      const v = pickField(s, wantKey);
      if (v) return v;
      continue;
    }
    const { slices } = smartSlice(s, NAJIZ_LABELS);
    const map = slicesToMap(slices);
    if (map[wantKey]) {
      const val = deglueForDisplay(applyNamePrefix(wantKey, map[wantKey]));
      if (val) return val.length > MAX_VALUE_LEN ? val.slice(0, MAX_VALUE_LEN) : val;
    }
  }
  // Pass 2: fall back to value-first head extraction.
  for (const c of candidates) {
    const v = pickField(c, wantKey);
    if (v) return v;
  }
  return null;
}

/** Extract the clean numeric case/wakalah number from a possibly-glued value. */
export function extractCaseNumber(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^[\w\/\-]{1,25}$/.test(s)) return s; // already clean (incl. manual refs)
  return extractLongNumber(s);
}
