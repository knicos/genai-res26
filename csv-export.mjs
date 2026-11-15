import { additionalSummaryFields, classifications, resourceName, summaryFor } from "./directory.mjs";

export function exportColumns(records) {
  const categories = [...new Set(records.flatMap(record =>
    classifications(record).map(item => item.category)
      .filter(category => typeof category === "string" && category.trim()),
  ))].sort((a, b) => a.localeCompare(b));
  return [
    { id: "url", label: "URL", header: "url", group: "Initiative", value: record => record.url },
    { id: "title", label: "Title", header: "title", group: "Initiative", value: resourceName },
    { id: "row", label: "Original row", header: "row", group: "Initiative", value: record => record.row },
    { id: "inclusionReason", label: "Inclusion reason", header: "inclusionReason", group: "Initiative", value: record => record.inclusion?.reason },
    { id: "summary", label: "Summary", header: "summary", group: "Summaries", value: summaryFor },
    ...additionalSummaryFields.map(({ field, label }) => ({
      id: field, label, header: field, group: "Summaries", value: record => record[field],
    })),
    ...categories.map(category => ({
      id: `classification:${category}`,
      label: category,
      header: `classification reason: ${category}`,
      group: "Classification reasons",
      value: record => classifications(record)
        .filter(item => item.category === category && item.reason != null)
        .map(item => item.reason).join("\n"),
    })),
  ];
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function recordsToCSV(records, columns) {
  if (!columns.length) throw new Error("Select at least one column to export.");
  const lines = [
    columns.map(column => csvCell(column.header)).join(","),
    ...records.map(record => columns.map(column => csvCell(column.value(record))).join(",")),
  ];
  return `\ufeff${lines.join("\r\n")}\r\n`;
}
