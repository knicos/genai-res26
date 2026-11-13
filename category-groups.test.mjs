import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { categoryGroup, categoryGroups } from "./category-groups.mjs";
import { classifications, parseJSONL } from "./directory.mjs";

test("maps all 35 classifications to exactly one of the four groups", () => {
  assert.deepEqual(categoryGroups.map(group => group.name), ["Producer", "Audience", "Type", "Topic"]);
  assert.deepEqual(categoryGroups.map(group => group.categories.length), [6, 8, 11, 10]);
  const categories = categoryGroups.flatMap(group => group.categories);
  assert.equal(new Set(categories).size, 35);
  for (const group of categoryGroups) {
    for (const category of group.categories) assert.equal(categoryGroup(category), group);
  }
  assert.equal(categoryGroup("Government or Statutory Body").id, "producer");
  assert.equal(categoryGroup("Other or unknown audience").id, "audience");
  assert.equal(categoryGroup("Other type or unknown").id, "type");
  assert.equal(categoryGroup("Other or unknown topic").id, "topic");
});

test("unrecognised classifications remain ungrouped rather than incorrectly assigned", () => {
  for (const category of ["New category", "University", "", "constructor"]) {
    assert.equal(categoryGroup(category), null);
  }
});

test("every classification in the supplied dataset has a group", async () => {
  const records = parseJSONL(await readFile(new URL("./results.jsonl", import.meta.url), "utf8"));
  const categories = new Set(records.flatMap(record => classifications(record).map(item => item.category)));
  assert.ok(categories.size > 0);
  for (const category of categories) assert.ok(categoryGroup(category), `Missing group for ${category}`);
});
