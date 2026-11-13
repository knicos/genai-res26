import { analysisStatus, classifications, isExcluded } from "./directory.mjs";
import { categoryGroup, categoryGroups } from "./category-groups.mjs";

export function categoryOverlap(records, { groupByCategory = true, referenceRecords = records, columnGroups = null, rowGroups = null } = {}) {
  const analysed = records.filter(record => !isExcluded(record) && analysisStatus(record) === "analysed");
  const reference = referenceRecords.filter(record => !isExcluded(record) && analysisStatus(record) === "analysed");
  const memberships = analysed.map(record => new Set(
    classifications(record).filter(item => item.label === "yes").map(item => item.category),
  ));
  const categories = [...new Set(reference.flatMap(record =>
    classifications(record).map(item => item.category),
  ))].sort();
  const counts = categories.map(a => categories.map(b =>
    memberships.filter(items => items.has(a) && items.has(b)).length,
  ));
  const density = categories.map(category => reference.filter(record =>
    classifications(record).some(item => item.category === category && item.label === "yes"),
  ).length);
  const groupIndex = category => {
    const group = categoryGroup(category);
    return group ? categoryGroups.indexOf(group) : categoryGroups.length;
  };
  const order = categories.map((_, index) => index).sort((a, b) =>
    (groupByCategory ? groupIndex(categories[a]) - groupIndex(categories[b]) : 0)
    || density[b] - density[a]
    || categories[a].localeCompare(categories[b]),
  );
  const columns = order.filter(index => columnGroups === null
    || columnGroups.includes(categoryGroup(categories[index])?.id || "ungrouped"));
  const rows = order.filter(index => rowGroups === null
    || rowGroups.includes(categoryGroup(categories[index])?.id || "ungrouped"));
  return {
    categories: rows.map(index => categories[index]),
    columnCategories: columns.map(index => categories[index]),
    counts: rows.map(a => columns.map(b => counts[a][b])),
    analysedCount: analysed.length,
    excludedCount: records.length - analysed.length,
  };
}
