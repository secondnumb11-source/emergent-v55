// Display-only parsers for Najiz-pulled data.
// Ingestion (sync / DB) is unchanged; these helpers re-split run-on Arabic
// text blobs into labelled fields for the UI. All matching is powered by the
// whitespace-insensitive engine in najiz-normalize.ts, so both spaced and
// fully-glued blobs ("جهةالإصدارخدماتالوكالات...") are handled.

import {
  type LabelDef,
  smartSlice,
  slicesToMap,
  cleanValue,
  deglueForDisplay,
  extractLongNumber,
  normalizeDigits,
  parseLinePairs,
  splitPartySegments,
  stripJunk,
  stripNavRuns,
  findLabelHits,
} from "@/lib/najiz-normalize";

// ---------------------------------------------------------------------------
// Legacy-compatible helpers (kept for existing imports)
// ---------------------------------------------------------------------------

function toDefs(keywords: string[]): LabelDef[] {
  return keywords.map((k) => ({ key: k, aliases: [k] }));
}

/** Insert whitespace before/around any known keyword glued into the text. */
export function spaceOutKeywords(text: string | null | undefined, keywords: string[]): string {
  if (!text) return "";
  return deglueForDisplay(String(text), keywords);
}

/** Ordered { label, value } slices for every keyword occurrence found. */
export function sliceByKeywords(
  text: string | null | undefined,
  keywords: string[],
): { label: string; value: string }[] {
  const { slices } = smartSlice(text, toDefs(keywords));
  return slices.map((s) => ({ label: s.label, value: s.value }));
}

// ---------------------------------------------------------------------------
// Execution requests (طلبات التنفيذ)
// ---------------------------------------------------------------------------

const EXEC_DEFS: LabelDef[] = [
  { key: "requestNumber", aliases: ["رقم الطلب", "رقم طلب التنفيذ"] },
  { key: "court", aliases: ["المحكمة"] },
  { key: "circuit", aliases: ["الدائرة"] },
  { key: "capacityInRequest", aliases: ["الصفة في الطلب"] },
  { key: "requestType", aliases: ["نوع الطلب"] },
  { key: "bondMain", aliases: ["نوع السند الرئيسي", "السند الرئيسي"] },
  { key: "bondSub", aliases: ["نوع السند الفرعي"] },
  { key: "bondType", aliases: ["نوع السند"] },
  { key: "amountDue", aliases: ["المبلغ المستحق"] },
  { key: "debtor", aliases: ["المنفذ ضده"] },
  { key: "creditor", aliases: ["المنفذ"] },
  { key: "capacity", aliases: ["الصفة"] },
  { key: "registeredIn", aliases: ["مسجلة في وزارة التجارة", "مسجلة في"] },
  { key: "idResident", aliases: ["هوية مقيم"] },
  { key: "idNational", aliases: ["هوية وطنية"] },
  { key: "commercialReg", aliases: ["سجل تجاري"] },
  { key: "idType", aliases: ["نوع الهوية"] },
  { key: "idNumber", aliases: ["رقم الهوية"] },
  { key: "unifiedNumber", aliases: ["الرقم الموحد"] },
  { key: "nationality", aliases: ["الجنسية"] },
  { key: "decisions", aliases: ["القرارات"] },
  { key: "identities", aliases: ["الهويات"] },
  { key: "amount", aliases: ["المبلغ"] },
  { key: "filedDate", aliases: ["تاريخ تقديم الطلب", "تقديم الطلب", "تاريخ التقديم"] },
  { key: "requestStatus", aliases: ["حالة الطلب"] },
];

export type ExecutionParsed = {
  court?: string;
  circuit?: string;
  requestType?: string;
  bondMain?: string;
  bondSub?: string;
  requestStatus?: string;
  creditor: {
    name?: string;
    capacity?: string;
    idType?: string;
    idNumber?: string;
    unifiedNumber?: string;
    amountDue?: string;
  };
  debtor: {
    name?: string;
    capacity?: string;
    idType?: string;
    idNumber?: string;
    nationality?: string;
    decisionsCount?: string;
  };
  decisions?: string;
  agentIds?: string;
  amount?: string;
  filedDate?: string;
  filedDateHijri?: string;
};

type PartyFields = {
  name?: string;
  capacity?: string;
  idType?: string;
  idNumber?: string;
  unifiedNumber?: string;
  nationality?: string;
  amountDue?: string;
  decisionsCount?: string;
};

/** Parse one party blob ("النص عرض التفاصيل الصفة فرد نوع الهوية …"). */
function parseExecutionParty(raw: string | null | undefined): PartyFields {
  const out: PartyFields = {};
  if (!raw) return out;
  const { slices, head } = smartSlice(String(raw), EXEC_DEFS);
  const map = slicesToMap(slices);
  if (head) out.name = deglueForDisplay(head).replace(/[\-–—]+$/, "").trim();
  if (map.capacity) out.capacity = deglueForDisplay(map.capacity);
  out.idType = map.idType
    ? deglueForDisplay(map.idType)
    : slices.some((s) => s.key === "idResident")
      ? "هوية مقيم"
      : slices.some((s) => s.key === "idNational")
        ? "هوية وطنية"
        : slices.some((s) => s.key === "commercialReg")
          ? "سجل تجاري"
          : undefined;
  if (map.idNumber) out.idNumber = normalizeDigits(deglueForDisplay(map.idNumber));
  if (map.unifiedNumber) out.unifiedNumber = normalizeDigits(deglueForDisplay(map.unifiedNumber));
  if (map.nationality) out.nationality = deglueForDisplay(map.nationality);
  if (map.amountDue) {
    const num = map.amountDue.match(/[\d\u0660-\u0669,.]+/);
    out.amountDue = num ? normalizeDigits(num[0]) : deglueForDisplay(map.amountDue);
  }
  if (map.decisions) {
    const num = map.decisions.match(/\d+/);
    if (num) out.decisionsCount = num[0];
  }
  // Registered-company capacity: "شركة مسجلة في وزارة التجارة"
  if (out.capacity && slices.some((s) => s.key === "registeredIn")) {
    out.capacity = `${out.capacity} مسجلة في وزارة التجارة`;
  }
  return out;
}

/** Structure an execution row from Najiz for display. */
export function parseExecutionRow(row: Record<string, any>): ExecutionParsed {
  // 1) execution_data / raw_import_text arrive as clean newline label/value
  //    pairs — the most reliable source.
  const linePairs = parseLinePairs(row.execution_data || row.raw_import_text, EXEC_DEFS);

  // 2) creditor_name / debtor_name each hold a party blob.
  const creditor = parseExecutionParty(row.creditor_name);
  const debtor = parseExecutionParty(row.debtor_name);

  // The creditor blob often bleeds into "المنفذ ضده : الاسم" — salvage it.
  if (!debtor.name && row.creditor_name) {
    const { slices } = smartSlice(String(row.creditor_name), EXEC_DEFS);
    const bleed = slices.find((s) => s.key === "debtor");
    if (bleed?.value) debtor.name = deglueForDisplay(bleed.value);
  }

  const fmtAmount =
    row.amount != null && row.amount !== ""
      ? `${Number(row.amount).toLocaleString("ar-SA")} ر.س`
      : creditor.amountDue
        ? `${creditor.amountDue} ر.س`
        : undefined;

  const agentIds =
    [row.creditor_id_number, row.debtor_id_number].filter(Boolean).join(" / ") || undefined;

  const requestType = [
    linePairs.capacityInRequest || (row.request_type ? deglueForDisplay(String(row.request_type)) : null),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    court: linePairs.court || row.court || undefined,
    circuit: linePairs.circuit || row.circuit_number || undefined,
    requestType: requestType || undefined,
    bondMain: linePairs.bondMain || row.bond_type_main || undefined,
    bondSub: linePairs.bondSub || row.bond_type_sub || undefined,
    requestStatus: linePairs.requestStatus || undefined,
    creditor: {
      name: creditor.name || undefined,
      capacity: creditor.capacity,
      idType: creditor.idType,
      idNumber: creditor.idNumber || row.creditor_id_number || undefined,
      unifiedNumber: creditor.unifiedNumber,
      amountDue: creditor.amountDue,
    },
    debtor: {
      name: debtor.name || undefined,
      capacity: debtor.capacity,
      idType: debtor.idType,
      idNumber: debtor.idNumber || row.debtor_id_number || undefined,
      nationality: debtor.nationality,
      decisionsCount: debtor.decisionsCount,
    },
    decisions: debtor.decisionsCount ? `${debtor.decisionsCount} قرار` : undefined,
    agentIds,
    amount: fmtAmount,
    filedDate: row.filed_date || linePairs.filedDate || undefined,
    filedDateHijri: row.filed_date_hijri || linePairs.filedDate || undefined,
  };
}

// ---------------------------------------------------------------------------
// Powers of attorney (الوكالات القضائية)
// ---------------------------------------------------------------------------

const POWER_DEFS: LabelDef[] = [
  { key: "issuerEntity", aliases: ["جهة الإصدار", "جهة الاصدار"] },
  { key: "usageMethod", aliases: ["كيفية الاستخدام"] },
  { key: "issueDate", aliases: ["تاريخ إصدار الوكالة", "تاريخ اصدار الوكالة", "تاريخ الإصدار"] },
  { key: "expiryDate", aliases: ["تاريخ انتهاء الوكالة", "تاريخ إنتهاء الوكالة", "تاريخ الانتهاء"] },
  { key: "partiesHeader", aliases: ["أطراف الوكالة"] },
  { key: "agentData", aliases: ["بيانات الوكيل"] },
  { key: "agencyData", aliases: ["بيانات الوكالة"] },
  { key: "issuerData", aliases: ["بيانات المُصدر", "بيانات المصدر"] },
  { key: "clauses", aliases: ["بنود الوكالة"] },
  { key: "statusInPoa", aliases: ["حالته بالوكالة", "حالتها بالوكالة"] },
  { key: "poaStatus", aliases: ["حالة الوكالة"] },
  { key: "issuer", aliases: ["المُصدر", "المصدر"] },
  { key: "agent", aliases: ["الوكيل"] },
  { key: "capacity", aliases: ["الصفة"] },
  { key: "selfCapacity", aliases: ["أصالة عن نفسه", "أصالة عن نفسة", "أصال عن نفسه"] },
  { key: "nationality", aliases: ["الجنسية"] },
  { key: "idType", aliases: ["نوع الهوية"] },
  { key: "idNumber", aliases: ["رقم الهوية"] },
  { key: "idResidence", aliases: ["إقامة"] },
  { key: "idNational", aliases: ["هوية وطنية"] },
  { key: "notActive", aliases: ["غير سارية"] },
  { key: "active", aliases: ["سارية"] },
  { key: "poaNumber", aliases: ["رقم الوكالة"] },
  { key: "najizRef", aliases: ["معرف ناجز", "معرّف ناجز"] },
  { key: "usageJoint", aliases: ["مجتمعين"] },
  { key: "usageSeparate", aliases: ["غير مجتمعين"] },
];

export type PowerParty = {
  name?: string;
  capacity?: string;
  nationality?: string;
  idType?: string;
  idNumber?: string;
  status?: string;
};

export type PowerParsed = {
  wakalahNumber?: string;
  issuerEntity?: string;
  usageMethod?: string;
  issueDate?: string;
  expiryDate?: string;
  issuer: PowerParty;
  agent: PowerParty;
  /** All issuers/agents when the blob lists more than one of either. */
  issuers?: PowerParty[];
  agents?: PowerParty[];
  agencyClauses?: string;
};

/** Parse ONE party segment (no "( n )" markers inside). */
function parsePowerParty(segment: string): PowerParty {
  const out: PowerParty = {};
  if (!segment) return out;
  const { slices, head } = smartSlice(segment, POWER_DEFS);
  const map = slicesToMap(slices);
  if (head) out.name = deglueForDisplay(head);
  if (map.capacity) out.capacity = deglueForDisplay(map.capacity);
  if (!out.capacity && slices.some((s) => s.key === "selfCapacity")) out.capacity = "أصالة عن نفسه";
  if (map.nationality) out.nationality = deglueForDisplay(map.nationality);
  out.idType = map.idType
    ? deglueForDisplay(map.idType)
    : slices.some((s) => s.key === "idResidence")
      ? "إقامة"
      : slices.some((s) => s.key === "idNational")
        ? "هوية وطنية"
        : undefined;
  if (map.idNumber) out.idNumber = normalizeDigits(deglueForDisplay(map.idNumber));
  out.status = map.statusInPoa
    ? deglueForDisplay(map.statusInPoa)
    : map.poaStatus
      ? deglueForDisplay(map.poaStatus)
      : slices.some((s) => s.key === "notActive")
        ? "غير سارية"
        : slices.some((s) => s.key === "active")
          ? "سارية"
          : undefined;
  // Drop truncated fragments (e.g. "أصا" cut mid-word by the scraper).
  for (const k of ["capacity", "nationality", "idType", "status"] as const) {
    if (out[k] && out[k]!.length < 3) delete out[k];
  }
  return out;
}

/** Parse a party blob that may contain BOTH issuer and agent blocks and
 *  multiple "( n )" numbered parties. */
function parsePowerPartyBlob(raw: string | null | undefined): {
  issuers: PowerParty[];
  agents: PowerParty[];
} {
  const issuers: PowerParty[] = [];
  const agents: PowerParty[] = [];
  if (!raw) return { issuers, agents };
  const text = stripNavRuns(stripJunk(String(raw)));

  // Split into issuer/agent blocks on "بيانات الوكيل"/"بيانات المصدر" markers.
  const blockDefs: LabelDef[] = [
    { key: "agentBlock", aliases: ["بيانات الوكيل"] },
    { key: "issuerBlock", aliases: ["بيانات المُصدر", "بيانات المصدر"] },
  ];
  const hits = findLabelHits(text, blockDefs);
  type Block = { kind: "issuer" | "agent"; text: string };
  const blocks: Block[] = [];
  if (!hits.length) {
    blocks.push({ kind: "issuer", text });
  } else {
    if (hits[0].start > 0) blocks.push({ kind: "issuer", text: text.slice(0, hits[0].start) });
    for (let i = 0; i < hits.length; i++) {
      const end = i + 1 < hits.length ? hits[i + 1].start : text.length;
      blocks.push({
        kind: hits[i].key === "agentBlock" ? "agent" : "issuer",
        text: text.slice(hits[i].end, end),
      });
    }
  }

  for (const b of blocks) {
    for (const seg of splitPartySegments(b.text)) {
      const p = parsePowerParty(seg);
      if (!p.name && !p.idNumber) continue;
      (b.kind === "agent" ? agents : issuers).push(p);
    }
  }
  return { issuers, agents };
}

export function parsePowerRow(row: Record<string, any>): PowerParsed {
  // Header blob: number/entity/usage/dates possibly glued into one string.
  const headerBlob = [row.wakalah_number, row.issuer_entity, row.usage_method, row.scope, row.agency_data, row.agency_text]
    .filter(Boolean)
    .join(" \n ");
  const { slices: rootSlices } = smartSlice(headerBlob, POWER_DEFS);
  const root = slicesToMap(rootSlices);

  // Parties: issuer_name/agent_name blobs may each contain both blocks.
  const fromIssuer = parsePowerPartyBlob(row.issuer_name);
  const fromAgent = parsePowerPartyBlob(row.agent_name);

  const issuers: PowerParty[] = [...fromIssuer.issuers];
  // agent_name's leading block is the AGENT itself (not an issuer) when the
  // column is the agent field — unless it explicitly contained issuer markers.
  const agents: PowerParty[] = [...fromIssuer.agents];
  if (fromAgent.issuers.length && !fromAgent.agents.length) {
    agents.push(...fromAgent.issuers);
  } else {
    agents.push(...fromAgent.agents);
    issuers.push(...fromAgent.issuers.filter((p) => !issuers.some((x) => x.idNumber && x.idNumber === p.idNumber)));
  }

  // De-duplicate + MERGE parties: the same person often appears twice (a
  // truncated fragment inside issuer_name and the full block in agent_name).
  const dedupe = (list: PowerParty[]) => {
    const out: PowerParty[] = [];
    for (const p of list) {
      const match = out.find(
        (x) =>
          (p.idNumber && x.idNumber && p.idNumber === x.idNumber) ||
          (p.name &&
            x.name &&
            (p.name === x.name || p.name.startsWith(x.name) || x.name.startsWith(p.name))),
      );
      if (match) {
        // Merge: fill missing fields, prefer the longer/complete values.
        for (const k of ["name", "capacity", "nationality", "idType", "idNumber", "status"] as const) {
          if (p[k] && (!match[k] || p[k]!.length > match[k]!.length)) match[k] = p[k];
        }
      } else {
        out.push({ ...p });
      }
    }
    return out;
  };
  const issuersD = dedupe(issuers);
  const agentsD = dedupe(agents);

  // Wakalah number: numeric only. Never display a blob as the number.
  let num: string | undefined = undefined;
  if (row.wakalah_number) {
    const s = String(row.wakalah_number).trim();
    if (/^[\d\-\/\u0660-\u0669]{4,}$/.test(s)) num = normalizeDigits(s);
    else num = root.poaNumber && /\d{4,}/.test(root.poaNumber)
      ? normalizeDigits((root.poaNumber.match(/[\d\u0660-\u0669\/\-]{4,}/) || [""])[0])
      : extractLongNumber(s) || undefined;
  }
  if (!num && row.najiz_id) num = extractLongNumber(String(row.najiz_id)) || undefined;

  const usage =
    root.usageMethod ||
    (rootSlices.some((s) => s.key === "usageSeparate")
      ? "غير مجتمعين"
      : rootSlices.some((s) => s.key === "usageJoint")
        ? "مجتمعين"
        : undefined);

  const issuer = issuersD[0] || {};
  const agent = agentsD[0] || {};

  // Agency clauses often bleed into the party columns ("…بنود الوكالة المطالبات…").
  let partyClauses: string | undefined;
  for (const src of [row.agent_name, row.issuer_name]) {
    if (!src) continue;
    const { slices } = smartSlice(String(src), POWER_DEFS);
    const cl = slices.find((s) => s.key === "clauses");
    if (cl?.value && (!partyClauses || cl.value.length > partyClauses.length)) {
      partyClauses = cl.value;
    }
  }

  return {
    wakalahNumber: num,
    issuerEntity:
      (root.issuerEntity && deglueForDisplay(root.issuerEntity)) ||
      (row.issuer_entity && !looksBloblike(row.issuer_entity) ? row.issuer_entity : undefined),
    usageMethod: usage ? deglueForDisplay(usage) : row.usage_method || undefined,
    issueDate: row.issue_date || (root.issueDate ? deglueForDisplay(root.issueDate) : undefined),
    expiryDate: row.expiry_date || (root.expiryDate ? deglueForDisplay(root.expiryDate) : undefined),
    issuer: {
      name: issuer.name || cleanPlain(row.issuer_name, 80) || undefined,
      capacity: issuer.capacity || row.issuer_capacity || undefined,
      nationality: issuer.nationality || row.issuer_nationality || undefined,
      idType: issuer.idType || row.issuer_identity_type || undefined,
      idNumber: issuer.idNumber || row.issuer_id_number || undefined,
      status: issuer.status || row.issuer_status_in_agency || undefined,
    },
    agent: {
      name: agent.name || cleanPlain(row.agent_name, 80) || undefined,
      capacity: agent.capacity || row.agent_capacity || undefined,
      nationality: agent.nationality || row.agent_nationality || undefined,
      idType: agent.idType || row.agent_identity_type || undefined,
      idNumber: agent.idNumber || row.agent_id_number || undefined,
      status: agent.status || row.agent_status_in_agency || undefined,
    },
    issuers: issuersD.length ? issuersD : undefined,
    agents: agentsD.length ? agentsD : undefined,
    agencyClauses:
      (row.agency_clauses && deglueForDisplay(String(row.agency_clauses))) ||
      (root.clauses ? deglueForDisplay(root.clauses) : undefined) ||
      (partyClauses ? deglueForDisplay(partyClauses) : undefined),
  };
}

/** True when a raw column value contains 2+ known labels (blob-like). */
function looksBloblike(v: unknown): boolean {
  if (typeof v !== "string" || v.length < 20) return false;
  return findLabelHits(v, POWER_DEFS).length >= 2;
}

/** Return the raw value only when it's NOT blob-like; cleaned + clamped. */
function cleanPlain(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || looksBloblike(s)) return null;
  const cleaned = cleanValue(stripJunk(s));
  return cleaned ? cleaned.slice(0, max) : null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ALL_KEYWORDS = [
  ...EXEC_DEFS.flatMap((d) => d.aliases),
  ...POWER_DEFS.flatMap((d) => d.aliases),
];

/** Clean up any label chip / title that arrived glued. */
export function cleanNajizTitle(text: string | null | undefined): string {
  if (!text) return "";
  return deglueForDisplay(stripNavRuns(stripJunk(String(text))), ALL_KEYWORDS);
}

/** True when the parsed execution row has at least a few meaningful fields. */
export function hasStructuredExecution(p: ExecutionParsed): boolean {
  const filled =
    Number(!!p.court) +
    Number(!!p.requestType) +
    Number(!!p.creditor.name) +
    Number(!!p.debtor.name) +
    Number(!!p.amount) +
    Number(!!p.creditor.idNumber) +
    Number(!!p.debtor.idNumber);
  return filled >= 2;
}

/** True when the parsed power row has at least a few meaningful fields. */
export function hasStructuredPower(p: PowerParsed): boolean {
  const filled =
    Number(!!p.wakalahNumber) +
    Number(!!p.issuerEntity) +
    Number(!!p.issueDate) +
    Number(!!p.expiryDate) +
    Number(!!p.issuer.name) +
    Number(!!p.agent.name);
  return filled >= 2;
}

/** Legible fallback rendering for blobs the parser can't fully structure. */
export function prettyFallback(text: string | null | undefined, keywords: string[]): string {
  if (!text) return "";
  const spaced = deglueForDisplay(stripNavRuns(stripJunk(String(text))), keywords);
  if (!spaced) return "";
  const sectionMarkers = [
    "المنفذ ضده",
    "المنفذ",
    "القرارات",
    "المبلغ المستحق",
    "بيانات الوكيل",
    "بيانات المُصدر",
    "بيانات المصدر",
    "بنود الوكالة",
    "الوكيل",
    "المُصدر",
    "المصدر",
    "جهة الإصدار",
  ].sort((a, b) => b.length - a.length);
  let out = spaced;
  for (const m of sectionMarkers) {
    out = out.replace(new RegExp(`(?<!\\n)${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), `\n${m}`);
  }
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export const NAJIZ_EXEC_KEYWORDS = EXEC_DEFS.flatMap((d) => d.aliases);
export const NAJIZ_POWER_KEYWORDS = POWER_DEFS.flatMap((d) => d.aliases);
