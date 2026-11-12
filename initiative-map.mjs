import { analysisError, classifications } from "./directory.mjs";
import { clusterProfiles, jaccardDistance } from "./clusters.mjs";
import { UMAP } from "./vendor/umap.mjs";

const labels = ["yes", "no", "unknown"];

export function classificationProfiles(records, mode = "confidence") {
  const analysed = records.filter(record => !analysisError(record));
  const categories = [...new Set(analysed.flatMap(record =>
    classifications(record).map(item => item.category),
  ))].filter(category => typeof category === "string" && category).sort();
  const profiles = [];
  for (const record of analysed) {
    const items = classifications(record);
    if (!items.length || items.some(item =>
      !categories.includes(item.category) || !labels.includes(item.label),
    )) continue;
    const byCategory = new Map();
    let conflicting = false;
    for (const item of items) {
      const previous = byCategory.get(item.category);
      if (previous && (mode === "binary"
        ? (previous.label === "yes") !== (item.label === "yes")
        : previous.label !== item.label || previous.score !== item.score)) conflicting = true;
      byCategory.set(item.category, item);
    }
    if (conflicting) continue;
    const vector = categories.flatMap(category => {
      const item = byCategory.get(category);
      if (mode === "binary") return [item?.label === "yes" ? 1 : 0];
      if (!item) return Array(7).fill(0);
      const index = labels.indexOf(item.label);
      const validScore = typeof item.score === "number" && Number.isFinite(item.score) && item.score >= 0 && item.score <= 1;
      const values = Array(7).fill(0);
      values[index] = 1;
      if (validScore) values[index + 3] = item.score;
      else values[6] = 1;
      return values;
    });
    profiles.push({ record, vector });
  }
  return {
    categories, profiles,
    errorCount: records.length - analysed.length,
    invalidCount: analysed.length - profiles.length,
  };
}

function seededRandom() {
  let state = 42;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function embedProfiles(vectors, mode) {
  const distance = mode === "binary" ? jaccardDistance : (a, b) =>
    Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));
  if (vectors.length === 1) return [[0, 0]];
  if (vectors.length === 2) {
    const separation = distance(vectors[0], vectors[1]) / 2;
    return [[-separation, 0], [separation, 0]];
  }
  const nNeighbors = Math.min(15, vectors.length - 1);
  const umap = new UMAP({
    nComponents: 2, nNeighbors, minDist: .15, nEpochs: 400,
    distanceFn: distance, random: seededRandom(),
  });
  // Exact neighbors keep Jaccard neighborhoods independent of Euclidean search heuristics.
  const neighbors = vectors.map((a, i) => vectors.map((b, j) => ({ index: j, distance: distance(a, b) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, nNeighbors));
  umap.setPrecomputedKNN(
    neighbors.map(row => row.map(item => item.index)),
    neighbors.map(row => row.map(item => item.distance)),
  );
  const embedding = umap.fit(vectors);
  if (embedding.length !== vectors.length || embedding.some(point => point.length !== 2 || point.some(value => !Number.isFinite(value)))) {
    throw new Error("UMAP produced invalid initiative coordinates.");
  }
  const mean = [0, 1].map(axis => embedding.reduce((sum, point) => sum + point[axis], 0) / embedding.length);
  return embedding.map(point => point.map((value, axis) => value - mean[axis]));
}

export function initiativeMap(records, mode = "confidence", clusterCount = null) {
  const { profiles, ...metadata } = classificationProfiles(records, mode);
  if (!profiles.length) return { ...metadata, groups: [], clusters: [], silhouette: 0 };
  const clustering = clusterProfiles(profiles, metadata.categories, mode, clusterCount);
  const groups = new Map();
  profiles.forEach((profile, i) => {
    const key = JSON.stringify(profile.vector);
    if (!groups.has(key)) groups.set(key, { vector: profile.vector, records: [], cluster: clustering.assignments[i] });
    groups.get(key).records.push(profile.record);
  });
  const unique = [...groups.values()];
  const embedding = embedProfiles(unique.map(group => group.vector), mode);
  return {
    ...metadata, groups: unique.map(({ vector, ...group }, i) => ({
      ...group, x: embedding[i][0], y: embedding[i][1],
    })),
    clusters: clustering.clusters, silhouette: clustering.silhouette,
  };
}
