import test from "node:test";
import assert from "node:assert/strict";
import { exportColumns, recordsToCSV } from "./csv-export.mjs";

const record = {
  url: "https://example.org",
  row: 0,
  metadata: { "Initiative / Programme": 'Title, "one"' },
  summary: "First line\nSecond line",
  pedagogicalSummary: "Pedagogy",
  prioritySummary: "Priority",
  educationalTechnologySummary: "Tools",
  inclusion: { reason: "Included" },
  classifications: [
    { category: "Teachers", label: "no", reason: "No evidence" },
    { category: "Teachers", label: "yes", reason: "Other evidence" },
    { category: "Research", label: "unknown", reason: "Not sure" },
  ],
};

test("lists all requested fields and one reason column per category", () => {
  const columns = exportColumns([record, { url: "https://other.example", classifications: [{ category: "New label" }] }]);
  assert.deepEqual(columns.map(column => column.id), [
    "url", "title", "row", "inclusionReason", "summary", "pedagogicalSummary", "prioritySummary",
    "educationalTechnologySummary",
    "classification:New label", "classification:Research", "classification:Teachers",
  ]);
  assert.equal(columns.find(column => column.id === "classification:Teachers").value(record), "No evidence\nOther evidence");
  assert.equal(columns.find(column => column.id === "classification:Research").value(record), "Not sure");
});

test("exports selected columns in order with headers, UTF-8 marker and CSV escaping", () => {
  const columns = exportColumns([record]);
  const selected = ["title", "row", "summary", "classification:Teachers", "inclusionReason"]
    .map(id => columns.find(column => column.id === id));
  assert.equal(recordsToCSV([record, { url: "https://example.org", classifications: [] }], selected),
    '\ufeff"title","row","summary","classification reason: Teachers","inclusionReason"\r\n' +
    '"Title, ""one""","0","First line\nSecond line","No evidence\nOther evidence","Included"\r\n' +
    '"https://example.org","","","",""\r\n');
  assert.equal(recordsToCSV([], selected), '\ufeff"title","row","summary","classification reason: Teachers","inclusionReason"\r\n');
  assert.throws(() => recordsToCSV([record], []), /at least one column/);
});

test("supports legacy analysis data and neutralises spreadsheet formulas", () => {
  const legacy = { url: "=danger", row: -1, analysis: { summary: " \t=1+1", classifications: [
    { category: "+formula", reason: "@SUM(A1)" },
  ] } };
  const columns = exportColumns([legacy]);
  assert.equal(recordsToCSV([legacy], columns),
    '\ufeff"url","title","row","inclusionReason","summary","pedagogicalSummary","prioritySummary","educationalTechnologySummary","classification reason: +formula"\r\n' +
    '"\'=danger","\'=danger","-1","","\' \t=1+1","","","","\'@SUM(A1)"\r\n');
});
