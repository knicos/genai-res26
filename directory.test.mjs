import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analysisError, analysisStatus, classifications, filterRecords, modelNames, parseJSONL, safeURL, scoreFor, summaryFor } from "./directory.mjs";

const record = (name, label, score) => ({
  url: `https://example.org/${name}`,
  metadata: { "Initiative / Programme": name, Description: "Research learning resource", "Country / Origin": "EU" },
  classifications: [{ category: "Educational Institution", label, score, reason: "Supports educators" }],
  roundStatus: { "2": { status: "success" } },
});
const high = record("Alpha", "yes", .95);
const low = record("Beta", "yes", .6);
const negative = record("Gamma", "no", 1);
const unknown = record("Delta", "unknown", .4);
const error = { url: "https://example.org/error", metadata: { "Initiative / Programme": "Error resource" }, error: { type: "website_fetch_error", message: "Request timed out" } };
const records = [error, low, negative, high, unknown];

test("model names are deduplicated across all rounds including failures", () => {
  const record = { roundStatus: {
    "1": { model: "model-a", status: "success" },
    "2": { model: "model-a", status: "success" },
    "3": { model: "model-b", status: "retry", error: { message: "Failed" } },
    "4": { provider: "provider-only" },
    "5": { model: "  model-a  " },
    "6": { model: "" },
    "7": { model: null },
    "8": { model: " " },
  } };
  const before = JSON.stringify(record);
  assert.deepEqual(modelNames(record), ["model-a", "model-b"]);
  assert.equal(JSON.stringify(record), before);
  assert.deepEqual(modelNames({}), []);
  assert.deepEqual(modelNames({ roundStatus: {} }), []);
});

test("parses JSONL with blank lines, CRLF, and duplicate records", () => {
  assert.deepEqual(parseJSONL(`\r\n${JSON.stringify(high)}\r\n\n${JSON.stringify(high)}\n`), [high, high]);
});

test("reports invalid JSON and malformed records with line numbers", () => {
  assert.throws(() => parseJSONL(`${JSON.stringify(high)}\n{`), /line 2/);
  for (const value of ["null", "[]", "{}", '{"url":"https://example.org"}']) {
    assert.throws(() => parseJSONL(value), /Invalid record on line 1/);
  }
  assert.throws(() => parseJSONL("\n"), /no records/);
});

test("defaults to positive classification confidence, with unscored last", () => {
  assert.deepEqual(filterRecords(records), [high, low, unknown, error, negative]);
  assert.equal(scoreFor(negative), null);
  assert.equal(scoreFor(error), null);
  assert.equal(scoreFor(negative, ["Educational Institution"]), null);
  assert.equal(scoreFor(record("Invalid", "yes", 5)), null);
});

test("category filters only match yes classifications", () => {
  assert.deepEqual(filterRecords(records, { categories: ["Educational Institution"] }), [high, low]);
  assert.deepEqual(filterRecords(records, { categories: ["Missing"] }), []);
});

test("combines multi-term case-insensitive search with classification and status", () => {
  assert.deepEqual(filterRecords(records, { query: "EU alpha EDUCATORS", categories: ["Educational Institution"], status: "analysed" }), [high]);
  assert.deepEqual(filterRecords(records, { query: "website_fetch_error timed", status: "errors" }), [error]);
  assert.deepEqual(filterRecords(records, { query: "example.org/Beta" }), [low]);
  assert.deepEqual(filterRecords(records, { query: "nonexistent" }), []);
  assert.deepEqual(filterRecords(records, { categories: ["Educational Institution"], status: "errors" }), []);
});

test("requires every selected classification and sorts by arithmetic mean", () => {
  const first = record("First", "yes", 1);
  first.classifications.push({ category: "Teachers", label: "yes", score: .4 });
  const second = record("Second", "yes", .8);
  second.classifications.push({ category: "Teachers", label: "yes", score: .8 });
  const third = record("Third", "yes", .9);
  third.classifications.push({ category: "Teachers", label: "no", score: .9 });
  const data = [first, high, third, second, error];
  const categories = ["Educational Institution", "Teachers"];
  assert.equal(scoreFor(first, categories), .7);
  assert.equal(scoreFor(second, categories), .8);
  assert.deepEqual(filterRecords(data, { categories }), [second, first]);
  assert.deepEqual(filterRecords(data, { categories, query: "Second", status: "analysed" }), [second]);
  assert.deepEqual(filterRecords(data, { categories, status: "errors" }), []);
  assert.equal(scoreFor(first, ["Educational Institution"]), 1);
  assert.equal(scoreFor(first, ["Teachers", "Educational Institution", "Teachers"]), .7);
});

test("all-unknown analyses are errors, but empty and mixed classifications are not", () => {
  const allUnknown = record("All unknown", "unknown", 1);
  allUnknown.classifications.push({ category: "Teachers", label: "unknown", score: .9 });
  const mixed = record("Mixed", "unknown", .6);
  mixed.classifications.push({ category: "Teachers", label: "no", score: .9 });
  const empty = { url: "https://example.org/empty", classifications: [], summary: "Summary only" };
  const data = [allUnknown, mixed, empty, high, error];
  assert.equal(analysisError(allUnknown).type, "analysis_failed");
  assert.match(analysisError(allUnknown).message, /all categories.*unknown/);
  assert.equal(analysisError(unknown).type, "analysis_failed");
  for (const item of [mixed, empty, high, negative]) assert.equal(analysisError(item), null);
  assert.equal(scoreFor(allUnknown), null);
  assert.equal(scoreFor(allUnknown, ["Educational Institution", "Teachers"]), null);
  assert.deepEqual(filterRecords(data, { status: "errors" }), [allUnknown, error]);
  assert.deepEqual(new Set(filterRecords(data, { status: "analysed" })), new Set([mixed, empty, high]));
  assert.deepEqual(filterRecords(data, { status: "errors", query: "analysis_failed unknown" }), [allUnknown]);
  assert.deepEqual(filterRecords(data, { status: "errors", categories: ["Educational Institution"] }), []);
  assert.equal(allUnknown.error, undefined);
});

test("explicit errors take precedence over inferred failures and remain searchable", () => {
  const explicit = { ...unknown, error: { type: "original_error", message: "Original failure" } };
  assert.deepEqual(analysisError(explicit), explicit.error);
  const textError = { ...high, error: "Model failed to respond" };
  assert.equal(analysisError(textError).message, textError.error);
  assert.deepEqual(filterRecords([textError], { status: "errors", query: "failed respond" }), [textError]);
  assert.equal(scoreFor(textError), null);
});

test("missing or invalid selected scores are unscored and sort last", () => {
  const valid = record("Valid", "yes", .8);
  valid.classifications.push({ category: "Teachers", label: "yes", score: .6 });
  const categories = ["Educational Institution", "Teachers"];
  assert.equal(scoreFor(high, categories), null);
  for (const score of [undefined, null, NaN, Infinity, -1, 2, "0.9"]) {
    const invalid = record("Invalid", "yes", .9);
    invalid.classifications.push({ category: "Teachers", label: "yes", score });
    assert.equal(scoreFor(invalid, categories), null);
    assert.deepEqual(filterRecords([invalid, valid], { categories }), [valid, invalid]);
  }
  const zero = record("Zero", "yes", 0);
  zero.classifications.push({ category: "Teachers", label: "yes", score: 0 });
  assert.equal(scoreFor(zero, categories), 0);
});

test("sorts highest first with name tiebreakers without mutating the source array", () => {
  const before = [...records];
  const tie = record("Aardvark", "yes", .95);
  assert.deepEqual(filterRecords([low, high, tie]), [tie, high, low]);
  filterRecords(records);
  assert.deepEqual(records, before);
});

test("only HTTP and HTTPS links are allowed", () => {
  assert.equal(safeURL("https://example.org"), "https://example.org/");
  assert.equal(safeURL("http://example.org"), "http://example.org/");
  for (const value of ["javascript:alert(1)", "data:text/html,test", "file:///etc/passwd", "/relative", "invalid"]) {
    assert.equal(safeURL(value), null);
  }
});

test("the provided dataset loads and all error records are filterable", async () => {
  const data = parseJSONL(await readFile(new URL("./results.jsonl", import.meta.url), "utf8"));
  assert.ok(data.length > 0);
  const expectedErrors = data.filter(item => item.error
    || Object.values(item.roundStatus || {}).some(round => round.error || round.status !== "success")
    || (item.classifications.length > 0 && item.classifications.every(value => value.label === "unknown")));
  assert.deepEqual(new Set(filterRecords(data, { status: "errors", includeExcluded: true })), new Set(expectedErrors));
  assert.ok(filterRecords(data).every(item => item.inclusion?.include !== "no"));
  assert.equal(filterRecords(data, { includeExcluded: true }).length, data.length);
  const pending = data.filter(item => !item.summary && !item.inclusion && !item.classifications.length
    && !Object.keys(item.roundStatus).length);
  assert.deepEqual(new Set(filterRecords(data, { status: "pending" })), new Set(pending));
  assert.equal(filterRecords(data, { status: "analysed", includeExcluded: true }).length, data.length - expectedErrors.length - pending.length);
  const categories = new Set(data.flatMap(item => item.classifications.map(value => value.category)));
  assert.ok(categories.has("Government or Statutory Body"));
  assert.ok(categories.has("Ethics of AI and Rights"));
  for (const category of categories) {
    const matches = filterRecords(data, { categories: [category] });
    assert.ok(matches.every(item => item.classifications.some(value => value.category === category && value.label === "yes")));
    const scores = matches.map(item => scoreFor(item, [category]));
    assert.deepEqual(scores, [...scores].sort((a, b) => a === null ? 1 : b === null ? -1 : b - a));
  }
  const selected = ["Government or Statutory Body", "Adult Education"];
  const expected = data.filter(item => item.inclusion?.include !== "no" && selected.every(category =>
    item.classifications.some(value => value.category === category && value.label === "yes")));
  const matches = filterRecords(data, { categories: selected });
  assert.ok(matches.length > 0);
  assert.equal(matches.length, expected.length);
  for (const item of matches) {
    const scores = selected.map(category => item.classifications.find(value => value.category === category && value.label === "yes").score);
    assert.equal(scoreFor(item, selected), analysisError(item) ? null : scores.reduce((sum, score) => sum + score, 0) / selected.length);
  }
  const means = matches.map(item => scoreFor(item, selected));
  assert.deepEqual(means, [...means].sort((a, b) => a === null ? 1 : b === null ? -1 : b - a));
});

test("top-level summaries and inclusion decisions are searchable with an explicit opt-in for exclusions", () => {
  const included = { ...high, summary: "Unique overview", inclusion: { include: "yes", reason: "Endorsed nationally" } };
  const excluded = { ...low, inclusion: { include: "no", reason: "Outside scope" } };
  const data = parseJSONL([included, excluded].map(JSON.stringify).join("\n"));
  assert.equal(summaryFor(data[0]), included.summary);
  assert.deepEqual(filterRecords(data, { query: "unique overview" }), [included]);
  assert.deepEqual(filterRecords(data, { query: "endorsed nationally" }), [included]);
  assert.deepEqual(filterRecords(data, { query: "outside scope" }), []);
  assert.deepEqual(filterRecords(data, { query: "outside scope", includeExcluded: true }), [excluded]);
  assert.deepEqual(filterRecords(data), [included]);
  assert.deepEqual(filterRecords(data, { includeExcluded: true }), [included, excluded]);
});

test("exclusion opt-in combines with categories and status without hiding undecided records", () => {
  const excluded = { ...high, inclusion: { include: "no" } };
  const undecided = { ...low, inclusion: { include: "unknown" } };
  const failedExcluded = { ...excluded, error: "Failed" };
  const data = [excluded, undecided, negative];
  assert.deepEqual(filterRecords(data), [undecided, negative]);
  const options = { categories: ["Educational Institution"], status: "analysed" };
  assert.deepEqual(filterRecords(data, options), [undecided]);
  assert.deepEqual(filterRecords(data, { ...options, includeExcluded: true }), [excluded, undecided]);
  assert.deepEqual(filterRecords([failedExcluded], { status: "errors" }), []);
  assert.deepEqual(filterRecords([failedExcluded], { status: "errors", includeExcluded: true }), [failedExcluded]);
});

test("round errors include every failed round, even when its status is success", () => {
  const partial = { ...high, roundStatus: {
    "1": { status: "success", error: { type: "website_fetch_error", message: "Unsupported content" } },
    "4": { status: "retry", error: { type: "model_response_error", message: "Invalid response" } },
    "5": { status: "retry", error: "Try again" },
  } };
  const before = JSON.stringify(partial);
  const error = analysisError(partial);
  assert.equal(error.type, "website_fetch_error");
  assert.match(error.message, /Round 1.*Unsupported content/);
  assert.match(error.message, /Round 4.*model_response_error.*Invalid response/);
  assert.match(error.message, /Round 5.*Try again/);
  assert.equal(analysisStatus(partial), "errors");
  assert.equal(scoreFor(partial), null);
  assert.equal(classifications(partial).length, 1);
  assert.deepEqual(filterRecords([partial], { status: "errors", query: "model_response_error invalid" }), [partial]);
  assert.deepEqual(filterRecords([partial], { categories: ["Educational Institution"] }), [partial]);
  assert.equal(JSON.stringify(partial), before);
  assert.equal(analysisError({ ...high, error: "Original", roundStatus: partial.roundStatus }).message, "Original");
  assert.match(analysisError({ ...high, roundStatus: { "1": { status: "retry" } } }).message, /Round 1.*retry/);
});

test("unprocessed records are pending, not errors or analysed; partial successes are analysed", () => {
  const pending = { url: "https://example.org/pending", classifications: [], roundStatus: {} };
  const summaryOnly = { ...pending, summary: "Initial analysis", roundStatus: { "1": { status: "success" } } };
  const failed = { ...pending, roundStatus: { "1": { status: "retry", error: { message: "Timeout" } } } };
  const data = parseJSONL([pending, summaryOnly, high, failed].map(JSON.stringify).join("\n"));
  assert.equal(analysisError(pending), null);
  assert.equal(analysisStatus(pending), "pending");
  assert.equal(scoreFor(pending), null);
  assert.equal(analysisStatus(high), "analysed");
  assert.deepEqual(filterRecords(data, { status: "pending" }), [pending]);
  assert.deepEqual(filterRecords(data, { status: "analysed" }), [high, summaryOnly]);
  assert.deepEqual(filterRecords(data, { status: "errors" }), [failed]);
});

test("legacy nested analysis remains supported and top-level fields take precedence", () => {
  const legacy = { url: high.url, analysis: { summary: "Legacy summary", classifications: high.classifications } };
  assert.deepEqual(parseJSONL(JSON.stringify(legacy)), [legacy]);
  assert.equal(summaryFor(legacy), "Legacy summary");
  assert.deepEqual(classifications(legacy), high.classifications);
  assert.equal(scoreFor(legacy), .95);
  const current = { ...legacy, classifications: [], summary: "Current summary" };
  assert.deepEqual(classifications(current), []);
  assert.equal(summaryFor(current), "Current summary");
});
