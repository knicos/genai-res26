import {
  additionalSummaryFields,
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
import { countryFlag } from "./country-flags.mjs";
import { exportColumns, recordsToCSV } from "./csv-export.mjs";

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
const groupMatrixLabels = document.querySelector("#group-matrix-labels");
const matrixReset = document.querySelector("#matrix-reset");
const matrixColumns = document.querySelector("#matrix-columns");
const matrixRows = document.querySelector("#matrix-rows");
const matrixInfo = document.querySelector("#matrix-info");
const tagInfo = document.querySelector("#tag-info");
const barChart = document.querySelector("#bar-chart");
const chartGroups = document.querySelector("#chart-groups");
const groupChartLabels = document.querySelector("#group-chart-labels");
const chartReset = document.querySelector("#chart-reset");
const explorePanel = document.querySelector(".explore-panel");
const exploreTabs = [...document.querySelectorAll(".explore-tabs [role=tab]")];
const exportOpen = document.querySelector("#export-open");
const exportDialog = document.querySelector("#export-dialog");
const exportForm = document.querySelector("#export-form");
const exportOptions = document.querySelector("#export-columns");
const exportError = document.querySelector("#export-error");
const pageSize = 25;
let records = [];
let currentMatches = [];
let availableExportColumns = [];
let currentPage = 1;
let hoveredHeatmapCell = null;
let focusedHeatmapCell = null;
let selectedHeatmapCell = null;
let recordTabId = 0;
let tagReasonId = 0;
let hoveredResultTag = null;
let focusedResultTag = null;
let pinnedResultTag = null;
let activeResultTag = null;
let overTagInfo = false;
let tagInfoTimer;

function renderBarChart() {
  const { categories, counts, analysedCount } = categoryOverlap(records, {
    groupByCategory: groupChartLabels.checked,
  });
  const enabled = [...chartGroups.querySelectorAll("input:checked")].map(input => input.value);
  const maximum = Math.max(0, ...counts.map((row, i) => row[i]));
  document.querySelector("#chart-status").textContent =
    `${analysedCount} analysed initiatives · independent of search filters`;
  barChart.replaceChildren();
  categories.forEach((category, i) => {
    const group = categoryGroup(category);
    if (!enabled.includes(group?.id || "ungrouped")) return;
    const count = counts[i][i];
    const button = element("button", "chart-bar");
    button.type = "button";
    button.dataset.category = category;
    if (group) button.dataset.group = group.id;
    button.setAttribute("aria-label", `${group?.name || "Ungrouped"}: ${category}, ${count} analysed ${count === 1 ? "initiative" : "initiatives"}`);
    const track = element("span", "chart-track");
    track.setAttribute("aria-hidden", "true");
    const fill = element("span", "chart-fill");
    fill.style.width = `${maximum ? count / maximum * 100 : 0}%`;
    track.append(fill);
    const label = element("span", "chart-label", category);
    label.prepend(materialIcon("check", "selection-icon"));
    button.append(label, track, element("span", "chart-value", count));
    button.addEventListener("click", () => {
      categoryOptions.querySelectorAll("input").forEach(input => {
        if (input.value === category) input.checked = true;
      });
      status.value = "analysed";
      resetPage();
      document.querySelector("#results-title").focus();
      results.scrollIntoView({ block: "start" });
    });
    barChart.append(button);
  });
  if (!barChart.childElementCount) {
    barChart.append(element("p", "help", "No labels available. Enable a label category or load analysed data."));
  }
}

function renderHeatmap() {
  matrixInfo.hidden = true;
  const selectedPair = selectedHeatmapCell?.dataset.categories;
  hoveredHeatmapCell = null;
  focusedHeatmapCell = null;
  selectedHeatmapCell = null;
  const { categories, columnCategories, counts, analysedCount } = categoryOverlap(records, {
    groupByCategory: groupMatrixLabels.checked,
    columnGroups: [...matrixColumns.querySelectorAll("input:checked")].map(input => input.value),
    rowGroups: [...matrixRows.querySelectorAll("input:checked")].map(input => input.value),
  });
  document.querySelector("#heatmap-status").textContent =
    `${analysedCount} analysed initiatives · independent of search filters`;
  heatmap.replaceChildren();
  const maximum = Math.max(0, ...counts.flat());
  document.querySelector("#heatmap-legend").hidden = !categories.length || !columnCategories.length;
  document.querySelector("#heatmap-maximum").textContent = `${maximum} records`;
  if (!categories.length) {
    heatmap.append(element("p", "help", "No row labels available. Enable a row label category or load analysed data."));
    return;
  }
  if (!columnCategories.length) {
    heatmap.append(element("p", "help", "Enable a column label category to display the matrix."));
    return;
  }
  const table = element("table", "heatmap-table");
  table.setAttribute("aria-label", "Records classified yes in both categories");
  const head = element("thead");
  const header = element("tr");
  header.append(element("td"));
  for (const category of columnCategories) {
    const cell = element("th");
    cell.scope = "col";
    markCategory(cell, category);
    cell.dataset.category = category;
    const label = element("span", "", category);
    label.prepend(materialIcon("check", "selection-icon"));
    cell.append(label);
    header.append(cell);
  }
  head.append(header);
  table.append(head);
  const body = element("tbody");
  categories.forEach((a, row) => {
    const tr = element("tr");
    const heading = element("th");
    const label = element("span", "", a);
    label.prepend(materialIcon("check", "selection-icon"));
    heading.append(label);
    heading.scope = "row";
    markCategory(heading, a);
    heading.dataset.category = a;
    tr.append(heading);
    columnCategories.forEach((b, column) => {
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
        if (event.key === "Escape") {
          matrixInfo.hidden = true;
          event.preventDefault();
          return;
        }
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
          Math.min(columnCategories.length - 1, column + offset[1]),
        );
        body.rows[nextRow].cells[nextColumn + 1]
          .querySelector("button")
          .focus();
      });
      button.addEventListener("click", () => {
        selectedHeatmapCell = button;
        categoryOptions.querySelectorAll("input").forEach((input) => {
          if (pair.includes(input.value)) input.checked = true;
        });
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
  selectedHeatmapCell = [...heatmap.querySelectorAll("button")]
    .find(button => button.dataset.categories === selectedPair) || null;
}

function updateHeatmapHighlight() {
  updateMatrixInfo(hoveredHeatmapCell || focusedHeatmapCell);
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
  detail.textContent = active.getAttribute("aria-label");
}

function updateMatrixInfo(button) {
  matrixInfo.hidden = !button;
  if (!button) return;
  const tags = element("div", "tags");
  for (const category of JSON.parse(button.dataset.categories)) {
    tags.append(markCategory(element("span", "tag", category), category));
  }
  const count = Number(button.textContent);
  matrixInfo.replaceChildren(
    tags,
    element("strong", "", `${count} matching analysed ${count === 1 ? "initiative" : "initiatives"}`),
  );
  const [example] = filterRecords(records, {
    categories: JSON.parse(button.dataset.categories),
    status: "analysed",
  });
  if (example) {
    const preview = element("div", "matrix-example");
    preview.append(
      element("span", "matrix-example-label", "Top matching example"),
      element("strong", "", resourceName(example)),
      element("p", "matrix-example-summary",
        summaryFor(example) || example.metadata?.Description || "No summary provided."),
    );
    matrixInfo.append(preview);
  }
  positionInfoBox(matrixInfo, button);
}

function positionInfoBox(info, button) {
  const anchor = button.getBoundingClientRect();
  const box = info.getBoundingClientRect();
  const margin = 12;
  const left = anchor.right + margin + box.width <= window.innerWidth
    ? anchor.right + margin : anchor.left - margin - box.width;
  const top = anchor.bottom + margin + box.height <= window.innerHeight
    ? anchor.bottom + margin : anchor.top - margin - box.height;
  info.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - box.width - margin))}px`;
  info.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - box.height - margin))}px`;
}

function hideTagInfo() {
  clearTimeout(tagInfoTimer);
  hoveredResultTag = null;
  focusedResultTag = null;
  pinnedResultTag = null;
  activeResultTag = null;
  overTagInfo = false;
  tagInfo.hidden = true;
}

function updateTagInfo() {
  clearTimeout(tagInfoTimer);
  const tag = pinnedResultTag || hoveredResultTag || focusedResultTag;
  if (!tag) {
    tagInfo.hidden = true;
    activeResultTag = null;
    return;
  }
  activeResultTag = tag;
  const label = markCategory(element("span", "tag", tag.dataset.category), tag.dataset.category);
  const labels = element("div", "tags");
  labels.append(label);
  tagInfo.replaceChildren(labels, element("p", "tag-info-reason", tag.querySelector(".tag-reason").textContent));
  tagInfo.hidden = false;
  positionInfoBox(tagInfo, tag);
}

function deferTagInfoUpdate() {
  clearTimeout(tagInfoTimer);
  tagInfoTimer = setTimeout(() => {
    if (!overTagInfo) updateTagInfo();
  }, 180);
}

function resultClassificationTag(item) {
  const tag = markCategory(element("button", "tag result-tag", item.category), item.category);
  tag.type = "button";
  tag.removeAttribute("title");
  tag.dataset.category = item.category;
  const reason = element("span", "tag-reason visually-hidden", item.reason || "No reason provided.");
  reason.id = `tag-reason-${tagReasonId++}`;
  tag.setAttribute("aria-describedby", reason.id);
  tag.append(reason);
  tag.addEventListener("mouseenter", () => {
    hoveredResultTag = tag;
    updateTagInfo();
  });
  tag.addEventListener("mouseleave", () => {
    if (hoveredResultTag === tag) hoveredResultTag = null;
    deferTagInfoUpdate();
  });
  tag.addEventListener("focus", () => {
    focusedResultTag = tag;
    updateTagInfo();
  });
  tag.addEventListener("blur", () => {
    if (focusedResultTag === tag) focusedResultTag = null;
    deferTagInfoUpdate();
  });
  tag.addEventListener("click", () => {
    if (pinnedResultTag === tag) {
      hideTagInfo();
    } else {
      pinnedResultTag = tag;
      updateTagInfo();
    }
  });
  return tag;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function materialIcon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `icon ${className}`.trim());
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `./vendor/material-icons.svg#${name}`);
  svg.append(use);
  return svg;
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

function setupTabs(tabs, panels, onActivate = () => {}) {
  const activate = index => {
    onActivate(index);
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(index));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(next);
      tabs[next].focus();
    });
  });
  activate(0);
}

function appendRecordTabs(card, views, name) {
  const id = `record-tabs-${recordTabId++}`;
  const tablist = element("div", "record-tabs");
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", `${name} information`);
  const tabs = views.map(({ label, panel, icon }, index) => {
    const tab = element("button", "record-tab", label);
    if (icon) tab.prepend(materialIcon(icon));
    tab.type = "button";
    tab.id = `${id}-tab-${index}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `${id}-panel-${index}`);
    panel.id = `${id}-panel-${index}`;
    panel.classList.add("record-panel");
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = 0;
    tablist.append(tab);
    return tab;
  });
  setupTabs(tabs, views.map(view => view.panel), index => {
    if (activeResultTag && card.contains(activeResultTag)
      && !views[index].panel.contains(activeResultTag)) hideTagInfo();
  });
  card.append(tablist, ...views.map(view => view.panel));
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
  const badges = element("div", "card-badges");
  if (error || pending) {
    badges.append(element("span", error ? "badge error-badge" : "badge score-badge",
      error ? "Analysis error" : "Not yet analysed"));
  }
  badges.append(element("span", "badge score-badge", `Score: ${scoreFor(record).toFixed(1)} / 10`));
  heading.append(badges);
  card.append(heading);
  const meta = element("div", "resource-meta");
  const origin = record.metadata?.["Country / Origin"] || "Origin not specified";
  const country = element("span", "country-badge");
  const flag = countryFlag(origin);
  if (flag) {
    const icon = element("span", "country-flag", flag);
    icon.setAttribute("aria-hidden", "true");
    country.append(icon);
  }
  country.append(element("span", "", origin));
  meta.append(country);
  //meta.append(element("span", "resource-url", record.url));
  card.append(meta);
  const summary = element("div", "record-summary");
  if (!url)
    summary.append(
      element(
        "p",
        "error-text",
        "Invalid or unsupported website URL; link disabled.",
      ),
    );
  summary.append(
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
    summary.append(errorBox);
  }

  const items = classifications(record);
  const tags = element("div", "tags");
  for (const item of items.filter((item) => item.label === "yes")) {
    tags.append(resultClassificationTag(item));
  }
  if (tags.childElementCount) summary.append(tags);
  const evidenceItems = categories.length
    ? items.filter((item) => categories.includes(item.category))
    : items;
  const analysisSummary = categories.length ? null : summaryFor(record);
  const models = modelNames(record);
  const hasRow = record.row !== undefined && record.row !== null;
  const details = element("div", "analysis-details");
  if (evidenceItems.length || analysisSummary || record.inclusion || models.length || hasRow) {
    if (models.length) {
      const modelTags = element("div", "tags model-tags");
      modelTags.setAttribute("role", "group");
      modelTags.setAttribute("aria-label", "Analysis models");
      for (const model of models) {
        modelTags.append(element("span", "tag", `Model: ${model}`));
      }
      details.append(modelTags);
    }
    if (hasRow)
      details.append(element("p", "source-row", `Original row: ${record.row}`));
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
  } else {
    details.append(element("p", "help", "No analysis details available."));
  }
  const additionalViews = additionalSummaryFields.map(({ field, label, icon }) => {
    const value = record[field];
    const panel = element("div", "additional-summary");
    if (value != null && typeof value !== "string") {
      console.warn(`Invalid ${field} for ${resourceName(record)}: expected text.`);
      panel.append(element("p", "help", `${label} summary is invalid; expected text.`));
    } else if (value?.trim()) {
      panel.append(element("p", "description", value));
    } else {
      panel.append(element("p", "help", `No ${label.toLowerCase()} summary available.`));
    }
    return { label, panel, icon };
  });
  appendRecordTabs(card, [
    { label: "Summary", panel: summary, icon: "description" },
    ...additionalViews,
    { label: "Details", panel: details, icon: "info" },
  ], resourceName(record));
  return card;
}

function render() {
  hideTagInfo();
  const categories = selectedCategories();
  const matches = filterRecords(records, {
    query: search.value,
    categories,
    status: status.value,
  });
  currentMatches = matches;
  exportOpen.disabled = matches.length === 0;
  matrixReset.disabled = categories.length === 0;
  chartReset.disabled = categories.length === 0;
  barChart.querySelectorAll("button").forEach(button => {
    button.setAttribute("aria-pressed", String(categories.includes(button.dataset.category)));
  });
  heatmap.querySelectorAll("th").forEach(label => {
    const selected = categories.includes(label.dataset.category);
    label.classList.toggle("is-selected", selected);
    label.setAttribute("aria-label", `${label.title}${selected ? ", selected" : ""}`);
  });
  heatmap.querySelectorAll("button").forEach((button) => {
    const pair = JSON.parse(button.dataset.categories);
    button.setAttribute(
      "aria-pressed",
      String(
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
  exportOpen.disabled = true;
  currentMatches = [];
  chartReset.disabled = true;
  chartGroups.disabled = true;
  groupChartLabels.disabled = true;
  barChart.replaceChildren();
  document.querySelector("#chart-status").textContent = "Loading classification totals…";
  matrixReset.disabled = true;
  groupMatrixLabels.disabled = true;
  matrixColumns.disabled = true;
  matrixRows.disabled = true;
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
    availableExportColumns = exportColumns(records);
    renderExportOptions();
    const categories = [
      ...new Set(
        records.flatMap((record) =>
          classifications(record).map((item) => item.category),
        ),
      ),
    ].sort();
    const columnOptions = [...categoryGroups];
    if (categories.some(category => !categoryGroup(category))) {
      columnOptions.push({ id: "ungrouped", name: "Ungrouped" });
    }
    for (const axis of [matrixRows, matrixColumns, chartGroups]) {
      const previousOptions = new Map(
        [...axis.querySelectorAll("input")].map(input => [input.value, input.checked]),
      );
      axis.querySelectorAll("label").forEach(label => label.remove());
      for (const group of columnOptions) {
        const option = element("label", "classification-option");
        option.dataset.group = group.id;
        const checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.value = group.id;
        checkbox.checked = previousOptions.get(group.id)
          ?? (axis !== matrixColumns || group.id !== "producer");
        option.append(checkbox, element("span", "", group.name));
        axis.append(option);
      }
    }
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
    renderHeatmap();
    renderBarChart();
    render();
    groupMatrixLabels.disabled = false;
    matrixColumns.disabled = false;
    matrixRows.disabled = false;
    chartGroups.disabled = false;
    groupChartLabels.disabled = false;
  } catch (error) {
    currentMatches = [];
    exportOpen.disabled = true;
    list.replaceChildren();
    pagination.hidden = true;
    loadError.hidden = false;
    document.querySelector("#load-error-message").textContent =
      `${error.message} Check the data file and your connection, then try again.`;
    document.querySelector("#dataset-summary").textContent =
      "Atlas unavailable.";
    count.textContent = "Data could not be loaded";
    barChart.replaceChildren();
    document.querySelector("#chart-status").textContent =
      "Classification totals unavailable. Retry loading the atlas below.";
    document.querySelector("#heatmap-status").textContent =
      "Category overlaps unavailable. Retry loading the atlas below.";
    console.error("Atlas loading failed:", error);
  } finally {
    results.setAttribute("aria-busy", "false");
  }
}

function renderExportOptions() {
  exportOptions.replaceChildren();
  for (const group of ["Initiative", "Summaries", "Classification reasons"]) {
    const columns = availableExportColumns.filter(column => column.group === group);
    if (!columns.length) continue;
    const fieldset = element("fieldset", "export-group");
    fieldset.append(element("legend", "", group));
    for (const column of columns) {
      const option = element("label", "classification-option");
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.value = column.id;
      checkbox.checked = true;
      option.append(checkbox, element("span", "", column.label));
      fieldset.append(option);
    }
    exportOptions.append(fieldset);
  }
}

exportOpen.addEventListener("click", () => {
  exportError.hidden = true;
  document.querySelector("#export-count").textContent =
    `${currentMatches.length} matching ${currentMatches.length === 1 ? "initiative" : "initiatives"} will be exported.`;
  exportDialog.showModal();
});
document.querySelector("#export-cancel").addEventListener("click", () => exportDialog.close());
for (const [selector, checked] of [["#export-select-all", true], ["#export-select-none", false]]) {
  document.querySelector(selector).addEventListener("click", () => {
    exportOptions.querySelectorAll("input").forEach(input => { input.checked = checked; });
    exportError.hidden = true;
  });
}
exportForm.addEventListener("submit", event => {
  event.preventDefault();
  const selected = new Set([...exportOptions.querySelectorAll("input:checked")].map(input => input.value));
  if (!selected.size) {
    exportError.textContent = "Select at least one column to export.";
    exportError.hidden = false;
    return;
  }
  try {
    const csv = recordsToCSV(currentMatches, availableExportColumns.filter(column => selected.has(column.id)));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = element("a");
    try {
      link.href = url;
      link.download = "ai-literacy-initiatives.csv";
      document.body.append(link);
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    exportDialog.close();
  } catch (error) {
    console.error("CSV export failed:", error);
    exportError.textContent = `Unable to export CSV: ${error.message}`;
    exportError.hidden = false;
  }
});

for (const group of categoryGroups) {
  const label = element("span", "tag", group.name);
  label.dataset.group = group.id;
  document.querySelector("#group-legend").append(label);
}

setupTabs(exploreTabs, exploreTabs.map(tab => document.getElementById(tab.getAttribute("aria-controls"))), index => {
  if (index !== 1) {
    hoveredHeatmapCell = null;
    focusedHeatmapCell = null;
    updateHeatmapHighlight();
    matrixInfo.hidden = true;
  }
});

groupMatrixLabels.addEventListener("change", () => {
  renderHeatmap();
  render();
});
for (const control of [groupChartLabels, chartGroups]) {
  control.addEventListener("change", () => {
    renderBarChart();
    render();
  });
}
tagInfo.addEventListener("mouseenter", () => {
  overTagInfo = true;
  clearTimeout(tagInfoTimer);
});
tagInfo.addEventListener("mouseleave", () => {
  overTagInfo = false;
  deferTagInfoUpdate();
});
document.addEventListener("click", event => {
  if (activeResultTag && !tagInfo.contains(event.target) && !event.target.closest(".result-tag")) hideTagInfo();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !tagInfo.hidden) {
    hideTagInfo();
    event.preventDefault();
  }
});
window.addEventListener("scroll", event => {
  matrixInfo.hidden = true;
  if (event.target !== tagInfo && !tagInfo.contains(event.target)) hideTagInfo();
}, true);
window.addEventListener("resize", () => {
  matrixInfo.hidden = true;
  hideTagInfo();
});
explorePanel.addEventListener("toggle", () => {
  if (!explorePanel.open) {
    hoveredHeatmapCell = null;
    focusedHeatmapCell = null;
    updateHeatmapHighlight();
    matrixInfo.hidden = true;
  }
});
for (const axis of [matrixRows, matrixColumns]) {
  axis.addEventListener("change", () => {
    renderHeatmap();
    render();
  });
}
function clearCategorySelections() {
  categoryOptions.querySelectorAll("input").forEach(input => {
    input.checked = false;
  });
  selectedHeatmapCell = null;
  resetPage();
}
matrixReset.addEventListener("click", clearCategorySelections);
chartReset.addEventListener("click", clearCategorySelections);
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
