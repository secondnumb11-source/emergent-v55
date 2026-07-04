// XLSX export for the cases list. Consumes the already-filtered rows the UI
// is showing so exports always match the on-screen filters. Uses SheetJS
// (installed as `xlsx`).
import * as XLSX from "xlsx";

export type CaseExportRow = {
  case_number?: string | null;
  title?: string | null;
  client_name?: string | null;
  court?: string | null;
  case_type?: string | null;
  status?: string | null;
  next_session_date?: string | null;
  plaintiff?: string | null;
  defendant?: string | null;
  opened_at?: string | null;
};

const HEADERS: Array<[keyof CaseExportRow, string]> = [
  ["case_number", "رقم القضية"],
  ["title", "عنوان القضية"],
  ["client_name", "العميل"],
  ["court", "المحكمة"],
  ["case_type", "النوع"],
  ["status", "الحالة"],
  ["next_session_date", "تاريخ الجلسة القادمة"],
  ["plaintiff", "الموكل / المدعي"],
  ["defendant", "المدعى عليه"],
  ["opened_at", "تاريخ الفتح"],
];

export function buildCasesWorkbook(rows: CaseExportRow[]): XLSX.WorkBook {
  const data = rows.map((r) => {
    const out: Record<string, string> = {};
    for (const [key, label] of HEADERS) out[label] = (r[key] ?? "") as string;
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: HEADERS.map(([, l]) => l) });
  // Reasonable column widths so Arabic text is legible in Excel.
  ws["!cols"] = HEADERS.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "القضايا");
  return wb;
}

export function downloadCasesXlsx(rows: CaseExportRow[], filename?: string): void {
  const wb = buildCasesWorkbook(rows);
  const name = filename ?? `cases-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
}
