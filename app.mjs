import {
  analysisError,
  classifications,
  filterRecords,
  parseJSONL,
  resourceName,
  safeURL,
  scoreFor,
} from "./directory.mjs";
import { categoryOverlap } from "./heatmap.mjs";
import { renderInitiativeMap } from "./map-view.mjs";

const form = document.querySelector("#filters");
const search = document.querySelector("#search");
const categoryOptions = document.querySelector("#categories");
const status = document.querySelector("#status");
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
const mapMode = document.querySelector("#map-mode");
const mapClusterCount = document.querySelector("#map-cluster-count");
const pageSize = 25;
let records = [];
let currentPage = 1;

function renderHeatmap() {
  const { categories, counts, analysedCount } = categoryOverlap(records);
  document.querySelector("#heatmap-status").textContent =
    `${analysedCount} initiatives`;
  heatmap.replaceChildren();
  const maximum = Math.max(0, ...counts.flat());
  document.querySelector("#heatmap-legend").hidden = !categories.length;
  document.querySelector("#heatmap-maximum").textContent = `${maximum} records`;
  if (!categories.length) {
    heatmap.append(element("p", "help", "No analysed categories available."));
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
    tr.append(heading);
    categories.forEach((b, column) => {
      const count = counts[row][column];
      const cell = element("td");
      const button = element("button", "heatmap-cell", count);
      button.type = "button";
      button.tabIndex = row === 0 && column === 0 ? 0 : -1;
      const pair = a === b ? [a] : [a, b];
      button.dataset.categories = JSON.stringify(pair);
      const description = `${pair.join(" + ")}: ${count} analysed ${count === 1 ? "record" : "records"}`;
      button.setAttribute("aria-label", description);
      button.title = description;
      button.dataset.level = count ? Math.ceil((count / maximum) * 4) : 0;
      const describe = () => {
        document.querySelector("#heatmap-detail").textContent = description;
      };
      button.addEventListener("mouseenter", describe);
      button.addEventListener("focus", () => {
        heatmap.querySelectorAll("button").forEach((item) => {
          item.tabIndex = -1;
        });
        button.tabIndex = 0;
        describe();
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
        categoryOptions.querySelectorAll("input").forEach((input) => {
          input.checked = pair.includes(input.value);
        });
        search.value = "";
        status.value = "analysed";
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
  const matches = filterRecords(records, {
    query: search.value,
    categories,
    status: status.value,
  });
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
  results.setAttribute("aria-busy", "true");
  loadError.hidden = true;
  empty.hidden = true;
  pagination.hidden = true;
  currentPage = 1;
  mapMode.disabled = true;
  mapClusterCount.disabled = true;
  heatmap.replaceChildren();
  document.querySelector("#initiative-map").replaceChildren();
  document.querySelector("#map-selection").replaceChildren();
  document.querySelector("#map-controls").hidden = true;
  document.querySelector("#map-clusters").replaceChildren();
  document.querySelector("#map-status").textContent = "Loading initiative profiles…";
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
    renderHeatmap();
    renderInitiativeMap(records, mapMode.value);
    mapMode.disabled = false;
    mapClusterCount.disabled = false;
    render();
  } catch (error) {
    mapMode.disabled = true;
    mapClusterCount.disabled = true;
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
    document.querySelector("#initiative-map").replaceChildren();
    document.querySelector("#map-selection").replaceChildren();
    document.querySelector("#map-status").textContent = "Initiative map unavailable. Retry loading the atlas below.";
    document.querySelector("#map-controls").hidden = true;
    document.querySelector("#map-clusters").replaceChildren();
    console.error("Atlas loading failed:", error);
  } finally {
    results.setAttribute("aria-busy", "false");
  }
}

const visualisationTabs = [...document.querySelectorAll('[role="tab"]')];
function updateMap() {
  try {
    renderInitiativeMap(records, mapMode.value);
  } catch (error) {
    document.querySelector("#initiative-map").replaceChildren();
    document.querySelector("#map-clusters").replaceChildren();
    document.querySelector("#map-selection").replaceChildren();
    document.querySelector("#map-controls").hidden = true;
    document.querySelector("#map-status").textContent = `Unable to calculate the initiative map: ${error.message}. Try another comparison or reload the atlas.`;
    console.error("Initiative map calculation failed:", error);
  }
}
mapMode.addEventListener("change", updateMap);
mapClusterCount.addEventListener("change", updateMap);
function selectVisualisation(index) {
  visualisationTabs.forEach((tab, i) => {
    tab.setAttribute("aria-selected", String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = i !== index;
  });
}
visualisationTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectVisualisation(index));
  tab.addEventListener("keydown", event => {
    const next = { ArrowRight: (index + 1) % 2, ArrowLeft: (index + 1) % 2, Home: 0, End: 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectVisualisation(next);
    visualisationTabs[next].focus();
  });
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
