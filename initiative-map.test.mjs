import test from "node:test";
import assert from "node:assert/strict";
import { classificationProfiles, initiativeMap } from "./initiative-map.mjs";
import { analysisError, parseJSONL } from "./directory.mjs";
import { readFile } from "node:fs/promises";

const record = (label, score, name = label) => ({
  url: `https://example.org/${name}`,
  analysis: { classifications: [{ category: "A", label, score }] },
});
const distance = (a, b) => Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));

test("profile distances combine distinct labels and raw confidence differences", () => {
  const records = [record("yes", .9), record("yes", .8), record("no", .9), record("unknown", .9)];
  records[3].analysis.classifications.push({ category: "B", label: "no", score: .5 });
  const { profiles } = classificationProfiles(records);
  assert.ok(Math.abs(distance(profiles[0].vector, profiles[1].vector) - .1) < 1e-12);
  assert.ok(distance(profiles[0].vector, profiles[2].vector) > 1);
  assert.ok(distance(profiles[2].vector, profiles[3].vector) > 1);
  const zero = classificationProfiles([record("yes", 0), record("no", 0)]);
  assert.equal(distance(zero.profiles[0].vector, zero.profiles[1].vector), Math.SQRT2);
});

test("excludes explicit and all-unknown errors and reports unusable profiles", () => {
  const explicit = { ...record("yes", 1), error: "Failure" };
  const empty = { analysis: { classifications: [] } };
  const conflict = record("yes", .8);
  conflict.analysis.classifications.push({ category: "A", label: "no", score: .8 });
  const result = initiativeMap([explicit, record("unknown", 1), empty, conflict, record("yes", .8)]);
  assert.equal(result.errorCount, 2);
  assert.equal(result.invalidCount, 2);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].x, 0);
  assert.equal(result.groups[0].y, 0);
});

test("missing categories and missing scores are distinct from unknown and zero confidence", () => {
  const missing = record("yes", undefined);
  const zero = record("yes", 0);
  const extra = record("no", .8);
  extra.analysis.classifications.push({ category: "B", label: "unknown", score: .9 });
  const { profiles } = classificationProfiles([missing, zero, extra]);
  assert.ok(distance(profiles[0].vector, profiles[1].vector) > 0);
  assert.deepEqual(profiles[0].vector.slice(7), Array(7).fill(0));
  assert.ok(profiles[2].vector[9] > 0);
});

test("UMAP is deterministic and merges only identical profiles", () => {
  const records = [.2, .4, .6, .8].map(score => record("yes", score));
  records.push(record("yes", .4, "Duplicate profile"));
  const result = initiativeMap(records);
  assert.equal(result.groups.length, 4);
  assert.equal(result.groups[1].records.length, 2);
  assert.ok(result.groups.every(group => Number.isFinite(group.x) && Number.isFinite(group.y)));
  assert.deepEqual(initiativeMap(records), result);
  assert.deepEqual(initiativeMap([]).groups, []);
});

test("small datasets have finite distinct coordinates without requiring UMAP neighbors", () => {
  for (const count of [1, 2, 3]) {
    const records = Array.from({ length: count }, (_, i) => record("yes", (i + 1) / 4));
    const model = initiativeMap(records);
    assert.equal(model.groups.length, count);
    assert.ok(model.groups.every(group => Number.isFinite(group.x) && Number.isFinite(group.y)));
    assert.equal(new Set(model.groups.map(group => `${group.x},${group.y}`)).size, count);
  }
});

test("UMAP preserves local neighborhoods for separated confidence profiles", () => {
  const records = Array.from({ length: 40 }, (_, i) => record(i < 20 ? "yes" : "no", .7 + (i % 20) / 100));
  const model = initiativeMap(records);
  const nearest = model.groups.map((group, i) => model.groups
    .map((other, j) => ({ index: j, distance: Math.hypot(group.x - other.x, group.y - other.y) }))
    .filter(item => item.index !== i).sort((a, b) => a.distance - b.distance).slice(0, 5)
    .filter(item => (i < 20) === (item.index < 20)).length);
  assert.ok(nearest.reduce((sum, count) => sum + count, 0) / 200 >= .95);
});

test("dataset projection is finite, deterministic, and represents every usable non-error record", async () => {
  const records = parseJSONL(await readFile(new URL("./results.jsonl", import.meta.url), "utf8"));
  const model = initiativeMap(records);
  assert.equal("explainedVariance" in model, false);
  assert.equal(model.groups.reduce((sum, group) => sum + group.records.length, 0) + model.invalidCount + model.errorCount, records.length);
  assert.ok(model.groups.every(group => Number.isFinite(group.x) && Number.isFinite(group.y) && group.records.every(record => !analysisError(record))));
  assert.deepEqual(initiativeMap(records), model);
});
