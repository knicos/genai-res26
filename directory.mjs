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
    if (record.score !== undefined && (typeof record.score !== "number"
      || !Number.isFinite(record.score) || record.score < 0 || record.score > 10)) {
      throw new Error(`Invalid score on line ${index + 1}: expected a number between 0 and 10.`);
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

export const additionalSummaryFields = [
  { field: "pedagogicalSummary", label: "Pedagogy", icon: "school" },
  { field: "prioritySummary", label: "Priority", icon: "track-changes" },
  { field: "educationalTechnologySummary", label: "Tools", icon: "build" },
];

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

export function scoreFor(record) {
  if (record.score === undefined) return 0;
  if (typeof record.score !== "number" || !Number.isFinite(record.score)
    || record.score < 0 || record.score > 10) {
    throw new Error("Invalid score: expected a number between 0 and 10.");
  }
  return record.score;
}

export function safeURL(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function searchPatterns(query) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const escape = term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = "[\\p{L}\\p{M}\\p{N}]";
  const pattern = term => new RegExp(
    `(?<!${boundary})${escape(term)}${[...term].length <= 2 ? `(?!${boundary})` : ""}`, "u",
  );
  return {
    terms: terms.map(pattern),
    phrase: terms.length > 1
      ? new RegExp(`(?<!${boundary})${terms.map(escape).join("\\s+")}${[...terms.at(-1)].length <= 2 ? `(?!${boundary})` : ""}`, "u")
      : null,
  };
}

function searchRelevance(record, error, { terms, phrase }) {
  if (!terms.length) return 0;
  const name = resourceName(record).toLocaleLowerCase();
  const url = record.url.toLocaleLowerCase();
  const metadata = Object.entries(record.metadata || {})
    .filter(([key]) => key !== "Initiative / Programme")
    .map(([, value]) => value).join(" ").toLocaleLowerCase();
  const content = [
    summaryFor(record), record.inclusion?.include, record.inclusion?.reason,
    ...additionalSummaryFields.map(({ field }) => typeof record[field] === "string" ? record[field] : ""),
    error?.type, error?.message,
    ...classifications(record).filter(item => item.label === "yes")
      .flatMap(item => [item.category, item.reason]),
  ].join(" ").toLocaleLowerCase();
  let nameMatches = 0;
  let score = 0;
  for (const term of terms) {
    if (term.test(name)) {
      nameMatches++;
      score += 8;
    } else if (term.test(url)) score += 4;
    else if (term.test(metadata)) score += 2;
    else if (term.test(content)) score += 1;
    else return null;
  }
  const tier = phrase?.test(name) ? 3 : nameMatches === terms.length ? 2 : nameMatches ? 1 : 0;
  return { tier, score };
}

export function filterRecords(records, { query = "", categories = [], status = "all" } = {}) {
  const patterns = searchPatterns(query);
  const matches = [];
  for (const record of records) {
    if (status === "excluded" ? !isExcluded(record) : isExcluded(record)) continue;
    const error = analysisError(record);
    if (status !== "all" && status !== "excluded" && analysisStatus(record) !== status) continue;
    if (!categories.every(category => classifications(record).some(item => item.category === category && item.label === "yes"))) continue;
    const relevance = searchRelevance(record, error, patterns);
    if (relevance === null) continue;
    matches.push({ record, relevance, score: scoreFor(record) });
  }
  matches.sort((a, b) => {
    if (patterns.terms.length) {
      const relevanceOrder = b.relevance.tier - a.relevance.tier || b.relevance.score - a.relevance.score;
      if (relevanceOrder) return relevanceOrder;
    }
    if (a.score !== b.score) return b.score - a.score;
    return resourceName(a.record).localeCompare(resourceName(b.record));
  });
  return matches.map(({ record }) => record);
}
