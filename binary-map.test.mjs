import test from "node:test";
import assert from "node:assert/strict";
import { jaccardDistance, clusterProfiles } from "./clusters.mjs";
import { classificationProfiles, initiativeMap } from "./initiative-map.mjs";
import { readFile } from "node:fs/promises";
import { parseJSONL } from "./directory.mjs";

const record = (a, b, score = .9) => ({
  analysis: { classifications: [
    { category: "A", label: a, score },
    { category: "B", label: b, score },
  ] },
});

test("Jaccard ignores shared absences and handles empty positive sets", () => {
  assert.equal(jaccardDistance([1, 0, 0], [1, 0, 0]), 0);
  assert.equal(jaccardDistance([1, 0, 0], [0, 1, 0]), 1);
  assert.equal(jaccardDistance([1, 1, 0], [1, 0, 0]), .5);
  assert.equal(jaccardDistance([0, 0], [0, 0]), 0);
  assert.equal(jaccardDistance([0, 0], [1, 0]), 1);
});

test("binary profiles ignore confidence and treat no, unknown, and missing as absent", () => {
  const missing = { analysis: { classifications: [{ category: "A", label: "yes", score: .1 }] } };
  const records = [record("yes", "no", .1), record("yes", "unknown", 1), missing];
  const profiles = classificationProfiles(records, "binary");
  assert.ok(profiles.profiles.every(profile => JSON.stringify(profile.vector) === "[1,0]"));
  const result = initiativeMap(records, "binary");
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].records.length, 3);
  assert.equal(result.groups[0].x, 0);
  assert.equal(result.groups[0].y, 0);
  assert.equal(result.clusters.length, 1);
  assert.ok(initiativeMap(records).groups.length > 1);
});

test("binary mode still excludes errors and tolerates score-only duplicate differences", () => {
  const duplicate = record("yes", "no");
  duplicate.analysis.classifications.push({ category: "A", label: "yes", score: .1 });
  const result = initiativeMap([duplicate, record("unknown", "unknown"), { ...record("yes", "yes"), error: "Failed" }], "binary");
  assert.equal(result.errorCount, 2);
  assert.equal(result.invalidCount, 0);
  assert.equal(result.groups.length, 1);
});

test("Jaccard medoids keep exact binary matches together and describe only positive categories", () => {
  const profiles = [[1, 0], [1, 0], [1, 0], [0, 1], [0, 1], [0, 1]].map(vector => ({ vector }));
  const result = clusterProfiles(profiles, ["A", "B"], "binary");
  assert.equal(result.clusters.length, 2);
  assert.equal(result.silhouette, 1);
  assert.equal(new Set(result.assignments.slice(0, 3)).size, 1);
  assert.notEqual(result.assignments[0], result.assignments[3]);
  assert.ok(result.clusters.every(cluster => cluster.label.includes("(yes)")));
  assert.deepEqual(clusterProfiles(profiles, ["A", "B"], "binary"), result);
});

test("UMAP handles a small binary dataset deterministically", () => {
  const result = initiativeMap([record("yes", "no"), record("yes", "yes"), record("no", "yes")], "binary");
  assert.ok(result.groups.every(group => Number.isFinite(group.x) && Number.isFinite(group.y)));
  assert.equal(new Set(result.groups.map(group => `${group.x},${group.y}`)).size, 3);
  assert.deepEqual(initiativeMap([record("yes", "no"), record("yes", "yes"), record("no", "yes")], "binary"), result);
  assert.deepEqual(initiativeMap([], "binary").groups, []);
});

test("binary UMAP preserves neighborhoods of shared positives rather than shared absences", () => {
  const records = Array.from({ length: 40 }, (_, i) => ({
    analysis: { classifications: Array.from({ length: 30 }, (_, category) => ({
      category: `Category ${category}`,
      label: category < 20
        ? (Math.floor(category / 10) === Math.floor(i / 20) ? "yes" : "no")
        : ((i % 20) & (1 << (category - 20)) ? "yes" : "no"),
      score: .9,
    })) },
  }));
  const model = initiativeMap(records, "binary");
  let matches = 0;
  for (const [i, group] of model.groups.entries()) {
    const nearest = model.groups.map((other, j) => ({ index: j, distance: Math.hypot(group.x - other.x, group.y - other.y) }))
      .filter(item => item.index !== i).sort((a, b) => a.distance - b.distance).slice(0, 5);
    matches += nearest.filter(item => (i < 20) === (item.index < 20)).length;
  }
  assert.ok(matches / 200 >= .95);
});

test("dataset binary mode is deterministic and ignores all score changes", async () => {
  const records = parseJSONL(await readFile(new URL("./results.jsonl", import.meta.url), "utf8"));
  const result = initiativeMap(records, "binary");
  const changed = records.map(record => ({
    ...record,
    analysis: record.analysis ? {
      ...record.analysis,
      classifications: record.analysis.classifications.map(item => ({ ...item, score: .01 })),
    } : undefined,
  }));
  const other = initiativeMap(changed, "binary");
  assert.deepEqual(result.groups.map(({ x, y, cluster, records }) => [x, y, cluster, records.length]),
    other.groups.map(({ x, y, cluster, records }) => [x, y, cluster, records.length]));
  assert.deepEqual(result.clusters, other.clusters);
  assert.ok(result.groups.every(group => Number.isFinite(group.x) && Number.isFinite(group.y)));
  assert.equal("explainedVariance" in result, false);
});
