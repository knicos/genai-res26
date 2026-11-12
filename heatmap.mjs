import { analysisError, classifications } from "./directory.mjs";

export function categoryOverlap(records) {
  const analysed = records.filter(record => !analysisError(record));
  const memberships = analysed.map(record => new Set(
    classifications(record).filter(item => item.label === "yes").map(item => item.category),
  ));
  const categories = [...new Set(analysed.flatMap(record =>
    classifications(record).map(item => item.category),
  ))].sort();
  const counts = categories.map(a => categories.map(b =>
    memberships.filter(items => items.has(a) && items.has(b)).length,
  ));
  const similarity = (a, b) => {
    const union = counts[a][a] + counts[b][b] - counts[a][b];
    return union ? counts[a][b] / union : 0;
  };
  // Average-linkage grouping by Jaccard overlap keeps related categories adjacent.
  const groups = categories.map((_, index) => [index]);
  while (groups.length > 1) {
    let best = -1;
    let pair = [0, 1];
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const score = groups[a].reduce((sum, i) =>
          sum + groups[b].reduce((subtotal, j) => subtotal + similarity(i, j), 0), 0)
          / (groups[a].length * groups[b].length);
        if (score > best) {
          best = score;
          pair = [a, b];
        }
      }
    }
    groups[pair[0]].push(...groups[pair[1]]);
    groups.splice(pair[1], 1);
  }
  const order = groups[0] || [];
  return {
    categories: order.map(index => categories[index]),
    counts: order.map(a => order.map(b => counts[a][b])),
    analysedCount: analysed.length,
    excludedCount: records.length - analysed.length,
  };
}
