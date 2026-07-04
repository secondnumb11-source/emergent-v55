import { useMemo } from "react";
import { CaseArchiveCard } from "./case-archive-card";
import {
  type ArchiveCase,
  type ArchiveCaseGroup,
  type ArchiveClient,
  type ArchiveDocActionHandlers,
  type ArchiveDocRow,
  type ArchiveDocTypeMeta,
} from "./types";

export interface GroupedByCaseProps extends ArchiveDocActionHandlers {
  docs: ArchiveDocRow[];
  cases: ArchiveCase[];
  clients: ArchiveClient[];
  docTypes: readonly ArchiveDocTypeMeta[];
}

/**
 * Groups a flat list of archive documents by their parent case and renders
 * a `CaseArchiveCard` per group. Documents with no `case_id` are collected
 * under a single "unlinked" group so they never disappear.
 */
export function GroupedByCase({
  docs,
  cases,
  clients,
  docTypes,
  onPreview,
  onDownload,
  onEdit,
  onDelete,
}: GroupedByCaseProps) {
  const caseMap = useMemo(() => {
    const m = new Map<string, ArchiveCase>();
    cases.forEach((c) => c && c.id && m.set(c.id, c));
    return m;
  }, [cases]);

  const clientMap = useMemo(() => {
    const m = new Map<string, ArchiveClient>();
    clients.forEach((c) => c && c.id && m.set(c.id, c));
    return m;
  }, [clients]);

  const groups: ArchiveCaseGroup[] = useMemo(() => {
    const buckets = new Map<string, ArchiveDocRow[]>();
    for (const d of docs) {
      if (!d || typeof d !== "object") continue;
      const key = d.case_id ?? "__none__";
      const list = buckets.get(key);
      if (list) list.push(d);
      else buckets.set(key, [d]);
    }
    const built: ArchiveCaseGroup[] = [];
    for (const [key, list] of buckets.entries()) {
      const c = key === "__none__" ? undefined : caseMap.get(key);
      const client = c?.client_id ? clientMap.get(c.client_id) : undefined;
      const judgments = list.filter(
        (d) =>
          typeof d.doc_type === "string" &&
          (d.doc_type.startsWith("judgment") || d.doc_type === "appeal_judgment"),
      ).length;
      const lawsuits = list.filter((d) => d.doc_type === "lawsuit").length;
      const memos = list.filter(
        (d) => d.doc_type === "memorandum_reply" || d.doc_type === "session_minutes",
      ).length;
      const others = Math.max(0, list.length - judgments - lawsuits - memos);
      const nextDeadline =
        list
          .map((d) => d.appeal_deadline)
          .filter((v): v is string => Boolean(v))
          .sort()[0] ?? null;
      built.push({
        key,
        caseData: c,
        client,
        docs: list,
        counts: { judgments, lawsuits, memos, others, total: list.length },
        nextDeadline,
      });
    }
    // Cases with most docs first; unlinked bucket sinks to the bottom.
    built.sort((a, b) => {
      if (a.key === "__none__") return 1;
      if (b.key === "__none__") return -1;
      return b.counts.total - a.counts.total;
    });
    return built;
  }, [docs, caseMap, clientMap]);

  if (groups.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground"
        data-testid="archive-empty"
      >
        لا توجد مستندات مطابقة
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="archive-grouped-by-case">
      {groups.map((g) => (
        <CaseArchiveCard
          key={g.key}
          group={g}
          docTypes={docTypes}
          onPreview={onPreview}
          onDownload={onDownload}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
