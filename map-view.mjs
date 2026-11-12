import { classificationProfiles, initiativeMap } from "./initiative-map.mjs";
import { resourceName, safeURL } from "./directory.mjs";
import { attachMapNavigation } from "./map-navigation.mjs";

export function renderInitiativeMap(records, mode = "binary") {
  const container = document.querySelector("#initiative-map");
  const detail = document.querySelector("#map-selection");
  const status = document.querySelector("#map-status");
  const controls = document.querySelector("#map-controls");
  const legend = document.querySelector("#map-clusters");
  controls.hidden = true;
  legend.replaceChildren();
  container.replaceChildren();
  detail.replaceChildren();
  const clusterCount = document.querySelector("#map-cluster-count");
  const { profiles } = classificationProfiles(records, mode);
  const maximum = new Set(profiles.map(profile => JSON.stringify(profile.vector))).size;
  for (const option of clusterCount.options) {
    option.disabled = option.value !== "auto" && Number(option.value) > maximum;
  }
  const resetCount = clusterCount.selectedOptions[0].disabled;
  if (resetCount) clusterCount.value = "auto";
  const model = initiativeMap(records, mode, clusterCount.value === "auto" ? null : Number(clusterCount.value));
  const included = model.groups.reduce((sum, group) => sum + group.records.length, 0);
  status.textContent = `${included} initiatives · ${model.clusters.length} ${model.clusters.length === 1 ? "cluster" : "clusters"}`
    + (model.invalidCount ? ` · ${model.invalidCount} invalid profiles excluded` : "")
    + (resetCount ? " · Cluster count reset to Auto: too few distinct profiles." : "");
  if (!model.groups.length) {
    status.textContent += " No usable initiative profiles available.";
    return;
  }
  const svgElement = (tag, attributes) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  };
  const svg = svgElement("svg", { viewBox: "0 0 900 440", role: "group", tabindex: "0", "aria-label": "Initiative similarity map. Plus or minus to zoom; arrow keys to pan; zero to reset." });
  const viewport = svgElement("g", {});
  svg.append(viewport);
  // Replace controls on reload so listeners cannot accumulate.
  const freshControls = controls.cloneNode(true);
  controls.replaceWith(freshControls);
  freshControls.hidden = false;
  const navigation = attachMapNavigation(svg, viewport, freshControls);
  // Use one scale for both axes so relative distances are not stretched.
  const maxX = Math.max(...model.groups.map(group => Math.abs(group.x)));
  const maxY = Math.max(...model.groups.map(group => Math.abs(group.y)));
  const scale = Math.min(maxX ? 410 / maxX : Infinity, maxY ? 180 / maxY : Infinity);
  const finiteScale = Number.isFinite(scale) ? scale : 1;
  const circles = [];
  const select = index => {
    circles.forEach((circle, i) => circle.setAttribute("aria-pressed", String(i === index)));
    detail.replaceChildren();
    const group = model.groups[index];
    const heading = document.createElement("h3");
    heading.textContent = group.records.length === 1 ? "Selected initiative" : `${group.records.length} initiatives with identical profiles`;
    detail.append(heading);
    const clusterLabel = document.createElement("p");
    clusterLabel.textContent = model.clusters.find(cluster => cluster.id === group.cluster).label;
    detail.append(clusterLabel);
    const ul = document.createElement("ul");
    for (const record of group.records) {
      const li = document.createElement("li");
      const url = safeURL(record.url);
      const name = document.createElement(url ? "a" : "span");
      name.textContent = resourceName(record);
      if (url) {
        name.href = url;
        name.target = "_blank";
        name.rel = "noopener noreferrer";
      }
      const description = document.createElement("p");
      description.textContent = record.analysis?.summary || record.metadata?.Description || "No description provided.";
      li.append(name, description);
      ul.append(li);
    }
    detail.append(ul);
  };
  model.groups.forEach((group, index) => {
    const clusterIndex = model.clusters.findIndex(cluster => cluster.id === group.cluster);
    const description = `${group.records.map(resourceName).join("; ")} — ${model.clusters[clusterIndex].label}`;
    const circle = svgElement("circle", {
      cx: 450 + group.x * finiteScale, cy: 220 - group.y * finiteScale,
      r: Math.min(14, 6 + Math.log2(group.records.length) * 2),
      class: "map-point", tabindex: index === 0 ? 0 : -1,
      role: "button", "aria-label": description, "aria-pressed": "false",
      "data-cluster": clusterIndex,
    });
    circle.style.setProperty("--point-color", `var(--cluster-${clusterIndex + 1})`);
    const title = svgElement("title", {});
    title.textContent = description;
    circle.append(title);
    circle.addEventListener("click", () => select(index));
    circle.addEventListener("focus", () => {
      circles.forEach((item, i) => item.setAttribute("tabindex", i === index ? "0" : "-1"));
      select(index);
      navigation.reveal(Number(circle.getAttribute("cx")), Number(circle.getAttribute("cy")));
    });
    circle.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select(index);
      }
      const offset = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (offset) {
        event.preventDefault();
        circles[(index + offset + circles.length) % circles.length].focus();
      }
    });
    circles.push(circle);
    viewport.append(circle);
  });
  model.clusters.forEach((cluster, index) => {
    const entry = document.createElement("li");
    entry.style.setProperty("--point-color", `var(--cluster-${index + 1})`);
    const swatch = document.createElement("span");
    swatch.className = "cluster-swatch";
    swatch.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = `${cluster.label} · ${cluster.count} initiatives`;
    entry.append(swatch, label);
    legend.append(entry);
  });
  container.append(svg);
  select(0);
}
