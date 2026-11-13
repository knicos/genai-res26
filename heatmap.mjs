import { analysisStatus, classifications, isExcluded } from "./directory.mjs";
import { categoryGroup, categoryGroups } from "./category-groups.mjs";

export function categoryOverlap(records, { groupByCategory = true } = {}) {
  const analysed = records.filter(record => !isExcluded(record) && analysisStatus(record) === "analysed");
  const memberships = analysed.map(record => new Set(
    classifications(record).filter(item => item.label === "yes").map(item => item.category),
  ));
  const categories = [...new Set(analysed.flatMap(record =>
    classifications(record).map(item => item.category),
  ))].sort();
  const counts = categories.map(a => categories.map(b =>
    memberships.filter(items => items.has(a) && items.has(b)).length,
  ));
  const groupIndex = category => {
    const group = categoryGroup(category);
    return group ? categoryGroups.indexOf(group) : categoryGroups.length;
  };
  const order = categories.map((_, index) => index).sort((a, b) =>
    (groupByCategory ? groupIndex(categories[a]) - groupIndex(categories[b]) : 0)
    || counts[b][b] - counts[a][a]
    || categories[a].localeCompare(categories[b]),
  );
  return {
    categories: order.map(index => categories[index]),
    counts: order.map(a => order.map(b => counts[a][b])),
    analysedCount: analysed.length,
    excludedCount: records.length - analysed.length,
  };
}
