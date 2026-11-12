import test from "node:test";
import assert from "node:assert/strict";
import { clusterProfiles, silhouetteScore } from "./clusters.mjs";
import { classificationProfiles, initiativeMap } from "./initiative-map.mjs";

test("silhouette uses Euclidean means and assigns singleton silhouettes zero", () => {
  const positions = [0, 1, 10, 11];
  const distances = positions.map(a => positions.map(b => Math.abs(a - b)));
  const expected = ((1 - 1 / 10.5) + (1 - 1 / 9.5)) / 2;
  assert.ok(Math.abs(silhouetteScore(distances, [0, 0, 1, 1]) - expected) < 1e-12);
  assert.equal(silhouetteScore([[0, 1], [1, 0]], [0, 1]), 0);
  assert.equal(silhouetteScore(distances, [0, 0, 0, 0]), 0);
});

test("automatic k-means finds well-separated groups reproducibly", () => {
  const vectors = [0, .1, .2, 10, 10.1, 10.2].map(value => ({ vector: [value] }));
  const result = clusterProfiles(vectors, []);
  assert.equal(result.clusters.length, 2);
  assert.ok(result.silhouette > .98);
  assert.ok(result.assignments.slice(0, 3).every(value => value === result.assignments[0]));
  assert.ok(result.assignments.slice(3).every(value => value !== result.assignments[0]));
  assert.deepEqual(clusterProfiles(vectors, []), result);
  assert.equal(result.clusters.reduce((sum, cluster) => sum + cluster.count, 0), 6);
});

test("empty, identical, and too-small samples do not invent supported splits", () => {
  assert.deepEqual(clusterProfiles([], []).clusters, []);
  for (const vectors of [[[1]], [[1], [1], [1]], [[0], [1]]]) {
    const result = clusterProfiles(vectors.map(vector => ({ vector })), []);
    assert.equal(result.clusters.length, 1);
    assert.equal(result.silhouette, 0);
  }
});

test("cluster labels describe distinctive majority labels and duplicate profiles stay together", () => {
  const records = ["yes", "yes", "yes", "no", "no", "no"].map((label, i) => ({
    url: `https://example.org/${i}`,
    analysis: { classifications: [{ category: "University", label, score: .9 }] },
  }));
  const profiles = classificationProfiles(records);
  const result = clusterProfiles(profiles.profiles, profiles.categories);
  assert.equal(result.clusters.length, 2);
  assert.ok(result.clusters.some(cluster => cluster.label.includes("University (yes)")));
  assert.ok(result.clusters.some(cluster => cluster.label.includes("University (no)")));
  assert.ok(result.clusters.every(cluster => cluster.descriptors.some(text => text.includes("100%"))));
  const map = initiativeMap(records);
  assert.equal(map.groups.length, 2);
  assert.ok(map.groups.every(group => group.records.length === 3 && map.clusters.some(cluster => cluster.id === group.cluster)));
});

test("manual cluster counts override automatic selection in both comparison modes", () => {
  const records = Array.from({ length: 8 }, (_, i) => ({
    analysis: { classifications: ["A", "B", "C"].map((category, bit) => ({
      category, label: i & (1 << bit) ? "yes" : "no", score: .8,
    })) },
  }));
  for (const mode of ["binary", "confidence"]) {
    for (const count of [1, 2, 4, 6]) {
      const model = initiativeMap(records, mode, count);
      assert.equal(model.clusters.length, count);
      assert.equal(model.clusters.reduce((sum, cluster) => sum + cluster.count, 0), 8);
      assert.ok(model.clusters.every(cluster => cluster.count > 0));
    }
    const single = initiativeMap(records, mode, 1);
    const multiple = initiativeMap(records, mode, 4);
    assert.deepEqual(single.groups.map(({x, y}) => [x, y]), multiple.groups.map(({x, y}) => [x, y]));
  }
});

test("manual clustering rejects invalid or impossible counts rather than falling back", () => {
  const profiles = [{ vector: [1, 0] }, { vector: [0, 1] }];
  for (const mode of ["binary", "confidence"]) {
    assert.equal(clusterProfiles(profiles, [], mode, 2).clusters.length, 2);
    assert.throws(() => clusterProfiles(profiles, [], mode, 3), /distinct profiles/);
    for (const count of [0, 7, 1.5, "2", NaN]) {
      assert.throws(() => clusterProfiles(profiles, [], mode, count), /integer from 1 to 6/);
    }
  }
});
