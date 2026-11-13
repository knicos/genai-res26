import {
  analysisError,
  analysisStatus,
  classifications,
  filterRecords,
  modelNames,
  parseJSONL,
  resourceName,
  safeURL,
  scoreFor,
  summaryFor,
} from "./directory.mjs";
import { categoryOverlap } from "./heatmap.mjs";
import { categoryGroup, categoryGroups } from "./category-groups.mjs";

const form = document.querySelector("#filters");
const search = document.querySelector("#search");
const categoryOptions = document.querySelector("#categories");
const status = document.querySelector("#status");
const includeExcluded = document.querySelector("#include-excluded");
const list = document.querySelector("#result-list");
const empty = document.querySelector("#empty");
const loadError = document.querySelector("#load-error");
const count = document.querySelector("#result-count");
const results = document.querySelector(".results");
const pagination = document.querySelector("#pagination");
const previousPage = document.querySelector("#previous-page");
const nextPage = document.querySelector("#next-page");
const pageIndicator = document.querySelector("#page-indicator");
const heatmap = document.querySelector("#heatmap");
const groupMatrixLabels = document.querySelector("#group-matrix-labels");
const pageSize = 25;
let records = [];
let currentPage = 1;
let hoveredHeatmapCell = null;
let focusedHeatmapCell = null;
let selectedHeatmapCell = null;

function renderHeatmap(matches) {
  hoveredHeatmapCell = null;
  focusedHeatmapCell = null;
  selectedHeatmapCell = null;
  const { categories, counts, analysedCount } = categoryOverlap(matches, {
    groupByCategory: groupMatrixLabels.checked,
  });
  document.querySelector("#heatmap-status").textContent =
    `${analysedCount} matching analysed initiatives`;
  heatmap.replaceChildren();
  const maximum = Math.max(0, ...counts.flat());
  document.querySelector("#heatmap-legend").hidden = !categories.length;
  document.querySelector("#heatmap-maximum").textContent = `${maximum} records`;
  if (!categories.length) {
    heatmap.append(element("p", "help", "No analysed categories match the current filters."));
    return;
  }
  const table = element("table", "heatmap-table");
  table.setAttribute("aria-label", "Records classified yes in both categories");
  const head = element("thead");
  const header = element("tr");
  header.append(element("td"));
  for (const category of categories) {
    const cell = element("th");
    cell.scope = "col";
    markCategory(cell, category);
    cell.append(element("span", "", category));
    header.append(cell);
  }
  head.append(header);
  table.append(head);
  const body = element("tbody");
  categories.forEach((a, row) => {
    const tr = element("tr");
    const heading = element("th", "", a);
    heading.scope = "row";
    markCategory(heading, a);
    tr.append(heading);
    categories.forEach((b, column) => {
      const count = counts[row][column];
      const cell = element("td");
      const button = element("button", "heatmap-cell", count);
      button.type = "button";
      button.tabIndex = row === 0 && column === 0 ? 0 : -1;
      const pair = a === b ? [a] : [a, b];
      button.dataset.categories = JSON.stringify(pair);
      button.dataset.row = row;
      button.dataset.column = column;
      const description = `${pair.join(" + ")}: ${count} analysed ${count === 1 ? "record" : "records"}`;
      button.setAttribute("aria-label", description);
      button.title = description;
      button.dataset.level = count ? Math.ceil((count / maximum) * 4) : 0;
      button.addEventListener("mouseenter", () => {
        hoveredHeatmapCell = button;
        updateHeatmapHighlight();
      });
      button.addEventListener("mouseleave", () => {
        hoveredHeatmapCell = null;
        updateHeatmapHighlight();
      });
      button.addEventListener("focus", () => {
        heatmap.querySelectorAll("button").forEach((item) => {
          item.tabIndex = -1;
        });
        button.tabIndex = 0;
        focusedHeatmapCell = button;
        updateHeatmapHighlight();
      });
      button.addEventListener("blur", () => {
        focusedHeatmapCell = null;
        updateHeatmapHighlight();
      });
      button.addEventListener("keydown", (event) => {
        const offsets = {
          ArrowUp: [-1, 0],
          ArrowDown: [1, 0],
          ArrowLeft: [0, -1],
          ArrowRight: [0, 1],
        };
        const offset = offsets[event.key];
        if (!offset) return;
        event.preventDefault();
        const nextRow = Math.max(
          0,
          Math.min(categories.length - 1, row + offset[0]),
        );
        const nextColumn = Math.max(
          0,
          Math.min(categories.length - 1, column + offset[1]),
        );
        body.rows[nextRow].cells[nextColumn + 1]
          .querySelector("button")
          .focus();
      });
      button.addEventListener("click", () => {
        selectedHeatmapCell = button;
        categoryOptions.querySelectorAll("input").forEach((input) => {
          input.checked = pair.includes(input.value);
        });
        status.value = "analysed";
        includeExcluded.checked = false;
        resetPage();
        document.querySelector("#results-title").focus();
        results.scrollIntoView({ block: "start" });
      });
      cell.append(button);
      tr.append(cell);
    });
    body.append(tr);
  });
  table.append(body);
  heatmap.append(table);
}

function updateHeatmapHighlight() {
  if (selectedHeatmapCell?.getAttribute("aria-pressed") !== "true") {
    selectedHeatmapCell = heatmap.querySelector('button[aria-pressed="true"]');
  }
  const active = hoveredHeatmapCell || focusedHeatmapCell || selectedHeatmapCell;
  heatmap.querySelectorAll(".is-row-highlight, .is-column-highlight").forEach(node => {
    node.classList.remove("is-row-highlight", "is-column-highlight");
  });
  const detail = document.querySelector("#heatmap-detail");
  if (!active) {
    detail.textContent = "Hover over or focus a cell to see its categories and count.";
    return;
  }
  const table = heatmap.querySelector("table");
  const row = Number(active.dataset.row);
  const column = Number(active.dataset.column);
  const rows = table.tBodies[0].rows;
  const rowLabel = rows[row].cells[0];
  const columnLabel = table.tHead.rows[0].cells[column + 1];
  table.style.setProperty("--matrix-row-color", rowLabel.dataset.group ? `var(--${rowLabel.dataset.group})` : "var(--accent)");
  table.style.setProperty("--matrix-column-color", columnLabel.dataset.group ? `var(--${columnLabel.dataset.group})` : "var(--accent)");
  for (const cell of rows[row].cells) cell.classList.add("is-row-highlight");
  columnLabel.classList.add("is-column-highlight");
  for (const tr of rows) tr.cells[column + 1].classList.add("is-column-highlight");
  detail.textContent = active.title;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function markCategory(node, category) {
  const group = categoryGroup(category);
  const description = `${group?.name || "Ungrouped"}: ${category}`;
  if (group) node.dataset.group = group.id;
  node.title = description;
  node.setAttribute("aria-label", description);
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
  const pending = analysisStatus(record) === "pending";
  const score = scoreFor(record, categories);
  heading.append(
    element(
      "span",
      error ? "badge error-badge" : "badge score-badge",
      error
        ? "Analysis error"
        : pending
          ? "Not yet analysed"
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
      summaryFor(record) ||
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
    tags.append(markCategory(element("span", "tag", item.category), item.category));
  }
  if (tags.childElementCount) card.append(tags);
  const evidenceItems = categories.length
    ? items.filter((item) => categories.includes(item.category))
    : items;
  const analysisSummary = categories.length ? null : summaryFor(record);
  const models = modelNames(record);
  if (evidenceItems.length || analysisSummary || record.inclusion || models.length) {
    const details = element("details", "analysis-details");
    details.append(element("summary", "", "Details"));
    if (models.length) {
      const modelTags = element("div", "tags model-tags");
      modelTags.setAttribute("role", "group");
      modelTags.setAttribute("aria-label", "Analysis models");
      for (const model of models) {
        modelTags.append(element("span", "tag", `Model: ${model}`));
      }
      details.append(modelTags);
    }
    if (analysisSummary)
      details.append(element("p", "analysis-summary", analysisSummary));
    if (record.inclusion) {
      details.append(
        element("strong", "", `Inclusion: ${record.inclusion.include}`),
        element("p", "", record.inclusion.reason || "No reason provided."),
      );
    }
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
    includeExcluded: includeExcluded.checked,
  });
  renderHeatmap(matches);
  heatmap.querySelectorAll("button").forEach((button) => {
    const pair = JSON.parse(button.dataset.categories);
    button.setAttribute(
      "aria-pressed",
      String(
        pair.length === categories.length &&
          pair.every((category) => categories.includes(category)),
      ),
    );
  });
  updateHeatmapHighlight();
  const totalPages = Math.ceil(matches.length / pageSize);
  currentPage = Math.max(1, Math.min(currentPage, totalPages));
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, matches.length);
  const fragment = document.createDocumentFragment();
  for (const record of matches.slice(start, end))
    fragment.append(renderRecord(record, categories));
  list.replaceChildren(fragment);
  count.textContent = matches.length
    ? `${start + 1}–${end} of ${matches.length} matches · ${records.length} total records`
    : `0 of ${records.length} records`;
  empty.hidden = matches.length > 0;
  pagination.hidden = totalPages <= 1;
  previousPage.disabled = currentPage === 1;
  nextPage.disabled = currentPage >= totalPages;
  pageIndicator.textContent = matches.length
    ? `Page ${currentPage} of ${totalPages}`
    : "";
}

function resetPage() {
  currentPage = 1;
  render();
}

function changePage(offset) {
  currentPage += offset;
  render();
  document.querySelector("#results-title").focus();
  results.scrollIntoView({ block: "start" });
}

async function load() {
  groupMatrixLabels.disabled = true;
  results.setAttribute("aria-busy", "true");
  loadError.hidden = true;
  empty.hidden = true;
  pagination.hidden = true;
  currentPage = 1;
  heatmap.replaceChildren();
  document.querySelector("#heatmap-legend").hidden = true;
  document.querySelector("#heatmap-status").textContent =
    "Loading category overlaps…";
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
    for (const group of [...categoryGroups, { name: "Ungrouped", id: "ungrouped" }]) {
      const members = categories.filter(name => (categoryGroup(name)?.id || "ungrouped") === group.id);
      if (!members.length) continue;
      const fieldset = element("fieldset", "category-group");
      fieldset.dataset.group = group.id;
      fieldset.append(element("legend", "", group.name));
      for (const name of members) {
        const option = element("label", "classification-option");
        const checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.name = "categories";
        checkbox.value = name;
        option.append(checkbox, element("span", "", name));
        fieldset.append(option);
      }
      categoryOptions.append(fieldset);
    }
    const errorCount = records.filter((record) => analysisError(record)).length;
    const pendingCount = records.filter((record) => analysisStatus(record) === "pending").length;
    document.querySelector("#dataset-summary").textContent =
      `${records.length} records · ${records.length - errorCount - pendingCount} analysed · ${errorCount} with errors · ${pendingCount} not yet analysed.`;
    form.querySelectorAll("input, select, button").forEach((control) => {
      control.disabled = false;
    });
    render();
    groupMatrixLabels.disabled = false;
  } catch (error) {
    list.replaceChildren();
    pagination.hidden = true;
    loadError.hidden = false;
    document.querySelector("#load-error-message").textContent =
      `${error.message} Check the data file and your connection, then try again.`;
    document.querySelector("#dataset-summary").textContent =
      "Atlas unavailable.";
    count.textContent = "Data could not be loaded";
    document.querySelector("#heatmap-status").textContent =
      "Category overlaps unavailable. Retry loading the atlas below.";
    console.error("Atlas loading failed:", error);
  } finally {
    results.setAttribute("aria-busy", "false");
  }
}

for (const group of categoryGroups) {
  const label = element("span", "tag", group.name);
  label.dataset.group = group.id;
  document.querySelector("#group-legend").append(label);
}

groupMatrixLabels.addEventListener("change", () => {
  render();
});
form.addEventListener("input", resetPage);
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("reset", () => {
  // Render after the reset event's default action restores the form values.
  setTimeout(resetPage, 0);
});
previousPage.addEventListener("click", () => changePage(-1));
nextPage.addEventListener("click", () => changePage(1));
document
  .querySelector("#empty-reset")
  .addEventListener("click", () => form.reset());
document.querySelector("#retry").addEventListener("click", load);
load();
