const squaredDistance = (a, b) => a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);

export function jaccardDistance(a, b) {
  let intersection = 0;
  let union = 0;
  a.forEach((value, i) => {
    if (value || b[i]) union++;
    if (value && b[i]) intersection++;
  });
  return union ? 1 - intersection / union : 0;
}

function kmedoids(distances, k, seed) {
  let medoids = [seed];
  while (medoids.length < k) {
    const nearest = distances.map(row => Math.min(...medoids.map(index => row[index])));
    const farthest = nearest.indexOf(Math.max(...nearest));
    if (nearest[farthest] <= 1e-12) return null;
    medoids.push(farthest);
  }
  let assignments;
  for (let iteration = 0; iteration < 100; iteration++) {
    assignments = distances.map(row => medoids.reduce((best, index, cluster) =>
      row[index] < row[medoids[best]] ? cluster : best, 0));
    const next = medoids.map((medoid, cluster) => {
      const members = assignments.flatMap((value, i) => value === cluster ? [i] : []);
      if (!members.length) return medoid;
      return members.reduce((best, i) =>
        members.reduce((sum, j) => sum + distances[i][j], 0) <
        members.reduce((sum, j) => sum + distances[best][j], 0) ? i : best, medoid);
    });
    if (next.every((value, i) => value === medoids[i])) return assignments;
    medoids = next;
  }
  return distances.map(row => medoids.reduce((best, index, cluster) =>
    row[index] < row[medoids[best]] ? cluster : best, 0));
}

function kmeans(vectors, k, seed) {
  const centers = [vectors[seed].slice()];
  while (centers.length < k) {
    let farthest = 0;
    let distance = -1;
    vectors.forEach((vector, i) => {
      const nearest = Math.min(...centers.map(center => squaredDistance(vector, center)));
      if (nearest > distance) { distance = nearest; farthest = i; }
    });
    if (distance <= 1e-12) return null;
    centers.push(vectors[farthest].slice());
  }
  let assignments = Array(vectors.length).fill(-1);
  for (let iteration = 0; iteration < 100; iteration++) {
    const next = vectors.map(vector => {
      let nearest = 0;
      centers.forEach((center, i) => {
        if (squaredDistance(vector, center) < squaredDistance(vector, centers[nearest])) nearest = i;
      });
      return nearest;
    });
    const members = centers.map((_, cluster) => vectors.filter((_, i) => next[i] === cluster));
    if (members.some(group => !group.length)) return null;
    if (next.every((value, i) => value === assignments[i])) break;
    assignments = next;
    members.forEach((group, i) => {
      centers[i] = centers[i].map((_, dimension) =>
        group.reduce((sum, vector) => sum + vector[dimension], 0) / group.length,
      );
    });
  }
  return assignments;
}

export function silhouetteScore(distances, assignments) {
  const groups = [...new Set(assignments)].map(cluster =>
    assignments.flatMap((value, i) => value === cluster ? [i] : []),
  );
  if (groups.length < 2) return 0;
  return assignments.reduce((sum, cluster, i) => {
    const own = groups.find(group => assignments[group[0]] === cluster);
    if (own.length === 1) return sum;
    const within = own.reduce((total, j) => total + distances[i][j], 0) / (own.length - 1);
    const between = Math.min(...groups.filter(group => group !== own).map(group =>
      group.reduce((total, j) => total + distances[i][j], 0) / group.length,
    ));
    return sum + (Math.max(within, between) ? (between - within) / Math.max(within, between) : 0);
  }, 0) / assignments.length;
}

export function clusterProfiles(profiles, categories, mode = "confidence", clusterCount = null) {
  if (clusterCount !== null && (!Number.isInteger(clusterCount) || clusterCount < 1 || clusterCount > 6)) {
    throw new Error("Cluster count must be an integer from 1 to 6.");
  }
  if (!profiles.length) return { assignments: [], clusters: [], silhouette: 0 };
  const vectors = profiles.map(profile => profile.vector);
  const binary = mode === "binary";
  const distances = vectors.map(a => vectors.map(b =>
    binary ? jaccardDistance(a, b) : Math.sqrt(squaredDistance(a, b))));
  const uniqueCount = new Set(vectors.map(vector => JSON.stringify(vector))).size;
  if (clusterCount !== null && clusterCount > uniqueCount) {
    throw new Error(`Only ${uniqueCount} distinct profiles are available for clustering.`);
  }
  let assignments = vectors.map(() => 0);
  let silhouette = 0;
  let found = clusterCount === null || clusterCount === 1;
  if (clusterCount !== null && clusterCount > 1) silhouette = -Infinity;
  // Prefer one group when no candidate has positive silhouette; never split identical profiles.
  const first = clusterCount ?? 2;
  const last = clusterCount ?? Math.min(6, uniqueCount, vectors.length - 1);
  for (let k = Math.max(2, first); k <= last; k++) {
    const seeds = [...new Set([0, Math.floor(vectors.length / 3), Math.floor(2 * vectors.length / 3)])];
    for (const seed of seeds) {
      const candidate = binary ? kmedoids(distances, k, seed) : kmeans(vectors, k, seed);
      if (!candidate || new Set(candidate).size !== k) continue;
      const score = silhouetteScore(distances, candidate);
      if (score > silhouette + 1e-8) { assignments = candidate; silhouette = score; found = true; }
    }
  }
  if (!found) throw new Error(`Unable to form ${clusterCount} nonempty clusters. Choose a lower count.`);
  const clusters = [...new Set(assignments)].map((cluster, index) => {
    const members = profiles.filter((_, i) => assignments[i] === cluster);
    const ranked = categories.flatMap((category, dimension) => (binary ? ["yes"] : ["yes", "no", "unknown"]).map((label, labelIndex) => {
      const offset = binary ? dimension : dimension * 7 + labelIndex;
      const prevalence = members.reduce((sum, profile) => sum + profile.vector[offset], 0) / members.length;
      const baseline = vectors.reduce((sum, vector) => sum + vector[offset], 0) / vectors.length;
      return { text: `${category} (${label})`, prevalence, difference: prevalence - baseline };
    })).filter(item => item.prevalence >= .5).sort((a, b) =>
      b.difference - a.difference || b.prevalence - a.prevalence || a.text.localeCompare(b.text),
    );
    const descriptors = ranked.filter(item => item.difference >= .05).slice(0, 2);
    return {
      id: cluster,
      label: `Cluster ${index + 1}: ${descriptors.map(item => item.text).join(" / ") || "Mixed profiles"}`,
      count: members.length,
      descriptors: descriptors.map(item => `${item.text}: ${Math.round(item.prevalence * 100)}% of cluster`),
    };
  });
  return { assignments, clusters, silhouette };
}
