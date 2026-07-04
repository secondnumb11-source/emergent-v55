export type ArchiveDocType =
  | "lawsuit"
  | "judgment_final"
  | "judgment_non_final"
  | "appeal_judgment"
  | "memorandum_reply"
  | "session_minutes"
  | "power_of_attorney"
  | "evidence"
  | "other";

export interface ArchiveClient {
  id: string;
  full_name: string;
}

export interface ArchiveCase {
  id: string;
  client_id: string | null;
  case_number: string;
  title: string;
  court?: string | null;
}

export interface ArchiveDocRow {
  id: string;
  case_id: string | null;
  doc_type: ArchiveDocType;
  title: string;
  description: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  filed_date: string | null;
  judgment_date: string | null;
  court: string | null;
  circuit_number: string | null;
  appeal_deadline: string | null;
  created_at: string;
}

export interface ArchiveDocTypeMeta {
  id: ArchiveDocType;
  label: string;
  needsJudgmentMeta?: boolean;
}

export interface ArchiveCaseGroup {
  key: string; // case id or "__none__"
  caseData?: ArchiveCase;
  client?: ArchiveClient;
  docs: ArchiveDocRow[];
  counts: {
    judgments: number;
    lawsuits: number;
    memos: number;
    others: number;
    total: number;
  };
  nextDeadline: string | null;
}

export interface ArchiveDocActionHandlers {
  onPreview: (d: ArchiveDocRow) => void;
  onDownload: (d: ArchiveDocRow) => void;
  onEdit: (d: ArchiveDocRow) => void;
  onDelete: (d: ArchiveDocRow) => void;
}

/**
 * Safe formatter for file sizes. Never throws.
 */
export function safeFmtSize(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(Number(n))) return "—";
  const bytes = Number(n);
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Best-effort display title for a document row when the DB row is partial or
 * malformed. Never returns an empty string.
 */
export function safeDocTitle(d: Partial<ArchiveDocRow> | null | undefined): string {
  if (!d) return "مستند بدون عنوان";
  const raw = (d.title ?? d.file_name ?? "").toString().trim();
  return raw || "مستند بدون عنوان";
}

/**
 * Fallback label when `doc_type` is unknown or missing.
 */
export function safeDocTypeLabel(
  type: string | null | undefined,
  docTypes: readonly ArchiveDocTypeMeta[],
): string {
  if (!type) return "غير مصنّف";
  const hit = docTypes.find((t) => t.id === type);
  if (hit) return hit.label;
  return type;
}
