import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { categoryOverlap } from "./heatmap.mjs";
import { analysisError, classifications, parseJSONL } from "./directory.mjs";

const record = (...categories) => ({
  analysis: { classifications: categories.map(category => ({ category, label: "yes" })) },
});

test("counts positive overlap once per record and excludes all error types", () => {
  const a = record("A", "B", "A");
  const explicit = { ...record("A", "C"), error: { message: "Failed" } };
  const unknown = { analysis: { classifications: [{ category: "D", label: "unknown" }] } };
  const negative = { analysis: { classifications: [{ category: "C", label: "no" }] } };
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

test("groups strongly overlapping categories together deterministically", () => {
  const records = [record("A", "Z"), record("B", "Y"), record("B", "Y")];
  const result = categoryOverlap(records);
  assert.equal(Math.abs(result.categories.indexOf("A") - result.categories.indexOf("Z")), 1);
  assert.equal(Math.abs(result.categories.indexOf("B") - result.categories.indexOf("Y")), 1);
  assert.deepEqual(categoryOverlap([...records].reverse()), result);
});

test("handles empty, all-error, single-category, and zero-positive data", () => {
  for (const records of [[], [{ error: "Failed" }]]) {
    const result = categoryOverlap(records);
    assert.deepEqual(result.categories, []);
    assert.deepEqual(result.counts, []);
  }
  assert.deepEqual(categoryOverlap([record("Only")]).counts, [[1]]);
  const zero = categoryOverlap([{ analysis: { classifications: [{ category: "No", label: "no" }] } }]);
  assert.deepEqual(zero.counts, [[0]]);
});

test("every dataset cell equals the independent analysed positive intersection", async () => {
  const records = parseJSONL(await readFile(new URL("./results.jsonl", import.meta.url), "utf8"));
  const analysed = records.filter(record => !analysisError(record));
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
