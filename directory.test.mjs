import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analysisError, filterRecords, parseJSONL, safeURL, scoreFor } from "./directory.mjs";

const record = (name, label, score) => ({
  url: `https://example.org/${name}`,
  metadata: { "Initiative / Programme": name, Description: "Research learning resource", "Country / Origin": "EU" },
  analysis: { classifications: [{ category: "University", label, score, reason: "Supports educators" }] },
});
const high = record("Alpha", "yes", .95);
const low = record("Beta", "yes", .6);
const negative = record("Gamma", "no", 1);
const unknown = record("Delta", "unknown", .4);
const error = { url: "https://example.org/error", metadata: { "Initiative / Programme": "Error resource" }, error: { type: "website_fetch_error", message: "Request timed out" } };
const records = [error, low, negative, high, unknown];

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
  assert.equal(scoreFor(negative, ["University"]), null);
  assert.equal(scoreFor(record("Invalid", "yes", 5)), null);
});

test("category filters only match yes classifications", () => {
  assert.deepEqual(filterRecords(records, { categories: ["University"] }), [high, low]);
  assert.deepEqual(filterRecords(records, { categories: ["Missing"] }), []);
});

test("combines multi-term case-insensitive search with classification and status", () => {
  assert.deepEqual(filterRecords(records, { query: "EU alpha EDUCATORS", categories: ["University"], status: "analysed" }), [high]);
  assert.deepEqual(filterRecords(records, { query: "website_fetch_error timed", status: "errors" }), [error]);
  assert.deepEqual(filterRecords(records, { query: "example.org/Beta" }), [low]);
  assert.deepEqual(filterRecords(records, { query: "nonexistent" }), []);
  assert.deepEqual(filterRecords(records, { categories: ["University"], status: "errors" }), []);
});

test("requires every selected classification and sorts by arithmetic mean", () => {
  const first = record("First", "yes", 1);
  first.analysis.classifications.push({ category: "Free", label: "yes", score: .4 });
  const second = record("Second", "yes", .8);
  second.analysis.classifications.push({ category: "Free", label: "yes", score: .8 });
  const third = record("Third", "yes", .9);
  third.analysis.classifications.push({ category: "Free", label: "no", score: .9 });
  const data = [first, high, third, second, error];
  const categories = ["University", "Free"];
  assert.equal(scoreFor(first, categories), .7);
  assert.equal(scoreFor(second, categories), .8);
  assert.deepEqual(filterRecords(data, { categories }), [second, first]);
  assert.deepEqual(filterRecords(data, { categories, query: "Second", status: "analysed" }), [second]);
  assert.deepEqual(filterRecords(data, { categories, status: "errors" }), []);
  assert.equal(scoreFor(first, ["University"]), 1);
  assert.equal(scoreFor(first, ["Free", "University", "Free"]), .7);
});

test("all-unknown analyses are errors, but empty and mixed classifications are not", () => {
  const allUnknown = record("All unknown", "unknown", 1);
  allUnknown.analysis.classifications.push({ category: "Free", label: "unknown", score: .9 });
  const mixed = record("Mixed", "unknown", .6);
  mixed.analysis.classifications.push({ category: "Free", label: "no", score: .9 });
  const empty = { url: "https://example.org/empty", analysis: { classifications: [] } };
  const data = [allUnknown, mixed, empty, high, error];
  assert.equal(analysisError(allUnknown).type, "analysis_failed");
  assert.match(analysisError(allUnknown).message, /all categories.*unknown/);
  assert.equal(analysisError(unknown).type, "analysis_failed");
  for (const item of [mixed, empty, high, negative]) assert.equal(analysisError(item), null);
  assert.equal(scoreFor(allUnknown), null);
  assert.equal(scoreFor(allUnknown, ["University", "Free"]), null);
  assert.deepEqual(filterRecords(data, { status: "errors" }), [allUnknown, error]);
  assert.deepEqual(new Set(filterRecords(data, { status: "analysed" })), new Set([mixed, empty, high]));
  assert.deepEqual(filterRecords(data, { status: "errors", query: "analysis_failed unknown" }), [allUnknown]);
  assert.deepEqual(filterRecords(data, { status: "errors", categories: ["University"] }), []);
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
  valid.analysis.classifications.push({ category: "Free", label: "yes", score: .6 });
  const categories = ["University", "Free"];
  assert.equal(scoreFor(high, categories), null);
  for (const score of [undefined, null, NaN, Infinity, -1, 2, "0.9"]) {
    const invalid = record("Invalid", "yes", .9);
    invalid.analysis.classifications.push({ category: "Free", label: "yes", score });
    assert.equal(scoreFor(invalid, categories), null);
    assert.deepEqual(filterRecords([invalid, valid], { categories }), [valid, invalid]);
  }
  const zero = record("Zero", "yes", 0);
  zero.analysis.classifications.push({ category: "Free", label: "yes", score: 0 });
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
  const expectedErrors = data.filter(item => item.error || (
    item.analysis?.classifications.length > 0 &&
    item.analysis.classifications.every(value => value.label === "unknown")
  ));
  assert.deepEqual(new Set(filterRecords(data, { status: "errors" })), new Set(expectedErrors));
  assert.equal(filterRecords(data, { status: "analysed" }).length, data.length - expectedErrors.length);
  const categories = new Set(data.flatMap(item => item.analysis?.classifications?.map(value => value.category) || []));
  for (const category of categories) {
    const matches = filterRecords(data, { categories: [category] });
    assert.ok(matches.every(item => item.analysis.classifications.some(value => value.category === category && value.label === "yes")));
    const scores = matches.map(item => scoreFor(item, [category]));
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  }
  const selected = ["University", "Free"];
  const expected = data.filter(item => selected.every(category =>
    item.analysis?.classifications.some(value => value.category === category && value.label === "yes")));
  const matches = filterRecords(data, { categories: selected });
  assert.ok(matches.length > 0);
  assert.equal(matches.length, expected.length);
  for (const item of matches) {
    const scores = selected.map(category => item.analysis.classifications.find(value => value.category === category && value.label === "yes").score);
    assert.equal(scoreFor(item, selected), scores.reduce((sum, score) => sum + score, 0) / selected.length);
  }
  const means = matches.map(item => scoreFor(item, selected));
  assert.deepEqual(means, [...means].sort((a, b) => b - a));
});
