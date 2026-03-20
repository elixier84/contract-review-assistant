/**
 * export-html.ts
 * Generates a self-contained HTML report from the SQLite database.
 * The output is a single .html file with all data, CSS, and JS embedded inline.
 * Open it in any browser — no server required.
 *
 * Usage: npx tsx scripts/export-html.ts
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "contracts.db");
const db = new Database(DB_PATH, { readonly: true });
db.pragma("journal_mode = WAL");

// ── Fetch all data ──────────────────────────────────────────────────────────

const contracts = db.prepare(`
  SELECT id, name, type, status, effective_date, expiry_date,
         parent_id, licensed_technology, territory, initial_fee,
         analysis_confidence, needs_review
  FROM contracts ORDER BY id
`).all();

const clauses = db.prepare(`SELECT * FROM clauses ORDER BY contract_id, type, section`).all();
const definitions = db.prepare(`SELECT * FROM definitions ORDER BY term`).all();
const relationships = db.prepare(`SELECT * FROM relationships ORDER BY source_id`).all();
const pricingTables = db.prepare(`SELECT * FROM pricing_tables ORDER BY contract_id`).all();
const patents = db.prepare(`SELECT * FROM patents ORDER BY contract_id, country`).all();
const products = db.prepare(`SELECT * FROM licensed_products ORDER BY contract_id`).all();
const reviewNotes = db.prepare(`SELECT * FROM review_notes ORDER BY severity DESC, created_at DESC`).all();
const technologies = db.prepare(`SELECT * FROM technologies ORDER BY name`).all();

db.close();

// ── Bundle everything as JSON ───────────────────────────────────────────────

const DATA = JSON.stringify({
  contracts,
  clauses,
  definitions,
  relationships,
  pricingTables,
  patents,
  products,
  reviewNotes,
  technologies,
  exportedAt: new Date().toISOString(),
});

// ── Generate HTML ───────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Contract Review Assistant — Export</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.5; }
  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

  /* Header */
  header { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 16px 24px; position: sticky; top: 0; z-index: 50; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  header .inner { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  header h1 { font-size: 18px; font-weight: 900; color: #1e293b; letter-spacing: -0.5px; display: flex; align-items: center; gap: 10px; }
  header h1 .icon { width: 36px; height: 36px; background: #2563eb; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; }
  .tabs { display: flex; background: #f1f5f9; padding: 4px; border-radius: 8px; gap: 2px; border: 1px solid #e2e8f0; flex-wrap: wrap; }
  .tab-btn { padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 700; border: none; cursor: pointer; background: transparent; color: #64748b; transition: all .15s; white-space: nowrap; }
  .tab-btn.active { background: #fff; color: #2563eb; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
  .tab-btn:hover:not(.active) { color: #1e293b; }

  /* Cards */
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .card-header { padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 800; font-size: 14px; color: #334155; }
  .card-body { padding: 20px; }
  .card + .card { margin-top: 16px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
  th { background: #f8fafc; padding: 10px 16px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 800; border-bottom: 1px solid #e2e8f0; }
  td { padding: 10px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:hover { background: #f8fafc; }

  /* Badges */
  .badge { display: inline-block; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .badge-green { background: #dcfce7; color: #15803d; }
  .badge-yellow { background: #fef9c3; color: #a16207; }
  .badge-red { background: #fee2e2; color: #dc2626; }
  .badge-blue { background: #dbeafe; color: #2563eb; }
  .badge-orange { background: #ffedd5; color: #c2410c; }
  .badge-slate { background: #f1f5f9; color: #64748b; }

  /* Severity */
  .sev-critical { background: #dc2626; color: #fff; }
  .sev-high { background: #ef4444; color: #fff; }
  .sev-medium { background: #f97316; color: #fff; }
  .sev-low { background: #eab308; color: #fff; }

  /* Tab content */
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* Stat boxes */
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }
  .stat-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; }
  .stat-box .label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; }
  .stat-box .value { font-size: 24px; font-weight: 900; color: #1e293b; font-variant-numeric: tabular-nums; }

  /* Snippet */
  .snippet { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #475569; font-style: italic; margin-top: 6px; line-height: 1.6; max-height: 120px; overflow-y: auto; }

  /* Glossary */
  .def-card { background: #fff; border: 2px solid transparent; border-radius: 14px; padding: 20px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .def-card:hover { border-color: #93c5fd; }
  .def-term { font-size: 16px; font-weight: 900; color: #1e293b; letter-spacing: -0.3px; }
  .def-text { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 10px; padding: 12px; font-size: 13px; color: #475569; font-style: italic; margin-top: 8px; }
  .def-meta { text-align: right; font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 10px; }

  /* Search */
  .search-box { width: 100%; max-width: 400px; padding: 10px 16px 10px 40px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 14px; outline: none; background: #f8fafc url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E") 14px center no-repeat; }
  .search-box:focus { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }

  /* Confidence bar */
  .conf-bar { width: 60px; height: 6px; background: #e2e8f0; border-radius: 3px; display: inline-block; vertical-align: middle; margin-right: 6px; }
  .conf-fill { height: 100%; border-radius: 3px; }

  /* Pricing tiers */
  .tier-table { width: 100%; font-size: 12px; margin-top: 8px; }
  .tier-table th { font-size: 10px; padding: 6px 10px; }
  .tier-table td { padding: 6px 10px; font-family: ui-monospace, monospace; }

  /* Footer */
  footer { text-align: center; padding: 32px 24px; font-size: 11px; color: #94a3b8; }

  /* Responsive */
  @media (max-width: 768px) {
    .stat-grid { grid-template-columns: 1fr 1fr; }
    header .inner { flex-direction: column; align-items: flex-start; }
  }

  /* Print */
  @media print {
    header { position: static; }
    .tabs { display: none; }
    .tab-content { display: block !important; page-break-inside: avoid; }
    .tab-content::before { content: attr(data-title); display: block; font-size: 20px; font-weight: 900; margin: 24px 0 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
  }
</style>
</head>
<body>

<header>
  <div class="inner">
    <h1><span class="icon">&#128269;</span> Contract Review Assistant</h1>
    <div class="tabs" id="tabs">
      <button class="tab-btn active" data-tab="overview">Audit Overview</button>
      <button class="tab-btn" data-tab="listing">Contract Listing</button>
      <button class="tab-btn" data-tab="technology">Technology</button>
      <button class="tab-btn" data-tab="pricing">Pricing</button>
      <button class="tab-btn" data-tab="glossary">Glossary</button>
      <button class="tab-btn" data-tab="notes">Review Notes</button>
    </div>
  </div>
</header>

<div class="container">
  <!-- ═══ OVERVIEW ═══ -->
  <div class="tab-content active" id="tab-overview" data-title="Audit Overview">
    <div id="overview-content"></div>
  </div>

  <!-- ═══ CONTRACT LISTING ═══ -->
  <div class="tab-content" id="tab-listing" data-title="Contract Listing">
    <div id="listing-content"></div>
  </div>

  <!-- ═══ TECHNOLOGY ═══ -->
  <div class="tab-content" id="tab-technology" data-title="Technology">
    <div id="technology-content"></div>
  </div>

  <!-- ═══ PRICING ═══ -->
  <div class="tab-content" id="tab-pricing" data-title="Pricing">
    <div id="pricing-content"></div>
  </div>

  <!-- ═══ GLOSSARY ═══ -->
  <div class="tab-content" id="tab-glossary" data-title="Glossary">
    <div id="glossary-content"></div>
  </div>

  <!-- ═══ REVIEW NOTES ═══ -->
  <div class="tab-content" id="tab-notes" data-title="Review Notes">
    <div id="notes-content"></div>
  </div>
</div>

<footer>
  Contract Review Assistant — Exported <span id="export-date"></span> — Data is embedded in this file, no server required.
</footer>

<script>
// ── Embedded data ───────────────────────────────────────────────────────────
const DATA = ${DATA};

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  const m = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return dt.getDate().toString().padStart(2,"0") + "-" + m[dt.getMonth()] + "-" + dt.getFullYear();
}

function confBadge(v) {
  if (v == null) return '<span class="badge badge-slate">N/A</span>';
  const pct = (v * 100).toFixed(0);
  const cls = v >= 0.8 ? "badge-green" : v >= 0.5 ? "badge-yellow" : "badge-red";
  return '<span class="badge ' + cls + '">' + pct + '%</span>';
}

function confBar(v) {
  if (v == null) return "";
  const pct = (v * 100).toFixed(0);
  const color = v >= 0.8 ? "#22c55e" : v >= 0.5 ? "#eab308" : "#ef4444";
  return '<span class="conf-bar"><span class="conf-fill" style="width:' + pct + '%;background:' + color + '"></span></span>' + pct + '%';
}

function parseJSON(s) { try { return JSON.parse(s); } catch { return null; } }
function esc(s) { if (!s) return ""; const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function sevClass(s) {
  return { critical: "sev-critical", high: "sev-high", medium: "sev-medium", low: "sev-low" }[s] || "badge-slate";
}

// ── Tab switching ───────────────────────────────────────────────────────────
document.getElementById("tabs").addEventListener("click", function(e) {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
});

// ── Render Overview ─────────────────────────────────────────────────────────
(function renderOverview() {
  const el = document.getElementById("overview-content");
  const auditClauses = DATA.clauses.filter(c => c.type === "audit_right");
  const retentionClauses = DATA.clauses.filter(c => c.type === "data_retention");
  const interestClauses = DATA.clauses.filter(c => c.type === "interest");
  const pending = DATA.reviewNotes.filter(n => !n.is_reviewed).length;
  const reviewed = DATA.reviewNotes.filter(n => n.is_reviewed && !n.narrative).length;
  const resolved = DATA.reviewNotes.filter(n => n.is_reviewed && !!n.narrative).length;

  let h = '<div class="stat-grid">';
  h += '<div class="stat-box"><div class="label">Contracts</div><div class="value">' + DATA.contracts.length + '</div></div>';
  h += '<div class="stat-box"><div class="label">Clauses Extracted</div><div class="value">' + DATA.clauses.length + '</div></div>';
  h += '<div class="stat-box"><div class="label">Definitions</div><div class="value">' + DATA.definitions.length + '</div></div>';
  h += '<div class="stat-box"><div class="label">Review Notes</div><div class="value">' + DATA.reviewNotes.length + '</div></div>';
  h += '</div>';

  // Contracts in scope
  h += '<div class="card"><div class="card-header">Contracts in Scope</div><div class="card-body">';
  h += '<table><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Confidence</th><th>Review</th></tr></thead><tbody>';
  for (const c of DATA.contracts) {
    h += '<tr><td><strong>' + esc(c.id) + '</strong></td><td>' + esc(c.name) + '</td>';
    h += '<td><span class="badge badge-blue">' + esc(c.type) + '</span></td>';
    h += '<td>' + confBar(c.analysis_confidence) + '</td>';
    h += '<td>' + (c.needs_review ? '<span class="badge badge-red">Needs Review</span>' : '<span class="badge badge-green">OK</span>') + '</td></tr>';
  }
  h += '</tbody></table></div></div>';

  // Audit Right
  h += '<div class="card" style="margin-top:16px"><div class="card-header">Audit Right Clauses</div><div class="card-body">';
  if (auditClauses.length) {
    h += '<table><thead><tr><th>Contract</th><th>Section</th><th>Key Terms</th><th>Confidence</th></tr></thead><tbody>';
    for (const c of auditClauses) {
      const kt = parseJSON(c.key_terms_json) || {};
      const terms = [];
      if (kt.notice_period_days) terms.push(kt.notice_period_days + "d notice");
      if (kt.frequency) terms.push(kt.frequency);
      if (kt.retention_years) terms.push(kt.retention_years + "yr retention");
      h += '<tr><td><strong>' + esc(c.contract_id) + '</strong></td><td>' + esc(c.section) + '</td><td>' + esc(terms.join(", ")) + '</td><td>' + confBadge(c.confidence) + '</td></tr>';
    }
    h += '</tbody></table>';
  } else { h += '<p style="color:#94a3b8;font-style:italic">No audit right clauses found</p>'; }
  h += '</div></div>';

  // Data Retention + Interest side by side
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">';
  // Retention
  h += '<div class="card"><div class="card-header">Data Retention</div><div class="card-body"><table><tbody>';
  for (const c of retentionClauses) {
    const kt = parseJSON(c.key_terms_json) || {};
    h += '<tr><td><strong>' + esc(c.contract_id) + '</strong></td><td>' + (kt.retention_years ? kt.retention_years + " Years" : esc(c.section)) + '</td></tr>';
  }
  if (!retentionClauses.length) h += '<tr><td colspan="2" style="color:#94a3b8;font-style:italic;text-align:center">No data</td></tr>';
  h += '</tbody></table></div></div>';
  // Interest
  h += '<div class="card"><div class="card-header">Interest Clause</div><div class="card-body"><table><tbody>';
  for (const c of interestClauses) {
    const kt = parseJSON(c.key_terms_json) || {};
    h += '<tr><td><strong>' + esc(c.contract_id) + '</strong></td><td>' + esc(kt.rate || kt.interest_rate || c.section) + '</td></tr>';
  }
  if (!interestClauses.length) h += '<tr><td colspan="2" style="color:#94a3b8;font-style:italic;text-align:center">No data</td></tr>';
  h += '</tbody></table></div></div>';
  h += '</div>';

  // Review Notes Summary
  h += '<div class="card" style="margin-top:16px"><div class="card-header">Review Notes Summary</div><div class="card-body">';
  h += '<div style="display:flex;gap:16px">';
  h += '<div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px;text-align:center"><div style="font-size:10px;font-weight:800;color:#ef4444;text-transform:uppercase">Pending</div><div style="font-size:20px;font-weight:900;color:#dc2626">' + pending + '</div></div>';
  h += '<div style="flex:1;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px;text-align:center"><div style="font-size:10px;font-weight:800;color:#f97316;text-transform:uppercase">Reviewed</div><div style="font-size:20px;font-weight:900;color:#c2410c">' + reviewed + '</div></div>';
  h += '<div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;text-align:center"><div style="font-size:10px;font-weight:800;color:#22c55e;text-transform:uppercase">Resolved</div><div style="font-size:20px;font-weight:900;color:#15803d">' + resolved + '</div></div>';
  h += '</div></div></div>';

  el.innerHTML = h;
})();

// ── Render Contract Listing ─────────────────────────────────────────────────
(function renderListing() {
  const el = document.getElementById("listing-content");
  const masters = DATA.contracts.filter(c => !c.parent_id);
  const getChildren = pid => DATA.contracts.filter(c => c.parent_id === pid);

  let h = '';

  // ── Relationship Diagram (SVG) ──
  h += '<div class="card" style="margin-bottom:16px"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center">Contract Relationship Map';
  h += '<div style="display:flex;gap:12px;font-size:10px;font-weight:700;color:#94a3b8">';
  h += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:2px;background:#6366f1;border-radius:1px"></span>references T&C</span>';
  h += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:2px;background:#ef4444;border-radius:1px"></span>amends</span>';
  h += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:2px;background:#f59e0b;border-radius:1px"></span>pricing for</span>';
  h += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:2px;background:#8b5cf6;border-radius:1px"></span>related tech</span>';
  h += '</div></div>';
  h += renderRelationshipSVG();
  h += '</div>';

  // ── Timeline Chart (SVG) ──
  h += '<div class="card" style="margin-bottom:16px"><div class="card-header">Contract Timeline</div>';
  h += renderTimelineSVG();
  h += '</div>';

  // ── Table ──
  h += '<div class="card"><div class="card-header">Contract Hierarchy</div>';
  h += '<table><thead><tr><th>Contract</th><th>Type</th><th>Status</th><th>Effective</th><th>Expiry</th><th>Confidence</th></tr></thead><tbody>';
  for (const m of masters) {
    h += '<tr><td><strong>' + esc(m.id) + ': ' + esc(m.name) + '</strong></td>';
    h += '<td><span class="badge badge-blue">' + esc(m.type) + '</span></td>';
    h += '<td>' + esc(m.status) + '</td>';
    h += '<td style="font-family:monospace;font-size:12px">' + fmtDate(m.effective_date) + '</td>';
    h += '<td style="font-family:monospace;font-size:12px">' + (fmtDate(m.expiry_date) || "Open Ended") + '</td>';
    h += '<td>' + confBar(m.analysis_confidence) + '</td></tr>';
    for (const c of getChildren(m.id)) {
      h += '<tr style="background:#f8fafc"><td style="padding-left:40px">&#8627; <strong>' + esc(c.id) + ': ' + esc(c.name) + '</strong></td>';
      h += '<td><span class="badge badge-slate">' + esc(c.type) + '</span></td>';
      h += '<td>' + esc(c.status) + '</td>';
      h += '<td style="font-family:monospace;font-size:12px">' + fmtDate(c.effective_date) + '</td>';
      h += '<td style="font-family:monospace;font-size:12px">' + (fmtDate(c.expiry_date) || "Open Ended") + '</td>';
      h += '<td>' + confBar(c.analysis_confidence) + '</td></tr>';
    }
  }
  h += '</tbody></table></div>';

  // Relationships table
  if (DATA.relationships.length) {
    h += '<div class="card" style="margin-top:16px"><div class="card-header">Contract Relationships (' + DATA.relationships.length + ')</div>';
    h += '<table><thead><tr><th>Source</th><th>Target</th><th>Type</th><th>Evidence</th><th>Confidence</th></tr></thead><tbody>';
    for (const r of DATA.relationships) {
      h += '<tr><td><strong>' + esc(r.source_id) + '</strong></td><td><strong>' + esc(r.target_id) + '</strong></td>';
      h += '<td><span class="badge badge-blue">' + esc(r.type) + '</span></td>';
      h += '<td style="font-size:12px;max-width:300px">' + esc(r.evidence_text || "") + '</td>';
      h += '<td>' + confBadge(r.confidence) + '</td></tr>';
    }
    h += '</tbody></table></div>';
  }

  el.innerHTML = h;
})();

// ── SVG: Relationship Diagram ───────────────────────────────────────────────
function renderRelationshipSVG() {
  const typeColors = { master_tc: "#2563eb", technology_license: "#059669", side_letter: "#d97706" };
  const typeLabels = { master_tc: "Master T&C", technology_license: "Tech License", side_letter: "Side Letter" };
  const edgeColors = { references_tc: "#6366f1", amends: "#ef4444", pricing_for: "#f59e0b", related_technology: "#8b5cf6" };
  const edgeLabels = { references_tc: "references T&C", amends: "amends", pricing_for: "pricing for", related_technology: "related tech" };

  const svgW = 800, svgH = 440, nodeW = 220, nodeH = 70;
  const nodes = [];

  // Layout: master top, tech licenses middle, side letter bottom
  const master = DATA.contracts.find(c => c.type === "master_tc" || !c.parent_id);
  const techLicenses = DATA.contracts.filter(c => c.type === "technology_license");
  const sideLetter = DATA.contracts.find(c => c.type === "side_letter");

  if (master) nodes.push({ id: master.id, name: master.id + ": " + master.name, type: master.type, x: svgW/2-nodeW/2, y: 30, w: nodeW, h: nodeH });
  const spacing = 280, startX = svgW/2 - ((techLicenses.length-1)*spacing)/2 - nodeW/2;
  techLicenses.forEach((c, i) => nodes.push({ id: c.id, name: c.id + ": " + c.name, type: c.type, x: startX + i*spacing, y: 180, w: nodeW, h: nodeH }));
  if (sideLetter && !nodes.find(n => n.id === sideLetter.id)) nodes.push({ id: sideLetter.id, name: sideLetter.id + ": " + sideLetter.name, type: sideLetter.type, x: svgW/2-nodeW/2, y: 330, w: nodeW, h: nodeH });

  // Deduplicate edges: best confidence per source→target
  const edgeMap = new Map();
  for (const r of DATA.relationships) {
    const key = r.source_id + "→" + r.target_id;
    const ex = edgeMap.get(key);
    if (!ex || (r.confidence||0) > ex.confidence) edgeMap.set(key, { source: r.source_id, target: r.target_id, type: r.type, confidence: r.confidence||0 });
  }
  const edges = Array.from(edgeMap.values());

  function rectEdge(node, angle) {
    const cx=node.x+node.w/2, cy=node.y+node.h/2, hw=node.w/2+2, hh=node.h/2+2;
    const cos=Math.cos(angle), sin=Math.sin(angle);
    const s = Math.min(cos!==0?hw/Math.abs(cos):Infinity, sin!==0?hh/Math.abs(sin):Infinity);
    return { x: cx+cos*s, y: cy+sin*s };
  }

  let svg = '<svg viewBox="0 0 '+svgW+' '+svgH+'" style="width:100%;min-height:360px">';
  svg += '<defs>';
  for (const [t,c] of Object.entries(edgeColors)) svg += '<marker id="arr-'+t+'" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 3L0 6z" fill="'+c+'"/></marker>';
  svg += '<filter id="ns" x="-4%" y="-4%" width="108%" height="116%"><feDropShadow dx="0" dy="1" stdDeviation="3" floodOpacity="0.08"/></filter></defs>';

  // Edges
  for (const edge of edges) {
    const from = nodes.find(n => n.id === edge.source), to = nodes.find(n => n.id === edge.target);
    if (!from || !to) continue;
    const fcx=from.x+from.w/2, fcy=from.y+from.h/2, tcx=to.x+to.w/2, tcy=to.y+to.h/2;
    const angle = Math.atan2(tcy-fcy, tcx-fcx);
    const fe = rectEdge(from, angle), te = rectEdge(to, angle+Math.PI);
    const mx=(fe.x+te.x)/2, my=(fe.y+te.y)/2, px=-(te.y-fe.y)*0.1, py=(te.x-fe.x)*0.1;
    const color = edgeColors[edge.type] || "#94a3b8";
    const dash = edge.type === "related_technology" ? ' stroke-dasharray="6,3"' : '';
    svg += '<path d="M '+fe.x+' '+fe.y+' Q '+(mx+px)+' '+(my+py)+', '+te.x+' '+te.y+'" fill="none" stroke="'+color+'" stroke-width="1.5"'+dash+' marker-end="url(#arr-'+edge.type+')" opacity="0.6"/>';
    svg += '<rect x="'+(mx+px-36)+'" y="'+(my+py-8)+'" width="72" height="16" rx="4" fill="#f8fafc" stroke="'+color+'" stroke-width="0.5" opacity="0.85"/>';
    svg += '<text x="'+(mx+px)+'" y="'+(my+py+3.5)+'" text-anchor="middle" font-size="8" font-weight="700" fill="'+color+'" style="text-transform:uppercase;letter-spacing:0.03em">'+(edgeLabels[edge.type]||edge.type)+'</text>';
  }

  // Nodes
  for (const node of nodes) {
    const color = typeColors[node.type] || "#64748b";
    const label = typeLabels[node.type] || node.type;
    const shortName = node.name.length > 35 ? node.name.slice(0,35)+"..." : node.name;
    svg += '<g filter="url(#ns)">';
    svg += '<rect x="'+node.x+'" y="'+node.y+'" width="'+node.w+'" height="'+node.h+'" rx="12" fill="#fff" stroke="'+color+'" stroke-width="2"/>';
    svg += '<rect x="'+node.x+'" y="'+node.y+'" width="6" height="'+node.h+'" rx="3" fill="'+color+'"/>';
    svg += '<text x="'+(node.x+16)+'" y="'+(node.y+24)+'" font-size="13" font-weight="900" fill="#1e293b">'+esc(node.id)+'</text>';
    svg += '<text x="'+(node.x+16)+'" y="'+(node.y+42)+'" font-size="10" fill="#64748b">'+esc(shortName)+'</text>';
    svg += '<rect x="'+(node.x+node.w-75)+'" y="'+(node.y+48)+'" width="65" height="16" rx="4" fill="'+color+'" opacity="0.12"/>';
    svg += '<text x="'+(node.x+node.w-42)+'" y="'+(node.y+59)+'" text-anchor="middle" font-size="8" font-weight="800" fill="'+color+'" style="text-transform:uppercase">'+esc(label)+'</text>';
    svg += '</g>';
  }
  svg += '</svg>';
  return svg;
}

// ── SVG: Timeline Chart ─────────────────────────────────────────────────────
function renderTimelineSVG() {
  const typeColors = { master_tc: "#2563eb", technology_license: "#059669", side_letter: "#d97706" };
  const typeLabels = { master_tc: "Master T&C", technology_license: "Tech License", side_letter: "Side Letter" };

  const dates = DATA.contracts.flatMap(c => [c.effective_date, c.expiry_date].filter(Boolean));
  const times = dates.map(d => new Date(d).getTime());
  const pad = 90*24*60*60*1000;
  const startTime = Math.min(...times) - pad, endTime = Math.max(...times) + pad;
  const totalDur = endTime - startTime;

  const startYear = new Date(startTime).getFullYear();
  const endYear = new Date(endTime).getFullYear() + 1;
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  const getX = (ds, w) => ((new Date(ds).getTime() - startTime) / totalDur) * w;

  const svgW = 1000, rowH = 50, headerH = 35;
  const masters = DATA.contracts.filter(c => !c.parent_id && c.type === "master_tc");
  const rows = [];
  let curY = headerH + 10;

  for (const m of masters) {
    rows.push({ c: m, y: curY, isChild: false });
    curY += rowH;
    const children = DATA.contracts.filter(c => c.parent_id === m.id);
    for (const ch of children) { rows.push({ c: ch, y: curY, isChild: true }); curY += rowH; }
    curY += 12;
  }
  // Ungrouped
  const grouped = new Set(rows.map(r => r.c.id));
  for (const c of DATA.contracts) {
    if (!grouped.has(c.id)) { rows.push({ c, y: curY, isChild: false }); curY += rowH; }
  }

  const svgH = curY + 20;
  let svg = '<svg viewBox="0 0 '+svgW+' '+svgH+'" style="width:100%;min-height:'+Math.max(200, svgH*0.55)+'px">';

  // Year grid
  for (const yr of years) {
    const x = getX(yr+"-01-01", svgW);
    if (x < 0 || x > svgW) continue;
    svg += '<line x1="'+x+'" y1="'+(headerH-5)+'" x2="'+x+'" y2="'+svgH+'" stroke="#f1f5f9" stroke-width="1"/>';
    svg += '<text x="'+(x+4)+'" y="'+(headerH-10)+'" font-size="11" font-weight="800" fill="#cbd5e1">'+yr+'</text>';
  }

  // Today
  const todayX = getX(new Date().toISOString().slice(0,10), svgW);
  if (todayX > 0 && todayX < svgW) {
    svg += '<line x1="'+todayX+'" y1="'+headerH+'" x2="'+todayX+'" y2="'+svgH+'" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,3"/>';
    svg += '<rect x="'+(todayX-20)+'" y="'+(headerH-4)+'" width="40" height="14" rx="4" fill="#ef4444"/>';
    svg += '<text x="'+todayX+'" y="'+(headerH+7)+'" text-anchor="middle" font-size="8" font-weight="800" fill="#fff">TODAY</text>';
  }

  // Bars
  for (const row of rows) {
    const c = row.c;
    if (!c.effective_date) continue;
    const color = typeColors[c.type] || "#64748b";
    const barX = getX(c.effective_date, svgW);
    const barEndX = c.expiry_date ? getX(c.expiry_date, svgW) : svgW - 20;
    const barW = Math.max(barEndX - barX, 8);
    const barH = row.isChild ? 18 : 24;
    const barY = row.y + (rowH - barH) / 2;

    if (row.isChild) svg += '<line x1="'+(barX-6)+'" y1="'+(row.y-8)+'" x2="'+(barX-6)+'" y2="'+(barY+barH/2)+'" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3,2"/>';
    svg += '<rect x="'+barX+'" y="'+barY+'" width="'+barW+'" height="'+barH+'" rx="'+(barH/2)+'" fill="'+color+'" opacity="0.8"/>';
    if (!c.expiry_date) svg += '<text x="'+(barX+barW+4)+'" y="'+(barY+barH/2+3)+'" font-size="10" fill="#94a3b8" font-weight="700">&#x2192; Open</text>';

    const label = c.id + ": " + (c.name.length > 30 ? c.name.slice(0,30)+"..." : c.name);
    svg += '<text x="'+(barX+10)+'" y="'+(barY+barH/2+(row.isChild?3.5:4))+'" font-size="'+(row.isChild?9:11)+'" font-weight="800" fill="#fff">'+esc(label)+'</text>';
  }

  // Legend
  svg += '<g transform="translate(10,'+(svgH-14)+')">';
  let lx = 0;
  for (const [t,label] of Object.entries(typeLabels)) {
    svg += '<circle cx="'+(lx+5)+'" cy="0" r="5" fill="'+(typeColors[t]||"#64748b")+'"/>';
    svg += '<text x="'+(lx+14)+'" y="4" font-size="10" font-weight="700" fill="#94a3b8">'+label+'</text>';
    lx += label.length * 7 + 30;
  }
  svg += '</g>';

  svg += '</svg>';
  return svg;
}

// ── Render Technology ───────────────────────────────────────────────────────
(function renderTechnology() {
  const el = document.getElementById("technology-content");
  const techMap = new Map();

  for (const c of DATA.contracts) {
    if (c.licensed_technology) {
      if (!techMap.has(c.licensed_technology)) techMap.set(c.licensed_technology, { name: c.licensed_technology, contracts: [] });
      techMap.get(c.licensed_technology).contracts.push({ id: c.id, name: c.name, role: "licensed_under" });
    }
  }
  for (const p of DATA.pricingTables) {
    if (p.technology) {
      if (!techMap.has(p.technology)) techMap.set(p.technology, { name: p.technology, contracts: [] });
      const t = techMap.get(p.technology);
      if (!t.contracts.find(x => x.id === p.contract_id)) {
        const cn = DATA.contracts.find(c => c.id === p.contract_id);
        t.contracts.push({ id: p.contract_id, name: cn ? cn.name : p.contract_id, role: "pricing_defined_in" });
      }
    }
  }

  let h = '<div class="stat-grid"><div class="stat-box"><div class="label">Technologies Detected</div><div class="value">' + techMap.size + '</div></div>';
  h += '<div class="stat-box"><div class="label">Patents</div><div class="value">' + DATA.patents.length + '</div></div>';
  h += '<div class="stat-box"><div class="label">Licensed Products</div><div class="value">' + DATA.products.length + '</div></div></div>';

  for (const [, tech] of techMap) {
    h += '<div class="card" style="margin-bottom:16px"><div class="card-header">' + esc(tech.name) + ' — ' + tech.contracts.length + ' governing agreement(s)</div><div class="card-body">';
    h += '<table><thead><tr><th>Contract</th><th>Role</th></tr></thead><tbody>';
    for (const tc of tech.contracts) {
      h += '<tr><td><strong>' + esc(tc.id) + '</strong>: ' + esc(tc.name) + '</td><td><span class="badge badge-slate">' + esc(tc.role) + '</span></td></tr>';
    }
    h += '</tbody></table>';

    // Patents for this tech
    const techPatents = DATA.patents.filter(p => p.technology === tech.name);
    if (techPatents.length) {
      h += '<div style="margin-top:12px"><div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#94a3b8;margin-bottom:6px">Patents (' + techPatents.length + ')</div>';
      h += '<table class="tier-table"><thead><tr><th>Country</th><th>Patent #</th><th>Type</th></tr></thead><tbody>';
      for (const p of techPatents) {
        h += '<tr><td>' + esc(p.country) + '</td><td>' + esc(p.patent_number) + '</td><td>' + (p.is_application ? "Application" : "Granted") + '</td></tr>';
      }
      h += '</tbody></table></div>';
    }

    // Products for this tech
    const techProducts = DATA.products.filter(p => p.technology === tech.name);
    if (techProducts.length) {
      h += '<div style="margin-top:12px"><div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#94a3b8;margin-bottom:6px">Licensed Products (' + techProducts.length + ')</div>';
      h += '<table class="tier-table"><thead><tr><th>Product Type</th><th>Category</th></tr></thead><tbody>';
      for (const p of techProducts) {
        h += '<tr><td>' + esc(p.product_type) + '</td><td>' + esc(p.category) + '</td></tr>';
      }
      h += '</tbody></table></div>';
    }

    h += '</div></div>';
  }

  el.innerHTML = h;
})();

// ── Render Pricing ──────────────────────────────────────────────────────────
(function renderPricing() {
  const el = document.getElementById("pricing-content");
  const byContract = new Map();
  for (const p of DATA.pricingTables) {
    if (!byContract.has(p.contract_id)) byContract.set(p.contract_id, []);
    byContract.get(p.contract_id).push(p);
  }

  let h = '<div class="stat-grid"><div class="stat-box"><div class="label">Pricing Tables</div><div class="value">' + DATA.pricingTables.length + '</div></div>';
  h += '<div class="stat-box"><div class="label">Contracts with Pricing</div><div class="value">' + byContract.size + '</div></div></div>';

  for (const [cid, tables] of byContract) {
    const cn = DATA.contracts.find(c => c.id === cid);
    h += '<div class="card" style="margin-bottom:16px"><div class="card-header">' + esc(cid) + ': ' + esc(cn ? cn.name : "") + ' — ' + tables.length + ' table(s)</div><div class="card-body">';

    for (const t of tables) {
      h += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:12px">';
      h += '<div style="display:flex;justify-content:space-between;align-items:center">';
      h += '<div><strong>' + esc(t.name || t.technology) + '</strong>';
      h += '<div style="font-size:10px;color:#94a3b8;margin-top:2px">' + esc(t.section || "") + (t.technology ? " | " + esc(t.technology) : "") + '</div></div>';
      h += '<span class="badge ' + (t.is_used_in_reports ? "badge-green" : "badge-slate") + '">' + (t.is_used_in_reports ? "Used in Reports" : "Not Reported") + '</span>';
      h += '</div>';

      // Royalty basis
      if (t.royalty_basis) {
        h += '<div style="margin-top:8px;font-size:11px;color:#64748b"><strong>Royalty Basis:</strong> ' + esc(t.royalty_basis) + '</div>';
      }

      // Tiers
      const tiers = parseJSON(t.tiers_json);
      if (tiers && tiers.length) {
        h += '<table class="tier-table" style="margin-top:8px"><thead><tr><th>From</th><th>To</th><th style="text-align:right">Rate</th></tr></thead><tbody>';
        for (const tier of tiers) {
          h += '<tr><td>' + (tier.from != null ? Number(tier.from).toLocaleString() : "") + '</td>';
          h += '<td>' + (tier.to != null ? Number(tier.to).toLocaleString() : "+") + '</td>';
          h += '<td style="text-align:right;color:#15803d;font-weight:700">$' + (tier.rate != null ? Number(tier.rate).toFixed(2) : "—") + '</td></tr>';
        }
        h += '</tbody></table>';
      }

      // Discounts
      const discounts = parseJSON(t.discounts_json);
      if (discounts && discounts.length) {
        h += '<div style="margin-top:8px;font-size:10px;font-weight:800;text-transform:uppercase;color:#94a3b8">Discounts</div>';
        for (const d of discounts) {
          h += '<div style="font-size:12px;color:#475569;background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;margin-top:4px">';
          h += '<strong>' + esc(d.type || d.description || "") + '</strong>';
          if (d.amount) h += ' <span style="color:#15803d">-$' + d.amount + '</span>';
          if (d.condition || d.description) h += ' <span style="color:#94a3b8">| ' + esc(d.condition || d.description) + '</span>';
          h += '</div>';
        }
      }

      // CPI
      if (t.cpi_adjustment) {
        h += '<div style="margin-top:8px;font-size:11px;color:#64748b"><strong>CPI Adjustment:</strong> ' + esc(t.cpi_adjustment) + '</div>';
      }

      h += '</div>';
    }
    h += '</div></div>';
  }

  if (!byContract.size) h += '<div class="card"><div class="card-body" style="text-align:center;color:#94a3b8;font-style:italic;padding:40px">No pricing tables found</div></div>';
  el.innerHTML = h;
})();

// ── Render Glossary ─────────────────────────────────────────────────────────
(function renderGlossary() {
  const el = document.getElementById("glossary-content");
  let h = '<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">';
  h += '<div><strong style="font-size:18px;font-weight:900;letter-spacing:-0.5px">Contract Glossary</strong><div style="font-size:12px;color:#94a3b8">' + DATA.definitions.length + ' definitions</div></div>';
  h += '<input type="text" class="search-box" placeholder="Search definitions..." id="glossary-search" style="margin-left:auto">';
  h += '</div>';
  h += '<div id="glossary-list"></div>';
  el.innerHTML = h;

  function renderDefs(q) {
    const list = document.getElementById("glossary-list");
    const filtered = q
      ? DATA.definitions.filter(d => d.term.toLowerCase().includes(q) || d.definition.toLowerCase().includes(q))
      : DATA.definitions;
    let html = "";
    for (const d of filtered) {
      html += '<div class="def-card"><div class="def-term">' + esc(d.term) + '</div>';
      html += '<div class="def-text">' + esc(d.definition) + '</div>';
      html += '<div class="def-meta">' + esc(d.contract_id) + ' ' + esc(d.section || "") + '</div></div>';
    }
    if (!filtered.length) html = '<div style="text-align:center;color:#94a3b8;font-style:italic;padding:40px">No matching definitions</div>';
    list.innerHTML = html;
  }

  renderDefs("");
  document.getElementById("glossary-search").addEventListener("input", function(e) {
    renderDefs(e.target.value.toLowerCase());
  });
})();

// ── Render Review Notes ─────────────────────────────────────────────────────
(function renderNotes() {
  const el = document.getElementById("notes-content");
  let h = '<div class="stat-grid">';
  h += '<div class="stat-box"><div class="label">Total Notes</div><div class="value">' + DATA.reviewNotes.length + '</div></div>';
  h += '<div class="stat-box"><div class="label">Pending</div><div class="value" style="color:#dc2626">' + DATA.reviewNotes.filter(n => !n.is_reviewed).length + '</div></div>';
  h += '<div class="stat-box"><div class="label">Resolved</div><div class="value" style="color:#15803d">' + DATA.reviewNotes.filter(n => n.is_reviewed && n.narrative).length + '</div></div>';
  h += '</div>';

  for (const n of DATA.reviewNotes) {
    const isResolved = n.is_reviewed && !!n.narrative;
    const borderColor = n.is_reviewed ? (isResolved ? "#22c55e" : "#f97316") : "#ef4444";
    h += '<div class="card" style="margin-bottom:12px;border:2px solid ' + borderColor + '">';
    h += '<div class="card-body">';
    h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">';
    h += '<span class="badge badge-blue">' + esc(n.type) + '</span>';
    h += '<span class="badge ' + sevClass(n.severity) + '">' + esc(n.severity) + '</span>';
    const statusLabel = n.is_reviewed ? (isResolved ? "RESOLVED" : "REVIEWED") : "PENDING";
    const statusCls = n.is_reviewed ? (isResolved ? "badge-green" : "badge-orange") : "badge-red";
    h += '<span class="badge ' + statusCls + '">' + statusLabel + '</span>';
    if (n.contract_id) h += '<span style="font-size:11px;color:#2563eb;font-weight:700">Contract ' + esc(n.contract_id) + '</span>';
    h += '</div>';
    h += '<div style="font-weight:900;font-size:15px;color:#1e293b">' + esc(n.issue) + '</div>';
    if (n.narrative) {
      h += '<div style="margin-top:10px"><div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;margin-bottom:4px">Resolution</div>';
      h += '<div class="snippet">' + esc(n.narrative) + '</div></div>';
    }
    h += '</div></div>';
  }

  if (!DATA.reviewNotes.length) h += '<div class="card"><div class="card-body" style="text-align:center;color:#94a3b8;font-style:italic;padding:40px">No review notes</div></div>';
  el.innerHTML = h;
})();

// ── Footer date ─────────────────────────────────────────────────────────────
document.getElementById("export-date").textContent = new Date(DATA.exportedAt).toLocaleString();
</script>
</body>
</html>`;

// ── Write file ──────────────────────────────────────────────────────────────

const outDir = path.join(process.cwd(), "exports");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outPath = path.join(outDir, `contract-review-${timestamp}.html`);
fs.writeFileSync(outPath, html, "utf-8");

const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`\n✅ Export complete!`);
console.log(`   File: ${outPath}`);
console.log(`   Size: ${sizeKB} KB`);
console.log(`   Open in browser: file://${outPath}\n`);
