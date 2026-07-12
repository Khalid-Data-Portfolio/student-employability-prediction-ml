"use strict";

const byId = (id) => document.getElementById(id);
const formatNumber = new Intl.NumberFormat("en-US");
const formatPercent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const formatRate = (v) => `${v.toFixed(1)}%`;

let rawRows = [];
let modelRows = [];
let featureRows = [];
let activeTraining = "All";
let activeExtra = "All";
let activeIntern = "All";
let activeCgpa = "All";

const CGPA_ORDER = ["<6.0", "6.0-6.9", "7.0-7.9", "8.0-8.9", "9.0+"];

function cleanFeature(name) {
  const map = {
    "cat__PlacementTraining_No": "No placement training",
    "cat__PlacementTraining_Yes": "Placement training",
    "cat__ExtracurricularActivities_No": "No extracurricular",
    "cat__ExtracurricularActivities_Yes": "Extracurricular",
    "num__AptitudeTestScore": "Aptitude score",
    "num__SSC_Marks": "SSC marks",
    "num__HSC_Marks": "HSC marks",
    "num__SoftSkillsRating": "Soft skills rating",
    "num__CGPA": "CGPA",
    "num__Projects": "Projects",
    "num__Workshops_Certifications": "Workshops / certifications",
    "num__Internships": "Internships",
  };
  return map[name] || name.replace(/^cat__|^num__/, "");
}

function initControls() {
  byId("trainingFilter").innerHTML = options(["All", "Yes", "No"]);
  byId("extraFilter").innerHTML = options(["All", "Yes", "No"]);
  byId("internFilter").innerHTML = options(["All", "Yes", "No"]);
  byId("cgpaFilter").innerHTML = options(["All"].concat(CGPA_ORDER));
  byId("trainingFilter").addEventListener("change", () => { activeTraining = byId("trainingFilter").value; updateDashboard(); });
  byId("extraFilter").addEventListener("change", () => { activeExtra = byId("extraFilter").value; updateDashboard(); });
  byId("internFilter").addEventListener("change", () => { activeIntern = byId("internFilter").value; updateDashboard(); });
  byId("cgpaFilter").addEventListener("change", () => { activeCgpa = byId("cgpaFilter").value; updateDashboard(); });
  byId("clearFiltersBtn").addEventListener("click", () => {
    activeTraining = "All";
    activeExtra = "All";
    activeIntern = "All";
    activeCgpa = "All";
    updateDashboard();
  });
}

function options(values) {
  return values.map((v) => `<option value="${v}">${v === "All" ? "All" : v}</option>`).join("");
}

function currentRows() {
  return rawRows.filter((row) => {
    if (activeTraining !== "All" && row.training !== activeTraining) return false;
    if (activeExtra !== "All" && row.extracurricular !== activeExtra) return false;
    if (activeIntern !== "All" && String(row.hasInternship) !== String(activeIntern === "Yes" ? 1 : 0)) return false;
    if (activeCgpa !== "All" && row.cgpaBand !== activeCgpa) return false;
    return true;
  });
}

function groupRate(rows, key, order) {
  const m = new Map();
  rows.forEach((r) => {
    const k = r[key];
    if (!m.has(k)) m.set(k, { count: 0, placed: 0 });
    const o = m.get(k);
    o.count += 1;
    o.placed += r.placed;
  });
  let items = [...m.entries()].map(([k, o]) => ({ label: String(k), count: o.count, placed: o.placed, rate: o.count ? (o.placed / o.count) * 100 : 0 }));
  if (order) items.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  return items;
}

function avgByStatus(rows) {
  const g = { Placed: 0, "Not Placed": 0 };
  const c = { Placed: 0, "Not Placed": 0 };
  rows.forEach((r) => {
    const k = r.placed ? "Placed" : "Not Placed";
    g[k] += r.aptitude;
    c[k] += 1;
  });
  return [
    { label: "Placed", value: c.Placed ? g.Placed / c.Placed : 0 },
    { label: "Not Placed", value: c["Not Placed"] ? g["Not Placed"] / c["Not Placed"] : 0 },
  ];
}

function updateDashboard() {
  syncControls();
  const rows = currentRows();
  renderKpis(rows);
  drawRateBars("chartTraining", groupRate(rows, "training", ["Yes", "No"]));
  drawRateBars("chartExtra", groupRate(rows, "extracurricular", ["Yes", "No"]));
  drawRateBars("chartIntern", groupRate(rows, "internGroup", null).map((it) => ({ ...it, label: it.label === "1" ? "Has internship" : "No internship" })));
  drawRateBars("chartCgpa", groupRate(rows, "cgpaBand", CGPA_ORDER));
  drawValueBars("chartAptitude", avgByStatus(rows));
  triggerReaction();
}

function renderKpis(rows) {
  const students = rows.length;
  const placed = rows.reduce((s, r) => s + r.placed, 0);
  const rate = students ? placed / students : 0;
  const avgCgpa = students ? rows.reduce((s, r) => s + r.cgpa, 0) / students : 0;
  const avgApt = students ? rows.reduce((s, r) => s + r.aptitude, 0) / students : 0;
  byId("studentsKpi").textContent = formatNumber.format(students);
  byId("rateKpi").textContent = rate ? formatPercent.format(rate) : "—";
  byId("cgpaKpi").textContent = avgCgpa ? avgCgpa.toFixed(2) : "—";
  byId("aptKpi").textContent = avgApt ? avgApt.toFixed(1) : "—";
  byId("rateSub").textContent = `${formatNumber.format(placed)} of ${formatNumber.format(students)} placed`;
}

function syncControls() {
  byId("trainingFilter").value = activeTraining;
  byId("extraFilter").value = activeExtra;
  byId("internFilter").value = activeIntern;
  byId("cgpaFilter").value = activeCgpa;
}

function drawRateBars(elementId, items) {
  const svg = byId(elementId);
  if (!svg) return;
  const width = svg.clientWidth || 520;
  const height = svg.clientHeight || 280;
  const pad = { top: 22, right: 16, bottom: 46, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  if (!items.length) {
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = `<text class="chart-label" x="${width / 2}" y="${height / 2}" text-anchor="middle">No data for this filter</text>`;
    return;
  }
  const y = (v) => pad.top + innerH - (v / 100) * innerH;
  const grid = [0, 25, 50, 75, 100]
    .map((s) => {
      const gy = pad.top + innerH - (s / 100) * innerH;
      return `<line class="grid-line" x1="${pad.left}" x2="${pad.left + innerW}" y1="${gy}" y2="${gy}"></line><text class="chart-label" x="${pad.left - 8}" y="${gy + 4}" text-anchor="end">${s}%</text>`;
    })
    .join("");
  const group = innerW / items.length;
  const barW = Math.min(72, group * 0.6);
  const bars = items
    .map((it, i) => {
      const x = pad.left + i * group + group / 2 - barW / 2;
      const h = (it.rate / 100) * innerH;
      const yy = y(it.rate);
      const color = it.rate >= 50 ? "var(--green)" : "var(--accent)";
      return `<rect x="${x}" y="${yy}" width="${barW}" height="${Math.max(2, h)}" rx="5" fill="${color}" data-tip="${it.label}&#10;Placement rate: ${it.rate.toFixed(1)}%&#10;Students: ${it.count}&#10;Placed: ${it.placed}"></rect><text class="chart-label" x="${x + barW / 2}" y="${height - 16}" text-anchor="middle">${it.label}</text><text class="chart-value" x="${x + barW / 2}" y="${yy - 8}" text-anchor="middle">${it.rate.toFixed(0)}%</text>`;
    })
    .join("");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `${grid}<line class="axis" x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${pad.top + innerH}"></line><line class="axis" x1="${pad.left}" x2="${pad.left + innerW}" y1="${pad.top + innerH}" y2="${pad.top + innerH}"></line>${bars}`;
}

function drawValueBars(elementId, items) {
  const svg = byId(elementId);
  if (!svg) return;
  const width = svg.clientWidth || 520;
  const height = svg.clientHeight || 280;
  const pad = { top: 22, right: 16, bottom: 46, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = 100;
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  const grid = [0, 25, 50, 75, 100]
    .map((s) => {
      const gy = pad.top + innerH - (s / 100) * innerH;
      return `<line class="grid-line" x1="${pad.left}" x2="${pad.left + innerW}" y1="${gy}" y2="${gy}"></line><text class="chart-label" x="${pad.left - 8}" y="${gy + 4}" text-anchor="end">${s}</text>`;
    })
    .join("");
  const group = innerW / items.length;
  const barW = Math.min(72, group * 0.6);
  const bars = items
    .map((it, i) => {
      const x = pad.left + i * group + group / 2 - barW / 2;
      const h = (it.value / max) * innerH;
      const yy = y(it.value);
      const color = it.label === "Placed" ? "var(--green)" : "var(--accent)";
      return `<rect x="${x}" y="${yy}" width="${barW}" height="${Math.max(2, h)}" rx="5" fill="${color}" data-tip="${it.label}&#10;Avg aptitude: ${it.value.toFixed(1)}"></rect><text class="chart-label" x="${x + barW / 2}" y="${height - 16}" text-anchor="middle">${it.label}</text><text class="chart-value" x="${x + barW / 2}" y="${yy - 8}" text-anchor="middle">${it.value.toFixed(1)}</text>`;
    })
    .join("");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `${grid}<line class="axis" x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${pad.top + innerH}"></line><line class="axis" x1="${pad.left}" x2="${pad.left + innerW}" y1="${pad.top + innerH}" y2="${pad.top + innerH}"></line>${bars}`;
}

function renderFeatureImportance() {
  const max = Math.max(...featureRows.map((f) => f.importance), 1);
  const sorted = [...featureRows].sort((a, b) => b.importance - a.importance).slice(0, 8);
  byId("impactList").innerHTML = sorted
    .map((f) => {
      const pct = (f.importance / max) * 100;
      return `<div class="impact-row" data-tip="${cleanFeature(f.feature)}&#10;Importance: ${f.importance.toFixed(3)}"><span class="name">${cleanFeature(f.feature)}</span><span class="impact-track"><span class="impact-fill" style="width:${pct}%"></span></span><span class="val">${f.importance.toFixed(2)}</span></div>`;
    })
    .join("");
}

function renderModelTable() {
  const bestAuc = Math.max(...modelRows.map((m) => m.rocAuc));
  const rows = modelRows
    .map((m) => {
      const isBest = Math.abs(m.rocAuc - bestAuc) < 1e-9;
      return `<tr class="${isBest ? "best" : ""}"><td>${m.model}</td><td>${m.split}</td><td>${(m.accuracy * 100).toFixed(1)}%</td><td>${(m.f1 * 100).toFixed(1)}%</td><td>${(m.rocAuc * 100).toFixed(1)}%</td></tr>`;
    })
    .join("");
  byId("modelTable").innerHTML = `<table class="data-table"><thead><tr><th>Model</th><th>Split</th><th>Accuracy</th><th>F1</th><th>ROC AUC</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function triggerReaction() {
  document.querySelectorAll(".kpi-card, .panel").forEach((target) => {
    target.classList.remove("is-reacting");
    window.requestAnimationFrame(() => target.classList.add("is-reacting"));
  });
}

function initTooltips() {
  const tip = byId("chartTooltip");
  if (!tip) return;
  document.addEventListener("mouseover", (event) => {
    const node = event.target.closest("[data-tip]");
    if (!node) return;
    tip.textContent = node.getAttribute("data-tip").replace(/&#10;/g, "\n");
    tip.classList.add("is-visible");
  });
  document.addEventListener("mousemove", (event) => {
    if (!tip.classList.contains("is-visible")) return;
    const offset = 14;
    let left = event.clientX + offset;
    let top = event.clientY + offset;
    const rect = tip.getBoundingClientRect();
    if (left + rect.width > window.innerWidth) left = event.clientX - rect.width - offset;
    if (top + rect.height > window.innerHeight) top = event.clientY - rect.height - offset;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  });
  document.addEventListener("mouseout", (event) => {
    const node = event.target.closest("[data-tip]");
    if (!node) return;
    tip.classList.remove("is-visible");
  });
}

function deriveInternGroup(rows) {
  return rows.map((r) => ({ ...r, internGroup: String(r.hasInternship) }));
}

async function boot() {
  const [students, models, features] = await Promise.all([
    fetch("data/students.json").then((r) => r.json()),
    fetch("data/model_performance.json").then((r) => r.json()),
    fetch("data/feature_importance.json").then((r) => r.json()),
  ]);
  rawRows = deriveInternGroup(students);
  modelRows = models;
  featureRows = features;
  initControls();
  initTooltips();
  renderFeatureImportance();
  renderModelTable();
  updateDashboard();
  window.addEventListener("resize", () => updateDashboard());
}

boot();
