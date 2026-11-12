import {
  analysisError,
  classifications,
  filterRecords,
  parseJSONL,
  resourceName,
  safeURL,
  scoreFor,
} from "./directory.mjs";

const form = document.querySelector("#filters");
const search = document.querySelector("#search");
const categoryOptions = document.querySelector("#categories");
const status = document.querySelector("#status");
const list = document.querySelector("#result-list");
const empty = document.querySelector("#empty");
const loadError = document.querySelector("#load-error");
const count = document.querySelector("#result-count");
const results = document.querySelector(".results");
let records = [];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function percent(score) {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(score);
}

function selectedCategories() {
  return [...categoryOptions.querySelectorAll("input:checked")].map(
    (input) => input.value,
  );
}

function renderRecord(record, categories) {
  const card = element("article", "result-card");
  const heading = element("div", "card-heading");
  const title = element("h3");
  const url = safeURL(record.url);
  if (url) {
    const link = element("a", "", resourceName(record));
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    title.append(link);
  } else {
    title.textContent = resourceName(record);
  }
  heading.append(title);
  const error = analysisError(record);
  const score = scoreFor(record, categories);
  heading.append(
    element(
      "span",
      error ? "badge error-badge" : "badge score-badge",
      error
        ? "Analysis error"
        : score === null
          ? "Unscored"
          : `${percent(score)} confidence`,
    ),
  );
  card.append(heading);
  const meta = element("div", "resource-meta");
  meta.append(
    element(
      "span",
      "",
      record.metadata?.["Country / Origin"] || "Origin not specified",
    ),
  );
  meta.append(element("span", "resource-url", record.url));
  card.append(meta);
  if (!url)
    card.append(
      element(
        "p",
        "error-text",
        "Invalid or unsupported website URL; link disabled.",
      ),
    );
  card.append(
    element(
      "p",
      "description",
      record.analysis?.summary ||
        record.metadata?.Description ||
        "No description provided.",
    ),
  );

  if (error) {
    const errorBox = element("div", "record-error");
    const { type, message } = error;
    errorBox.append(
      element(
        "strong",
        "",
        type ? type.replaceAll("_", " ") : "Analysis failed",
      ),
    );
    errorBox.append(
      element("p", "", message || "No further error details were provided."),
    );
    card.append(errorBox);
  }

  const items = classifications(record);
  const tags = element("div", "tags");
  for (const item of items.filter((item) => item.label === "yes")) {
    tags.append(element("span", "tag", item.category));
  }
  if (tags.childElementCount) card.append(tags);
  const evidenceItems = categories.length
    ? items.filter((item) => categories.includes(item.category))
    : items;
  const analysisSummary = categories.length ? null : record.analysis?.summary;
  if (evidenceItems.length || analysisSummary) {
    const details = element("details", "analysis-details");
    details.append(element("summary", "", "Details"));
    if (analysisSummary)
      details.append(element("p", "analysis-summary", analysisSummary));
    const evidence = element("ul", "evidence-list");
    for (const item of evidenceItems) {
      const entry = element("li");
      const validScore =
        typeof item.score === "number" &&
        Number.isFinite(item.score) &&
        item.score >= 0 &&
        item.score <= 1;
      entry.append(
        element(
          "strong",
          "",
          `${item.category} · ${item.label} · ${validScore ? percent(item.score) : "Unscored"}`,
        ),
      );
      entry.append(element("p", "", item.reason || "No reason provided."));
      evidence.append(entry);
    }
    details.append(evidence);
    card.append(details);
  }
  return card;
}

function render() {
  const categories = selectedCategories();
  const matches = filterRecords(records, {
    query: search.value,
    categories,
    status: status.value,
  });
  const fragment = document.createDocumentFragment();
  for (const record of matches)
    fragment.append(renderRecord(record, categories));
  list.replaceChildren(fragment);
  count.textContent = `${matches.length} of ${records.length} records`;
  empty.hidden = matches.length > 0;
}

async function load() {
  results.setAttribute("aria-busy", "true");
  loadError.hidden = true;
  empty.hidden = true;
  form.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = true;
  });
  count.textContent = "Loading…";
  try {
    const response = await fetch("./results.jsonl");
    if (!response.ok)
      throw new Error(`Data request failed (HTTP ${response.status}).`);
    records = parseJSONL(await response.text());
    const categories = [
      ...new Set(
        records.flatMap((record) =>
          classifications(record).map((item) => item.category),
        ),
      ),
    ].sort();
    categoryOptions.replaceChildren();
    for (const name of categories) {
      const option = element("label", "classification-option");
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.name = "categories";
      checkbox.value = name;
      option.append(checkbox, element("span", "", name));
      categoryOptions.append(option);
    }
    const errorCount = records.filter((record) => analysisError(record)).length;
    document.querySelector("#dataset-summary").textContent =
      `${records.length} records · ${records.length - errorCount} analysed · ${errorCount} with errors.`;
    form.querySelectorAll("input, select, button").forEach((control) => {
      control.disabled = false;
    });
    render();
  } catch (error) {
    list.replaceChildren();
    loadError.hidden = false;
    document.querySelector("#load-error-message").textContent =
      `${error.message} Check the data file and your connection, then try again.`;
    document.querySelector("#dataset-summary").textContent =
      "Directory unavailable.";
    count.textContent = "Data could not be loaded";
    console.error("Directory loading failed:", error);
  } finally {
    results.setAttribute("aria-busy", "false");
  }
}

form.addEventListener("input", render);
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("reset", () => {
  // Render after the reset event's default action restores the form values.
  setTimeout(render, 0);
});
document
  .querySelector("#empty-reset")
  .addEventListener("click", () => form.reset());
document.querySelector("#retry").addEventListener("click", load);
load();
