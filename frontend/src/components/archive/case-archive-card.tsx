import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  File as FileIcon,
  FileCheck,
  FileImage,
  FileText,
  Gavel,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StatTile } from "./stat-tile";
import {
  safeDocTitle,
  safeDocTypeLabel,
  safeFmtSize,
  type ArchiveCaseGroup,
  type ArchiveDocActionHandlers,
  type ArchiveDocRow,
  type ArchiveDocTypeMeta,
} from "./types";

export interface CaseArchiveCardProps extends ArchiveDocActionHandlers {
  group: ArchiveCaseGroup;
  docTypes: readonly ArchiveDocTypeMeta[];
}

function iconFor(mime: string | null | undefined): LucideIcon {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("pdf")) return FileText;
  return FileIcon;
}

export function CaseArchiveCard({
  group,
  docTypes,
  onPreview,
  onDownload,
  onEdit,
  onDelete,
}: CaseArchiveCardProps) {
  const [open, setOpen] = useState(false);
  const c = group.caseData;
  const client = group.client;
  const title = c
    ? `${c.case_number || "—"} — ${(c.title ?? "").trim() || "قضية بدون عنوان"}`
    : "مستندات غير مرتبطة بقضية";
  const court = c?.court ?? null;
  const clientName = client?.full_name ?? null;

  return (
    <Card
      className="card-3d border-none p-5 flex flex-col gap-3"
      data-testid={`archive-case-card-${c?.case_number ?? "unlinked"}`}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-gold shadow-md">
          <Briefcase className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate" title={title}>
            {title}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-muted-foreground">
            {clientName && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {clientName}
              </span>
            )}
            {court && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {court}
              </span>
            )}
          </div>
        </div>
        {c?.case_number && (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link to="/app/cases" search={{ case: c.case_number } as any}>
              <ArrowLeft className="h-3.5 w-3.5 ml-1" /> القضية
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <StatTile icon={Gavel} label="أحكام" value={group.counts.judgments} tone="rose" />
        <StatTile icon={FileText} label="صحف" value={group.counts.lawsuits} tone="violet" />
        <StatTile icon={FileCheck} label="مذكرات" value={group.counts.memos} tone="emerald" />
        <StatTile icon={FileIcon} label="أخرى" value={group.counts.others} tone="slate" />
      </div>

      {group.nextDeadline && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-1">
          ⏰ أقرب مهلة استئناف: {group.nextDeadline}
        </div>
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between">
            <span>عرض جميع المستندات ({group.counts.total})</span>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-2">
          {group.docs.map((d: ArchiveDocRow) => {
            const Icon = iconFor(d.mime_type);
            const typeLabel = safeDocTypeLabel(d.doc_type, docTypes);
            const displayTitle = safeDocTitle(d);
            return (
              <div
                key={d.id}
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 p-2"
                data-testid={`archive-doc-row-${d.id}`}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" title={displayTitle}>
                    {displayTitle}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                    <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                      {typeLabel}
                    </Badge>
                    <span>{safeFmtSize(d.file_size)}</span>
                    {d.filed_date && (
                      <span className="flex items-center gap-0.5">
                        <Calendar className="h-2.5 w-2.5" /> {d.filed_date}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onPreview(d)}
                    disabled={!d.storage_path}
                    title="عرض"
                    aria-label={`عرض ${displayTitle}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onDownload(d)}
                    disabled={!d.storage_path}
                    title="تحميل"
                    aria-label={`تحميل ${displayTitle}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onEdit(d)}
                    title="تعديل"
                    aria-label={`تعديل ${displayTitle}`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(d)}
                    title="حذف"
                    aria-label={`حذف ${displayTitle}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
