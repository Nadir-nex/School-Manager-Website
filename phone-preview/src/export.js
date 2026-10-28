// Report export: genuine .xlsx via the xlsx library (never HTML renamed
// to .xls), and browser printing (window.print + print stylesheet) for
// PDF via the system's Save as PDF. Exports only the rows the user
// already filtered on screen. Arabic text passes through as Unicode;
// RTL is handled by the print stylesheet.
import * as XLSX from "xlsx";

export function formatDZD(value, lang = "en") {
  const amount = Number(value) || 0;
  try {
    return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(amount)} DZD`;
  } catch {
    return `${amount} DZD`;
  }
}

export function buildWorkbook(sheets) {
  // sheets: [{ name, headers: [..], rows: [[..], ..] }]
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    ws["!cols"] = sheet.headers.map((h) => ({ wch: Math.max(12, Math.min(40, String(h).length + 4)) }));
    XLSX.utils.book_append_sheet(wb, ws, String(sheet.name).slice(0, 31));
  }
  return wb;
}

export function workbookBytes(workbook) {
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Uint8Array(out);
}

export function downloadBytes(bytes, filename, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportXlsx(filename, sheets) {
  downloadBytes(
    workbookBytes(buildWorkbook(sheets)),
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

export function printReport() {
  if (typeof window !== "undefined" && typeof window.print === "function") {
    window.print();
    return true;
  }
  return false;
}
