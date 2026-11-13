export function parseJSONL(text) {
  const records = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`);
    }
    if (!record || typeof record !== "object" || Array.isArray(record)
      || typeof record.url !== "string"
      || (!record.error && !Array.isArray(record.classifications) && !Array.isArray(record.analysis?.classifications))) {
      throw new Error(`Invalid record on line ${index + 1}: expected a URL and analysis classifications or an error.`);
    }
    records.push(record);
  }
  if (!records.length) throw new Error("The data file contains no records.");
  return records;
}

export function classifications(record) {
  if (Array.isArray(record.classifications)) return record.classifications;
  return Array.isArray(record.analysis?.classifications) ? record.analysis.classifications : [];
}

export function summaryFor(record) {
  return record.summary ?? record.analysis?.summary;
}

export function modelNames(record) {
  return [...new Set(Object.values(record.roundStatus || {})
    .map(round => round.model)
    .filter(model => typeof model === "string" && model.trim())
    .map(model => model.trim()))];
}

export function isExcluded(record) {
  return record.inclusion?.include === "no";
}

export function analysisError(record) {
  if (record.error) {
    return typeof record.error === "string"
      ? { type: "analysis_error", message: record.error }
      : record.error;
  }
  const failedRounds = Object.entries(record.roundStatus || {})
    .filter(([, round]) => round.error || (round.status && round.status !== "success"));
  if (failedRounds.length) {
    return {
      type: failedRounds[0][1].error?.type || "analysis_error",
      message: failedRounds.map(([number, round]) => {
        const error = round.error;
        const message = typeof error === "string" ? error : error?.message;
        return `Round ${number}${error?.type ? ` (${error.type})` : ""}: ${message || `Analysis status: ${round.status || "failed"}.`}`;
      }).join("\n"),
    };
  }
  const items = classifications(record);
  if (items.length && items.every(item => item.label === "unknown")) {
    return {
      type: "analysis_failed",
      message: "Analysis failed: all categories were classified as unknown.",
    };
  }
  return null;
}

export function analysisStatus(record) {
  if (analysisError(record)) return "errors";
  if (classifications(record).length || summaryFor(record) || record.inclusion
    || Array.isArray(record.analysis?.classifications)
    || Object.values(record.roundStatus || {}).some(round => round.status === "success")) {
    return "analysed";
  }
  return "pending";
}

export function resourceName(record) {
  return record.metadata?.["Initiative / Programme"] || record.url;
}

export function scoreFor(record, categories = []) {
  if (analysisError(record)) return null;
  const validItems = classifications(record)
    .filter(item => item.label === "yes")
    .filter(item => typeof item.score === "number" && Number.isFinite(item.score) && item.score >= 0 && item.score <= 1);
  if (categories.length) {
    const scores = [...new Set(categories)].map(category => {
      const matches = validItems.filter(item => item.category === category).map(item => item.score);
      return matches.length ? Math.max(...matches) : null;
    });
    if (scores.some(score => score === null)) return null;
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }
  const scores = validItems.map(item => item.score);
  return scores.length ? Math.max(...scores) : null;
}

export function safeURL(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function filterRecords(records, { query = "", categories = [], status = "all", includeExcluded = false } = {}) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return records.filter(record => {
    if (!includeExcluded && isExcluded(record)) return false;
    const error = analysisError(record);
    if (status !== "all" && analysisStatus(record) !== status) return false;
    if (!categories.every(category => classifications(record).some(item => item.category === category && item.label === "yes"))) return false;
    const text = [
      resourceName(record), record.url, ...Object.values(record.metadata || {}),
      summaryFor(record), record.inclusion?.include, record.inclusion?.reason,
      error?.type, error?.message,
      ...classifications(record).flatMap(item => [item.category, item.label, item.reason]),
    ].join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  }).sort((a, b) => {
    const aScore = scoreFor(a, categories);
    const bScore = scoreFor(b, categories);
    if (aScore === null && bScore !== null) return 1;
    if (bScore === null && aScore !== null) return -1;
    if (aScore !== bScore) return bScore - aScore;
    return resourceName(a).localeCompare(resourceName(b));
  });
}
