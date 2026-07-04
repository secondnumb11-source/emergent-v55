import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { exportRecordsBundle, type PdfField } from "@/lib/pdf-export";
import { toast } from "sonner";

export type PdfPreviewRecord = {
  title: string;
  subtitle?: string;
  fields: PdfField[];
  footer?: string;
  fileName?: string;
};

/**
 * Reusable preview dialog for the same styled record renderer used by
 * exportRecordsBundle. Renders every record as sanitised HTML inside an
 * iframe so the user sees exactly what the generated PDF will look like
 * before it downloads.
 */
export function PdfPreviewDialog({
  open,
  onOpenChange,
  records,
  bundleName,
  headline = "معاينة قبل توليد PDF",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  records: PdfPreviewRecord[];
  bundleName: string;
  headline?: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const html = useMemo(() => buildPreviewHtml(records), [records]);
  const [srcDoc, setSrcDoc] = useState<string>("");

  useEffect(() => {
    if (open) {
      setRendering(true);
      setSrcDoc(html);
      setError(null);
    } else {
      setSrcDoc("");
      setError(null);
      setRendering(false);
    }
  }, [open, html]);

  const download = async () => {
    if (!records.length) return;
    setError(null);
    setGenerating(true);
    try {
      await exportRecordsBundle({ records, mode: "combined", bundleName });
      toast.success("تم توليد ملف PDF");
      onOpenChange(false);
    } catch (e: any) {
      const msg = e?.message || "فشل توليد الملف";
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  // Guard: while generating, block outside-click/Escape close so users don't lose progress.
  const handleOpenChange = (v: boolean) => {
    if (!v && generating) return;
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden"
        aria-busy={generating || rendering}
        onEscapeKeyDown={(e) => {
          if (generating) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (generating) e.preventDefault();
        }}
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-right">
            <FileText className="h-5 w-5 text-[#8a6a1a]" /> {headline}
          </DialogTitle>
          <DialogDescription className="text-right">
            {records.length} سجل جاهز للتصدير. راجع المعاينة ثم انقر «تنزيل PDF».
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex-1 overflow-hidden bg-muted/30 relative"
          role="region"
          aria-label="معاينة الملف"
        >
          {records.length === 0 ? (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              لا توجد سجلات مطابقة للفلاتر الحالية.
            </div>
          ) : (
            <>
              <iframe
                title="معاينة PDF"
                srcDoc={srcDoc}
                className="w-full h-full border-0 bg-white"
                sandbox=""
                onLoad={() => setRendering(false)}
              />
              {rendering && (
                <div
                  className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-[#8a6a1a]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جارٍ تجهيز المعاينة...
                  </div>
                </div>
              )}
              {generating && (
                <div
                  className="absolute inset-x-0 top-0 bg-[#8a6a1a]/95 text-white text-xs font-bold px-4 py-2 text-right"
                  role="status"
                  aria-live="assertive"
                >
                  جارٍ توليد ملف PDF... يرجى عدم إغلاق النافذة
                </div>
              )}
              {error && !generating && (
                <div
                  className="absolute inset-x-3 bottom-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-right"
                  role="alert"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs font-bold text-destructive">فشل توليد الملف</div>
                      <div className="text-[11px] text-destructive/80 mt-0.5">{error}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 rounded-full"
                      onClick={download}
                    >
                      <RefreshCw className="h-3 w-3" /> إعادة المحاولة
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t gap-2 sm:justify-between">
          <div className="text-[11px] text-muted-foreground self-center">{bundleName}.pdf</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
              إلغاء
            </Button>
            <Button
              onClick={download}
              disabled={generating || records.length === 0}
              className="gap-1.5"
              aria-label={generating ? "جاري توليد الملف" : "تنزيل PDF"}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {generating ? "جاري التوليد..." : "تنزيل PDF"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function buildPreviewHtml(records: PdfPreviewRecord[]): string {
  const pages = records
    .map((rec) => {
      const rows = rec.fields
        .filter((f) => f.value !== null && f.value !== undefined && f.value !== "")
        .map(
          (f) => `
        <tr>
          <th style="text-align:right;padding:12px 14px;background:#0c1426;color:#d4af37;width:38%;border:1px solid #d4af37;font-weight:800;font-size:13px;">${esc(f.label)}</th>
          <td style="text-align:right;padding:12px 14px;background:#fff;border:1px solid #e6d8a5;font-size:13px;">${esc(String(f.value))}</td>
        </tr>`,
        )
        .join("");
      return `
      <section style="border:3px double #d4af37;padding:28px;border-radius:18px;background:#fffdf6;margin:24px auto;max-width:794px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid #d4af37;">
          <div>
            <div style="font-size:11px;letter-spacing:.3em;color:#8b6b22;font-weight:700;">منصة العدالة</div>
            <h1 style="margin:6px 0 0;font-size:22px;color:#0c1426;font-weight:800;">${esc(rec.title)}</h1>
            ${rec.subtitle ? `<div style="margin-top:4px;font-size:12px;color:#5b6478;">${esc(rec.subtitle)}</div>` : ""}
          </div>
          <div style="text-align:left;font-size:11px;color:#5b6478;">معاينة</div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:18px;direction:rtl;">${rows}</table>
        ${rec.footer ? `<div style="margin-top:22px;padding:12px;border-top:1px dashed #d4af37;font-size:11px;color:#5b6478;">${esc(rec.footer)}</div>` : ""}
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8" /><title>معاينة</title>
<style>
  body { margin:0; background:#fdfaf3; font-family: Tajawal, system-ui, -apple-system, "Segoe UI", sans-serif; color:#0c1426; }
</style>
</head>
<body>${pages}</body>
</html>`;
}
