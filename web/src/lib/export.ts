/**
 * Data export utilities for CSV and JSON browser downloads.
 */

function escapeCSVField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert an array of objects to a CSV string and trigger a browser download.
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string,
): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.map(escapeCSVField).join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const str = val === null || val === undefined ? "" : String(val);
          return escapeCSVField(str);
        })
        .join(","),
    ),
  ];
  const csvString = csvRows.join("\n");

  triggerDownload(csvString, filename.endsWith(".csv") ? filename : `${filename}.csv`, "text/csv");
}

/**
 * Trigger a JSON file download.
 */
export function exportToJSON(data: unknown, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  triggerDownload(jsonString, filename.endsWith(".json") ? filename : `${filename}.json`, "application/json");
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
