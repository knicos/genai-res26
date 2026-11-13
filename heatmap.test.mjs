import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { categoryOverlap } from "./heatmap.mjs";
import { analysisStatus, classifications, parseJSONL } from "./directory.mjs";

const record = (...categories) => ({
  classifications: categories.map(category => ({ category, label: "yes" })),
});

test("counts positive overlap once per record and excludes all error types", () => {
  const a = record("A", "B", "A");
  const explicit = { ...record("A", "C"), error: { message: "Failed" } };
  const unknown = { classifications: [{ category: "D", label: "unknown" }] };
  const negative = { classifications: [{ category: "C", label: "no" }] };
  const result = categoryOverlap([a, a, record("B"), explicit, unknown, negative]);
  const value = (a, b) => result.counts[result.categories.indexOf(a)][result.categories.indexOf(b)];
  assert.equal(result.analysedCount, 4);
  assert.equal(result.excludedCount, 2);
  assert.deepEqual(new Set(result.categories), new Set(["A", "B", "C"]));
  assert.equal(value("A", "A"), 2);
  assert.equal(value("B", "B"), 3);
  assert.equal(value("A", "B"), 2);
  assert.equal(value("B", "A"), 2);
  assert.equal(value("C", "C"), 0);
});

test("keeps groups contiguous and sorts by positive density within each group", () => {
  const records = [
    record("Company", "Teachers", "Using AI", "New category"),
    record("Government or Statutory Body", "Adult Education", "Policy and Strategy", "Using AI"),
    record("Government or Statutory Body", "Teachers", "Frameworks and Standards", "Understanding AI"),
    record("Company", "Adult Education", "Frameworks and Standards", "Using AI"),
    record("New category"),
    record("New category"),
    { classifications: [{ category: "Other or unknown producer", label: "no" }] },
  ];
  const result = categoryOverlap(records);
  assert.deepEqual(result.categories, [
    "Company", "Government or Statutory Body", "Other or unknown producer",
    "Adult Education", "Teachers",
    "Frameworks and Standards", "Policy and Strategy",
    "Using AI", "Understanding AI",
    "New category",
  ]);
  assert.deepEqual(result.counts.map((row, i) => row[i]), [2, 2, 0, 2, 2, 2, 1, 3, 1, 3]);
  assert.equal(result.counts[0][4], 1);
  assert.equal(result.counts[4][0], 1);
  assert.deepEqual(categoryOverlap([...records].reverse()), result);
});

test("handles empty, all-error, single-category, and zero-positive data", () => {
  for (const records of [[], [{ error: "Failed" }]]) {
    const result = categoryOverlap(records);
    assert.deepEqual(result.categories, []);
    assert.deepEqual(result.counts, []);
  }
  assert.deepEqual(categoryOverlap([record("Only")]).counts, [[1]]);
  const zero = categoryOverlap([{ classifications: [{ category: "No", label: "no" }] }]);
  assert.deepEqual(zero.counts, [[0]]);
});

test("optionally sorts globally by density without changing counts or exclusions", () => {
  const records = [
    record("Company", "Teachers", "Using AI"),
    record("Teachers", "Using AI", "Unknown category"),
    record("Using AI"),
    { ...record("Excluded"), inclusion: { include: "no" } },
  ];
  const grouped = categoryOverlap(records);
  const options = { groupByCategory: false };
  const global = categoryOverlap(records, options);
  assert.deepEqual(grouped.categories, ["Company", "Teachers", "Using AI", "Unknown category"]);
  assert.deepEqual(global.categories, ["Using AI", "Teachers", "Company", "Unknown category"]);
  assert.deepEqual(global.counts.map((row, i) => row[i]), [3, 2, 1, 1]);
  assert.equal(global.analysedCount, grouped.analysedCount);
  assert.equal(global.excludedCount, grouped.excludedCount);
  for (const [i, a] of global.categories.entries()) {
    for (const [j, b] of global.categories.entries()) {
      assert.equal(global.counts[i][j], grouped.counts[grouped.categories.indexOf(a)][grouped.categories.indexOf(b)]);
    }
  }
  assert.deepEqual(categoryOverlap([...records].reverse(), options), global);
  assert.deepEqual(categoryOverlap([], options).categories, []);
});

test("every dataset cell equals the independent analysed positive intersection", async () => {
  const records = parseJSONL(await readFile(new URL("./results.jsonl", import.meta.url), "utf8"));
  const analysed = records.filter(record => record.inclusion?.include !== "no" && analysisStatus(record) === "analysed");
  const result = categoryOverlap(records);
  assert.equal(result.analysedCount, analysed.length);
  for (const [i, a] of result.categories.entries()) {
    for (const [j, b] of result.categories.entries()) {
      const expected = analysed.filter(record => [a, b].every(category =>
        classifications(record).some(item => item.category === category && item.label === "yes"),
      )).length;
      assert.equal(result.counts[i][j], expected, `${a} + ${b}`);
    }
  }
});

test("filtered counts retain unfiltered labels and density order in both grouping modes", () => {
  const records = [
    record("Company", "Teachers", "Using AI"),
    record("Company", "Adult Education", "Understanding AI"),
    record("Government or Statutory Body", "Adult Education", "Understanding AI"),
    record("Adult Education", "Understanding AI"),
    { ...record("Excluded"), inclusion: { include: "no" } },
  ];
  for (const groupByCategory of [true, false]) {
    const baseline = categoryOverlap(records, { groupByCategory });
    const filtered = categoryOverlap([records[0]], { groupByCategory, referenceRecords: records });
    assert.deepEqual(filtered.categories, baseline.categories);
    assert.equal(filtered.analysedCount, 1);
    for (const [i, a] of filtered.categories.entries()) {
      for (const [j, b] of filtered.categories.entries()) {
        assert.equal(filtered.counts[i][j], ["Company", "Teachers", "Using AI"].includes(a)
          && ["Company", "Teachers", "Using AI"].includes(b) ? 1 : 0);
      }
    }
    const empty = categoryOverlap([], { groupByCategory, referenceRecords: records });
    assert.deepEqual(empty.categories, baseline.categories);
    assert.ok(empty.counts.flat().every(count => count === 0));
    assert.equal(empty.analysedCount, 0);
    assert.ok(!empty.categories.includes("Excluded"));
  }
});

test("column group options project columns without changing rows or analysed records", () => {
  const records = [
    record("Company", "Teachers", "Using AI"),
    record("Company", "Frameworks and Standards", "Using AI"),
    record("Teachers", "New category"),
    { ...record("Excluded"), inclusion: { include: "no" } },
    { ...record("Failed"), error: "Failed" },
  ];
  for (const groupByCategory of [true, false]) {
    const full = categoryOverlap(records, { groupByCategory });
    for (const columnGroups of [
      ["audience", "type", "topic"], ["producer"], ["topic"], ["ungrouped"], [],
    ]) {
      const result = categoryOverlap(records, { groupByCategory, columnGroups });
      assert.deepEqual(result.categories, full.categories);
      assert.equal(result.analysedCount, 3);
      assert.equal(result.excludedCount, 2);
      const expected = {
        producer: ["Company"], audience: ["Teachers"],
        type: ["Frameworks and Standards"], topic: ["Using AI"], ungrouped: ["New category"],
      };
      assert.deepEqual(result.columnCategories, full.categories.filter(category =>
        columnGroups.some(group => expected[group].includes(category)),
      ));
      for (const [i, row] of result.counts.entries()) {
        assert.deepEqual(row, result.columnCategories.map(category =>
          full.counts[i][full.columnCategories.indexOf(category)],
        ));
      }
    }
    assert.deepEqual(full.columnCategories, full.categories);
  }
});

test("row and column groups can be selected independently without altering counts", () => {
  const records = [record("Company", "Teachers", "Using AI"), record("Teachers", "Understanding AI")];
  for (const groupByCategory of [true, false]) {
    const full = categoryOverlap(records, { groupByCategory });
    for (const rowGroups of [["producer"], ["audience", "topic"], [], ["ungrouped"]]) {
      const selected = categoryOverlap(records, { groupByCategory, rowGroups, columnGroups: ["topic"] });
      assert.deepEqual(selected.columnCategories, full.columnCategories.filter(category =>
        ["Using AI", "Understanding AI"].includes(category),
      ));
      const expectedRows = full.categories.filter(category =>
        (rowGroups.includes("producer") && category === "Company")
        || (rowGroups.includes("audience") && category === "Teachers")
        || (rowGroups.includes("topic") && ["Using AI", "Understanding AI"].includes(category)),
      );
      assert.deepEqual(selected.categories, expectedRows);
      assert.deepEqual(selected.counts, expectedRows.map(a => selected.columnCategories.map(b =>
        full.counts[full.categories.indexOf(a)][full.columnCategories.indexOf(b)],
      )));
      assert.equal(selected.analysedCount, full.analysedCount);
    }
  }
});

test("excludes pending records and round errors while retaining successful partial analyses", () => {
  const pending = { classifications: [], roundStatus: {} };
  const failed = { ...record("Error only"), roundStatus: { "4": { status: "retry", error: { message: "Failed" } } } };
  const fetchError = { ...record("Fetch error"), roundStatus: { "1": { status: "success", error: { message: "Unreadable" } } } };
  const summaryOnly = { classifications: [], summary: "Initial summary", roundStatus: { "1": { status: "success" } } };
  const result = categoryOverlap([pending, failed, fetchError, summaryOnly, record("Teachers")]);
  assert.equal(result.analysedCount, 2);
  assert.equal(result.excludedCount, 3);
  assert.deepEqual(result.categories, ["Teachers"]);
  assert.deepEqual(result.counts, [[1]]);
});

test("excluded initiatives never contribute to matrix categories, counts, or totals", () => {
  const included = { ...record("A", "B"), inclusion: { include: "yes" } };
  const excluded = { ...record("A", "Excluded only"), inclusion: { include: "no" } };
  const undecided = { ...record("B"), inclusion: { include: "unknown" } };
  const result = categoryOverlap([included, excluded, undecided, record("B")]);
  assert.equal(result.analysedCount, 3);
  assert.equal(result.excludedCount, 1);
  assert.deepEqual(result.categories, ["B", "A"]);
  assert.deepEqual(result.counts, [[3, 1], [1, 1]]);
  assert.deepEqual(categoryOverlap([excluded]).categories, []);
});
