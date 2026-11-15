import test from "node:test";
import assert from "node:assert/strict";
import { countryFlag } from "./country-flags.mjs";

test("recognises country names, ISO codes and common aliases", () => {
  assert.equal(countryFlag("Greece"), "\u{1f1ec}\u{1f1f7}");
  assert.equal(countryFlag("  united kingdom  "), "\u{1f1ec}\u{1f1e7}");
  assert.equal(countryFlag("GB"), countryFlag("UK"));
  assert.equal(countryFlag("Czech Republic"), countryFlag("Czechia"));
  assert.equal(countryFlag("T\u00fcrkiye"), countryFlag("Turkey"));
  assert.equal(countryFlag("Hong Kong SAR"), countryFlag("Hong Kong"));
  assert.equal(countryFlag("South Korea"), "\u{1f1f0}\u{1f1f7}");
});

test("known subnational origins use their country's flag", () => {
  for (const [origin, country] of [
    ["Belgium (Flanders)", "Belgium"],
    ["Canada (Ontario)", "Canada"],
    ["United Kingdom (Wales)", "United Kingdom"],
    ["Spain (Catalonia)", "Spain"],
    ["United Arab Emirates (Dubai)", "United Arab Emirates"],
  ]) {
    assert.equal(countryFlag(origin), countryFlag(country));
    assert.ok(countryFlag(origin));
  }
});

test("explicit EU origins use the EU flag", () => {
  for (const origin of ["EU", "European Union", "EU-wide", "EU-wide (Erasmus+)", "EU-wide (FR-led)", "EU-wide (Horizon 2020)"]) {
    assert.equal(countryFlag(origin), "\u{1f1ea}\u{1f1fa}");
  }
});

test("mixed, international, regional and unrecognised origins have no flag", () => {
  for (const origin of [
    "Canada / Ireland", "Portugal/Spain", "Finland / International",
    "International / UK", "International (UK / Africa)", "International / US",
    "EU / Southern Neighbourhood", "Central Asia (EU/ETF)",
    "Council of Europe", "European Schools", "ASEAN", "African Union",
    "Africa (Sub-Saharan)", "Latin America", "France (Germany)",
    "Unknown", "Origin not specified", "", null, undefined, 42,
  ]) {
    assert.equal(countryFlag(origin), null, String(origin));
  }
});
