// ============================================================================
// najiz-normalize.ts — Core smart-parsing engine for Najiz-scraped Arabic text.
//
// The scraping bot sends text in three broken shapes:
//   1) FULLY GLUED — all whitespace stripped:
//      "جهةالإصدارخدماتالوكالاتالإلكترونيةكيفيةالاستخدامغيرمجتمعين..."
//   2) VALUE-FIRST BLOB — a column holds its own value followed by the rest
//      of the page: "العمالة العادية نوع القضية إنهاء العلاقة العمالية..."
//   3) POLLUTED — values mixed with page-chrome junk:
//      "عرض التفاصيل / إظهار الكل / عزيزي المستفيد / tab-bar label runs".
//
// This module provides SPACE-INSENSITIVE label matching (works on glued and
// spaced text alike), junk stripping, nav-run removal, value cleaning, and
// display de-gluing. It is DISPLAY-ONLY: ingestion & sync are untouched.
// ============================================================================

export type LabelDef = { key: string; aliases: string[] };
export type LabelHit = { key: string; label: string; start: number; end: number };
export type Slice = { key: string; label: string; value: string; start: number };

// ---------------------------------------------------------------------------
// Compact matching infrastructure
// ---------------------------------------------------------------------------

/** Strip whitespace + tatweel and keep a map from compact→original indices. */
function compactify(text: string): { c: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\u0640" || /\s/.test(ch)) continue; // tatweel + whitespace
    chars.push(ch);
    map.push(i);
  }
  return { c: chars.join(""), map };
}

function compactKey(s: string): string {
  return s.replace(/[\s\u0640]+/g, "");
}

/**
 * Find every occurrence of every alias inside `text`, matching in compact
 * space so "جهة الإصدار" matches the glued "جهةالإصدار" too. Longer aliases
 * claim their characters first so shorter labels can never split them.
 * Returns hits with ORIGINAL-text indices, sorted by position.
 */
export function findLabelHits(text: string, labels: LabelDef[]): LabelHit[] {
  if (!text) return [];
  const { c, map } = compactify(text);
  if (!c) return [];

  type Alias = { key: string; alias: string; ck: string };
  const aliases: Alias[] = [];
  const seen = new Set<string>();
  for (const l of labels) {
    for (const a of l.aliases) {
      const ck = compactKey(a);
      if (!ck || seen.has(ck)) continue;
      seen.add(ck);
      aliases.push({ key: l.key, alias: a, ck });
    }
  }
  aliases.sort((a, b) => b.ck.length - a.ck.length);

  const claimed = new Array<boolean>(c.length).fill(false);
  const hits: LabelHit[] = [];
  for (const { key, alias, ck } of aliases) {
    let from = 0;
    while (from <= c.length - ck.length) {
      const idx = c.indexOf(ck, from);
      if (idx === -1) break;
      let overlap = false;
      for (let i = idx; i < idx + ck.length; i++) {
        if (claimed[i]) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        for (let i = idx; i < idx + ck.length; i++) claimed[i] = true;
        hits.push({
          key,
          label: alias,
          start: map[idx],
          end: map[idx + ck.length - 1] + 1,
        });
      }
      from = idx + ck.length;
    }
  }
  hits.sort((a, b) => a.start - b.start);
  return hits;
}

// ---------------------------------------------------------------------------
// Junk stripping
// ---------------------------------------------------------------------------

/** Page-chrome phrases the scraper drags in — always safe to delete. */
export const JUNK_PHRASES = [
  "حالة الطلب لا تعكس حالة الصرف على مستوى الطلب و يمكنك استعراض حالة الصرف من خلال المحفظة الرقمية",
  "يمكنك متابعة حالة رفع الاجراءات مع الجهات من خلال استعراض تبويب القرارات",
  "تقديم خدمة على طلب التنفيذ",
  "الاطلاع على التفاصيل",
  "عرض التفاصيل",
  "إظهار الكل",
  "اظهار الكل",
  "عزيزي المستفيد",
  "إعادة إصدار الوكالة",
  "إعادة إصدار",
  "تصدير الكل",
  "طباعة",
];

/** Najiz tab-bar labels that appear as a meaningless run inside blobs. */
export const NAV_LABELS = [
  "مذكرة الدفاع الأولى",
  "مذكرة الدفاع الأول",
  "أطراف الدعوى",
  "أطراف الدعوي",
  "الجلسات",
  "الأحكام",
  "الطلبات",
  "الإجراءات",
  "الاجراءات",
  "القرارات",
  "التكاليف القضائية",
  "المرفقات",
  "بيانات القضية",
];

/** Remove junk phrases (compact-matched, so glued junk is caught too). */
export function stripJunk(text: string): string {
  if (!text) return "";
  const defs: LabelDef[] = JUNK_PHRASES.map((p, i) => ({ key: `j${i}`, aliases: [p] }));
  const hits = findLabelHits(text, defs);
  if (!hits.length) return text;
  let out = "";
  let cursor = 0;
  for (const h of hits) {
    out += text.slice(cursor, h.start) + " ";
    cursor = h.end;
  }
  out += text.slice(cursor);
  return out.replace(/[ \t]+/g, " ");
}

/**
 * Remove "navigation runs": 3+ Najiz tab labels appearing consecutively
 * (e.g. "…أطراف الدعوى الجلسات الأحكام الطلبات الإجراءات القرارات…").
 * Keeps single legitimate occurrences (a real section header) intact.
 */
export function stripNavRuns(text: string): string {
  if (!text) return "";
  const defs: LabelDef[] = NAV_LABELS.map((p, i) => ({ key: `n${i}`, aliases: [p] }));
  const hits = findLabelHits(text, defs);
  if (hits.length < 3) return text;

  // Group hits into chains where the gap between them is tiny (punct/space only).
  const chains: LabelHit[][] = [];
  let current: LabelHit[] = [hits[0]];
  for (let i = 1; i < hits.length; i++) {
    const gap = text.slice(current[current.length - 1].end, hits[i].start);
    if (gap.replace(/[\s:،,·\-–—]/g, "").length <= 1) {
      current.push(hits[i]);
    } else {
      chains.push(current);
      current = [hits[i]];
    }
  }
  chains.push(current);

  const remove = chains.filter((ch) => ch.length >= 3);
  if (!remove.length) return text;
  let out = "";
  let cursor = 0;
  for (const ch of remove) {
    const start = ch[0].start;
    const end = ch[ch.length - 1].end;
    out += text.slice(cursor, start) + " ";
    cursor = end;
  }
  out += text.slice(cursor);
  return out.replace(/[ \t]+/g, " ");
}

// ---------------------------------------------------------------------------
// Value cleaning + display de-gluing
// ---------------------------------------------------------------------------

/** Trim separators/punctuation left behind by slicing. */
export function cleanValue(v: string | null | undefined): string {
  if (!v) return "";
  let s = String(v)
    .replace(/^[\s:،,؛;·\-–—#*_.]+/, "")
    .replace(/[\s:،,؛;·\-–—_]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  // Drop a trailing orphan fragment the scraper cut mid-word ("… ال", "… و").
  s = s.replace(/\s(ال|و|في|من|إلى|على|عن|أو)$/u, "").trim();
  return s;
}

/** Known vocabulary phrases used to re-space glued VALUES for display. */
export const DISPLAY_VOCAB = [
  "خدمات الوكالات الإلكترونية",
  "خدمة الوكالات الإلكترونية",
  "كتابة العدل",
  "غير مجتمعين",
  "مجتمعين",
  "غير سارية",
  "سارية",
  "مفسوخة كلياً",
  "مفسوخة جزئياً",
  "منتهية",
  "أصالة عن نفسه",
  "أصالة عن نفسة",
  "هوية وطنية",
  "هوية مقيم",
  "سجل تجاري",
  "إقامة",
  "العمالة العادية",
  "قيد التنفيذ",
  "المحكمة العمالية",
  "المحكمة العامة",
  "المحكمة التجارية",
  "محكمة التنفيذ",
  "الدرجة الأولى",
  "الاستئناف",
  // Common Najiz case classifications / types
  "إنهاء العلاقة العمالية",
  "من صاحب العمل",
  "من العامل",
  "إثبات السبب الصحيح لإنهاء العلاقة",
  "عقد القرض",
  "العقود",
  "التعويض عن أضرار التقاضي",
  "أتعاب محاماة",
  "أضرار التقاضي",
  "المسؤولية الناشئة عن الفعل الضار",
  "المطالبة المالية",
  "مطالبة مالية",
  "بالرياض",
  "بجدة",
  "بالدمام",
  // Hijri months (dates arrive glued: "2ربيعالأول")
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "ربيع الثاني",
  "جمادى الأولى",
  "جمادى الآخرة",
  "جمادى الأخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
];

/**
 * Best-effort de-gluing for display:
 *  - re-space known vocabulary phrases matched compactly
 *  - separate Arabic letters from digits ("الوكالة1446" → "الوكالة 1446")
 *  - keep Hijri "هـ" attached to its date but add a space before "("
 */
export function deglueForDisplay(text: string | null | undefined, extraVocab: string[] = []): string {
  if (!text) return "";
  let s = String(text);

  // Re-space vocabulary phrases (insert the properly spaced form).
  const vocab = [...new Set([...DISPLAY_VOCAB, ...extraVocab])];
  const defs: LabelDef[] = vocab.map((p, i) => ({ key: `v${i}:${p}`, aliases: [p] }));
  const hits = findLabelHits(s, defs);
  if (hits.length) {
    let out = "";
    let cursor = 0;
    for (const h of hits) {
      const phrase = h.key.slice(h.key.indexOf(":") + 1);
      out += s.slice(cursor, h.start);
      if (out && !/\s$/.test(out)) out += " ";
      out += phrase + " ";
      cursor = h.end;
    }
    out += s.slice(cursor);
    s = out;
  }

  return s
    .replace(/([\u0621-\u064A])(\d)/g, "$1 $2") // letter→digit boundary
    .replace(/(\d)([\u0621-\u064A])(?!ـ)/g, (m, d, l, off, str) => {
      // keep "23هـ" (hijri marker) attached
      const rest = str.slice(off + 1);
      if (rest.startsWith("هـ") || rest.startsWith("ه(") || rest.startsWith("م)")) return m;
      return `${d} ${l}`;
    })
    .replace(/هـ\(/g, "هـ (")
    .replace(/م\)\(/g, "م) (")
    .replace(/\)(?=[\u0621-\u064A])/g, ") ")
    .replace(/(?<=[\u0621-\u064A])\(/g, " (")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Smart slicing
// ---------------------------------------------------------------------------

export type SmartSliceResult = {
  /** Ordered labelled slices, values cleaned. */
  slices: Slice[];
  /** Text appearing BEFORE the first recognised label — usually the field's
   *  own value in "value-first" blobs. */
  head: string;
};

/**
 * Slice text at every known label occurrence (compact-matched). The value of
 * each label runs until the next label. `head` captures leading unlabeled text.
 */
export function smartSlice(text: string | null | undefined, labels: LabelDef[]): SmartSliceResult {
  if (!text) return { slices: [], head: "" };
  const cleaned = stripNavRuns(stripJunk(String(text)));
  const hits = findLabelHits(cleaned, labels);
  if (!hits.length) return { slices: [], head: cleanValue(cleaned) };
  const slices: Slice[] = hits.map((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : cleaned.length;
    return {
      key: h.key,
      label: h.label,
      value: cleanValue(cleaned.slice(h.end, end)),
      start: h.start,
    };
  });
  const head = cleanValue(cleaned.slice(0, hits[0].start));
  return { slices, head };
}

/** Build a key→value map keeping the LONGEST non-empty value per key. */
export function slicesToMap(slices: Slice[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of slices) {
    if (!s.value) continue;
    if (!out[s.key] || s.value.length > out[s.key].length) out[s.key] = s.value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Misc extractors
// ---------------------------------------------------------------------------

/** Pull a leading/embedded long digit sequence (6+ digits) — case/wakalah numbers. */
export function extractLongNumber(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const compactText = compactKey(String(raw));
  const lead = compactText.match(/^[#\s]*([0-9\u0660-\u0669]{6,})/);
  if (lead) return normalizeDigits(lead[1]);
  const any = compactText.match(/([0-9\u0660-\u0669]{6,})/);
  return any ? normalizeDigits(any[1]) : null;
}

/** Convert Arabic-Indic digits to Latin. */
export function normalizeDigits(s: string): string {
  return s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Strip "( 1 )" style ordinal markers used by Najiz between parties. */
export function stripOrdinalMarkers(s: string): string {
  return s.replace(/\(\s*\d+\s*\)/g, " ").replace(/\s+/g, " ").trim();
}

/** Split a multi-party blob on "( n )" markers → one segment per party. */
export function splitPartySegments(text: string): string[] {
  if (!text) return [];
  const parts = text.split(/\(\s*\d+\s*\)/).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [text.trim()];
}

/**
 * Parse newline-based label/value pairs (the shape of `execution_data`):
 *   "المحكمة\nمحكمة التنفيذ بالرياض\nالدائرة\n..." → { المحكمة: "محكمة..." }
 * Lines that match a known label take the following non-label line as value.
 */
export function parseLinePairs(
  text: string | null | undefined,
  labels: LabelDef[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text) return out;
  const lines = String(text)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const keyOf = (line: string): string | null => {
    const ck = compactKey(line);
    for (const l of labels) {
      for (const a of l.aliases) {
        if (compactKey(a) === ck) return l.key;
      }
    }
    return null;
  };
  for (let i = 0; i < lines.length; i++) {
    const k = keyOf(lines[i]);
    if (!k) continue;
    const next = lines[i + 1];
    if (next && !keyOf(next)) {
      if (!out[k]) out[k] = cleanValue(next);
      i++;
    }
  }
  return out;
}
