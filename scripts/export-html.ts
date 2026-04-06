/**
 * export-html.ts
 * Generates a self-contained HTML report from the SQLite database.
 * The output is a single .html file with all data, CSS, and JS embedded inline.
 * Open it in any browser — no server required.
 *
 * Usage: npx tsx scripts/export-html.ts
 * Import: import { generateHtmlReport } from "./export-html";
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/**
 * Generate a self-contained HTML report from the database.
 * Returns the HTML string and the output file path.
 */
export function generateHtmlReport(dbPath?: string, projectId?: number): { html: string; outPath: string; projectName?: string } {
  const resolvedDbPath = dbPath ?? path.join(process.cwd(), "data", "contracts.db");
  const db = new Database(resolvedDbPath, { readonly: true });
  db.pragma("journal_mode = WAL");

  // Project filter helpers
  const pf = projectId ? " WHERE project_id = ?" : "";
  const cf = projectId ? " WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)" : "";
  const rf = projectId ? " WHERE source_id IN (SELECT id FROM contracts WHERE project_id = ?)" : "";
  const pp = projectId ? [projectId] : [];

  const contracts = db.prepare(`
    SELECT id, name, type, status, effective_date, expiry_date,
           parent_id, licensed_technology, territory, initial_fee,
           analysis_confidence, needs_review
    FROM contracts${pf} ORDER BY id
  `).all(...pp);

  const clauses = db.prepare(`SELECT * FROM clauses${cf} ORDER BY contract_id, type, section`).all(...pp);
  const definitions = db.prepare(`SELECT * FROM definitions${cf} ORDER BY term`).all(...pp);
  const relationships = db.prepare(`SELECT * FROM relationships${rf} ORDER BY source_id`).all(...pp);
  const pricingTables = db.prepare(`SELECT * FROM pricing_tables${cf} ORDER BY contract_id`).all(...pp);
  const patents = db.prepare(`SELECT * FROM patents${cf} ORDER BY contract_id, country`).all(...pp);
  const products = db.prepare(`SELECT * FROM licensed_products${cf} ORDER BY contract_id`).all(...pp);
  const reviewNotes = db.prepare(`SELECT * FROM review_notes${cf} ORDER BY severity DESC, created_at DESC`).all(...pp);
  const technologies = projectId
    ? db.prepare(`SELECT DISTINCT t.* FROM technologies t JOIN tech_contract_map tcm ON tcm.tech_id = t.id JOIN contracts c ON c.id = tcm.contract_id WHERE c.project_id = ? ORDER BY t.name`).all(projectId)
    : db.prepare(`SELECT * FROM technologies ORDER BY name`).all();

  // Fetch project info
  let projectRow: Record<string, unknown> | undefined;
  try {
    if (projectId) {
      projectRow = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as Record<string, unknown> | undefined;
    } else {
      projectRow = db.prepare(`SELECT * FROM projects ORDER BY id DESC LIMIT 1`).get() as Record<string, unknown> | undefined;
    }
  } catch { /* projects table may not exist */ }

  db.close();

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
    project: projectRow || null,
    exportedAt: new Date().toISOString(),
  });

  // ── Coverage banner data ──────────────────────────────────────────────────
  const totalContracts = contracts.length;
  const analyzedContracts = (contracts as Record<string, unknown>[]).filter((c) => c.analysis_confidence !== null).length;

  // Date formatter helper
  const formatDate = (d: string | null | undefined): string => {
    if (!d) return "";
    const date = new Date(d);
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    return `${date.getDate().toString().padStart(2, "0")}-${months[date.getMonth()]}-${date.getFullYear()}`;
  };

  // ── Generate HTML ─────────────────────────────────────────────────────────

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Contract Review Assistant — Export</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.5; }
  .container { max-width: 1280px; margin: 0 auto; padding: 24px; }

  /* Header — matches React page.tsx */
  header { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 16px 24px; position: sticky; top: 0; z-index: 50; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  header .inner { max-width: 1280px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  header h1 { font-size: 20px; font-weight: 900; color: #1e293b; letter-spacing: -0.05em; display: flex; align-items: center; gap: 12px; }
  header h1 .icon-box { width: 40px; height: 40px; background: #2563eb; border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(37,99,235,.3); }
  .header-right { display: flex; align-items: center; gap: 12px; }
  .coverage-pill { font-size: 12px; font-weight: 700; color: #64748b; background: #f1f5f9; padding: 6px 14px; border-radius: 8px; border: 1px solid #e2e8f0; white-space: nowrap; }
  .tabs { display: flex; background: #f1f5f9; padding: 4px; border-radius: 8px; gap: 2px; border: 1px solid #e2e8f0; box-shadow: inset 0 2px 4px rgba(0,0,0,.06); overflow-x: auto; }
  .tab-btn { padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 700; border: none; cursor: pointer; background: transparent; color: #475569; transition: all .15s; white-space: nowrap; display: flex; align-items: center; gap: 8px; }
  .tab-btn.active { background: #fff; color: #2563eb; box-shadow: 0 1px 2px rgba(0,0,0,.08); font-weight: 900; }
  .tab-btn:hover:not(.active) { color: #1e293b; }
  .tab-btn svg { flex-shrink: 0; }

  /* Animation */
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .animate-in { animation: fadeIn .5s ease-out; }

  /* Cards — matches rounded-2xl (16px) and rounded-3xl (24px) */
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .card-3xl { background: #fff; border: 1px solid #e2e8f0; border-radius: 24px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .card-header { padding: 20px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 900; font-size: 14px; color: #334155; display: flex; align-items: center; gap: 8px; }
  .card-body { padding: 24px; }
  .card + .card, .card-3xl + .card-3xl, .card + .card-3xl, .card-3xl + .card { margin-top: 16px; }

  /* Tables — matches React th/td */
  table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
  th { background: #f8fafc; padding: 12px 24px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 900; border-bottom: 1px solid #e2e8f0; }
  td { padding: 12px 24px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:hover { background: #f8fafc; }

  /* Badges — matches React badge styles */
  .badge { display: inline-block; font-size: 9px; font-weight: 900; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
  .badge-green { background: #dcfce7; color: #15803d; }
  .badge-yellow { background: #fef9c3; color: #a16207; }
  .badge-red { background: #fee2e2; color: #dc2626; }
  .badge-blue { background: #dbeafe; color: #2563eb; }
  .badge-orange { background: #ffedd5; color: #c2410c; }
  .badge-slate { background: #f1f5f9; color: #64748b; }
  .badge-pill { border-radius: 9999px; padding: 2px 10px; }

  /* Severity — matches React severityColor */
  .sev-critical { background: #dc2626; color: #fff; }
  .sev-high { background: #ef4444; color: #fff; }
  .sev-medium { background: #f97316; color: #fff; }
  .sev-low { background: #eab308; color: #fff; }

  /* Status badges for review notes */
  .status-pending { background: #ef4444; color: #fff; }
  .status-reviewed { background: #f97316; color: #fff; }
  .status-resolved { background: #22c55e; color: #fff; }

  /* Tab content */
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* Stat boxes — blue tinted like React */
  .stat-blue { display: flex; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 16px; padding: 16px; gap: 24px; flex-shrink: 0; }
  .stat-blue-item { text-align: center; }
  .stat-blue-label { font-size: 10px; font-weight: 700; color: #60a5fa; text-transform: uppercase; letter-spacing: -0.02em; }
  .stat-blue-value { font-size: 14px; font-weight: 700; color: #1e3a5f; font-family: ui-monospace, monospace; }
  .stat-blue-divider { width: 1px; background: #93c5fd; height: 32px; align-self: center; }

  /* Snippet */
  .snippet { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; font-size: 13px; color: #475569; font-style: italic; font-weight: 500; margin-top: 6px; line-height: 1.6; max-height: 120px; overflow-y: auto; box-shadow: inset 0 2px 4px rgba(0,0,0,.06); }

  /* Glossary — matches React GlossaryView */
  .def-card { background: #fff; border: 2px solid transparent; border-radius: 16px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,.05); transition: border-color .2s; }
  .def-card:hover { border-color: #93c5fd; }
  .def-term { font-size: 18px; font-weight: 900; color: #1e293b; letter-spacing: -0.025em; transition: color .2s; }
  .def-card:hover .def-term { color: #2563eb; }
  .def-text { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 16px; font-size: 14px; color: #475569; font-style: italic; font-weight: 500; margin-top: 8px; line-height: 1.6; box-shadow: inset 0 2px 4px rgba(0,0,0,.06); }
  .def-meta { text-align: right; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 16px; }

  /* Search — matches React shadow-inner style */
  .search-wrap { position: relative; flex: 1; max-width: 500px; width: 100%; background: #f8fafc; border-radius: 12px; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,.06); border: 1px solid #e2e8f0; }
  .search-wrap svg { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }
  .search-wrap input { width: 100%; padding: 12px 16px 12px 48px; border: none; font-size: 14px; outline: none; background: transparent; font-weight: 700; letter-spacing: -0.015em; }
  .search-wrap input:focus { box-shadow: 0 0 0 2px #3b82f6 inset; }

  /* Listing search — smaller version */
  .search-wrap-sm { position: relative; flex: 1; background: #f8fafc; border-radius: 8px; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,.06); border: 1px solid #e2e8f0; }
  .search-wrap-sm svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }
  .search-wrap-sm input { width: 100%; padding: 8px 16px 8px 40px; border: none; font-size: 14px; outline: none; background: transparent; }

  /* Confidence bar */
  .conf-bar { width: 60px; height: 6px; background: #e2e8f0; border-radius: 3px; display: inline-block; vertical-align: middle; margin-right: 6px; }
  .conf-fill { height: 100%; border-radius: 3px; }
  .conf-badge { font-size: 9px; font-weight: 900; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
  .conf-green { background: #dcfce7; color: #15803d; }
  .conf-yellow { background: #fef9c3; color: #a16207; }
  .conf-red { background: #fee2e2; color: #dc2626; }

  /* Pricing tiers */
  .tier-table { width: 100%; font-size: 12px; margin-top: 8px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .tier-table th { font-size: 10px; padding: 8px 12px; }
  .tier-table td { padding: 8px 12px; font-family: ui-monospace, monospace; }

  /* Grid layouts */
  .grid-1-2 { display: grid; grid-template-columns: 1fr 2fr; gap: 32px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  .space-y-6 > * + * { margin-top: 24px; }
  .space-y-4 > * + * { margin-top: 16px; }
  .space-y-3 > * + * { margin-top: 12px; }

  /* Accordion */
  .accordion-header { padding: 24px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background .15s; }
  .accordion-header:hover { background: #f8fafc; }
  .accordion-body { border-top: 1px solid #f1f5f9; background: rgba(248,250,252,.5); padding: 32px; }
  .accordion-chevron { transition: transform .2s; color: #cbd5e1; }
  .accordion-chevron.open { transform: rotate(180deg); color: #2563eb; }

  /* View mode toggle — matches React ContractListing */
  .view-toggle { display: flex; background: #f1f5f9; padding: 4px; border-radius: 8px; box-shadow: inset 0 2px 4px rgba(0,0,0,.06); }
  .view-btn { padding: 6px 16px; border-radius: 6px; font-size: 14px; font-weight: 700; border: none; cursor: pointer; background: transparent; color: #64748b; transition: all .15s; display: flex; align-items: center; gap: 8px; }
  .view-btn.active { background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.08); color: #2563eb; }

  /* Icon box — matches React blue icon boxes */
  .icon-box-blue { padding: 12px; background: #eff6ff; color: #2563eb; border-radius: 16px; box-shadow: inset 0 2px 4px rgba(0,0,0,.06); display: flex; align-items: center; justify-content: center; }

  /* Review Notes card borders */
  .note-pending { border: 2px solid #ef4444; background: rgba(254,242,242,.1); }
  .note-reviewed { border: 2px solid #f97316; background: rgba(255,247,237,.1); }
  .note-resolved { border: 2px solid #22c55e; background: rgba(240,253,244,.1); }

  /* Overview scope cards */
  .scope-card { display: flex; align-items: center; justify-content: space-between; padding: 12px; border-radius: 12px; border: 1px solid #bbf7d0; background: #f0fdf4; }
  .scope-card .name { font-size: 12px; font-weight: 700; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Review summary dots */
  .summary-row { display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid; border-radius: 12px; }
  .summary-dot { width: 10px; height: 10px; border-radius: 9999px; }

  /* Tech timeline style */
  .timeline-line { position: absolute; left: 21px; top: 16px; bottom: 16px; width: 2px; background: #e2e8f0; }
  .timeline-dot { width: 14px; height: 14px; border-radius: 9999px; border: 2px solid #cbd5e1; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.05); flex-shrink: 0; }
  .timeline-item { display: flex; align-items: center; gap: 16px; position: relative; z-index: 1; }
  .timeline-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 16px; display: flex; align-items: center; gap: 24px; box-shadow: 0 1px 2px rgba(0,0,0,.05); transition: box-shadow .2s; }
  .timeline-card:hover { box-shadow: 0 4px 6px -1px rgba(0,0,0,.1); }

  /* Pill badge for pricing */
  .pill-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; border: 1px solid; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .pill-used { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
  .pill-unused { background: #f8fafc; color: #94a3b8; border-color: #f1f5f9; }

  /* Patent/Product grid cards */
  .mini-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; font-size: 12px; }

  /* Filter toolbar for notes */
  .filter-toolbar { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; box-shadow: inset 0 2px 4px rgba(0,0,0,.06); }

  /* Footer */
  footer { text-align: center; padding: 32px 24px; font-size: 11px; color: #94a3b8; }

  /* Responsive */
  @media (max-width: 768px) {
    .grid-1-2 { grid-template-columns: 1fr; }
    .grid-2 { grid-template-columns: 1fr; }
    header .inner { flex-direction: column; align-items: flex-start; }
    .header-right { flex-direction: column; width: 100%; }
  }

  /* Empty state notice */
  .empty-notice { text-align: center; color: #94a3b8; font-style: italic; padding: 48px 20px; }

  /* Print */
  @media print {
    header { position: static; box-shadow: none; }
    .tabs { display: none; }
    .tab-content { display: block !important; }
    .tab-content + .tab-content { page-break-before: always; }
    .tab-content::before { content: attr(data-title); display: block; font-size: 20px; font-weight: 900; margin: 24px 0 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
    .card, .card-3xl { page-break-inside: avoid; }
    tr { page-break-inside: avoid; }
    footer::before { content: "Contract Review Assistant — Exported ${new Date().toISOString().slice(0, 10)}"; display: block; font-size: 10px; color: #94a3b8; text-align: center; margin-bottom: 4px; }
  }
</style>
</head>
<body>

<header>
  <!-- Top bar: logo + project info + stats -->
  <div class="inner" style="padding-bottom: 8px;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <span class="icon-box">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><circle cx="11.5" cy="14.5" r="2.5"/><path d="M13.3 16.3 15 18"/></svg>
      </span>
      <div>
        <h1 style="margin: 0;">Contract Review Assistant</h1>
        ${projectRow ? `<div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
          <span style="font-weight: 700; color: #475569;">${projectRow.name || ""}</span>
          <span style="margin-left: 4px;">(${projectRow.licensor || ""} / ${projectRow.licensee || ""})</span>
        </div>` : ""}
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 16px;">
      ${projectRow?.notification_date ? `<div class="stat-blue-item"><div class="stat-blue-label">Notification</div><div style="font-size: 12px; font-weight: 700; color: #1e3a5f; font-family: monospace;">${formatDate(projectRow.notification_date as string)}</div></div>` : ""}
      ${projectRow?.audit_scope_start ? `<div class="stat-blue-item"><div class="stat-blue-label">Audit Period</div><div style="font-size: 12px; font-weight: 700; color: #1e3a5f; font-family: monospace;">${formatDate(projectRow.audit_scope_start as string)} &mdash; ${formatDate(projectRow.audit_scope_end as string)}</div></div>` : ""}
      <div class="coverage-pill">
        ${analyzedContracts}/${totalContracts} analyzed &middot;
        ${reviewNotes.length} notes
      </div>
    </div>
  </div>
  <!-- Tab navigation -->
  <div class="inner" style="padding-top: 0; padding-bottom: 8px;">
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

// ── Lucide SVG Icons (inline) ───────────────────────────────────────────────
const ICONS = {
  briefcase: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>',
  bell: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  pencil: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>',
  scale: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>',
  link: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  checkCircle: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
  search: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  list: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>',
  gitGraph: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="3"/><path d="M5 9v6"/><circle cx="5" cy="18" r="3"/><path d="M12 3v18"/><circle cx="19" cy="6" r="3"/><path d="M16 15.7A9 9 0 0 0 19 9"/></svg>',
  network: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>',
  chevronDown: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  externalLink: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  layers: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>',
  box: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  history: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  shield: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>',
  package: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  banknote: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
  clock: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  activity: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>',
  book: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  alertTriangle: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  messageSquare: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  fileText: '<svg width="SIZE" height="SIZE" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
};

function icon(name, size) {
  const s = size || 16;
  return (ICONS[name] || "").replace(/SIZE/g, s);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  const m = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return dt.getDate().toString().padStart(2,"0") + "-" + m[dt.getMonth()] + "-" + dt.getFullYear();
}

function confBadge(v) {
  if (v == null) return '<span class="badge badge-red">Not Analyzed</span>';
  const pct = (v * 100).toFixed(0);
  if (v < 0.5) return '<span class="badge badge-yellow">Low Confidence ' + pct + '%</span>';
  const cls = v >= 0.8 ? "badge-green" : "badge-yellow";
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

// ── Render Overview — matches AuditOverview.tsx ─────────────────────────────
(function renderOverview() {
  const el = document.getElementById("overview-content");
  if (!DATA.contracts.length) { el.innerHTML = '<div class="empty-notice">No contracts data extracted.</div>'; return; }
  const auditClauses = DATA.clauses.filter(c => c.type === "audit_right");
  const retentionClauses = DATA.clauses.filter(c => c.type === "data_retention");
  const interestClauses = DATA.clauses.filter(c => c.type === "interest");
  const pending = DATA.reviewNotes.filter(n => !n.is_reviewed).length;
  const reviewed = DATA.reviewNotes.filter(n => n.is_reviewed && !n.narrative).length;
  const resolved = DATA.reviewNotes.filter(n => n.is_reviewed && !!n.narrative).length;

  const projName = (DATA.project && DATA.project.name) || "Orion Audio License Compliance Audit";
  const projLicensor = (DATA.project && DATA.project.licensor) || "Orion Audio Licensing Corporation";
  const projLicensee = (DATA.project && DATA.project.licensee) || "Sakura Electronics Co., Ltd.";

  let h = '<div class="space-y-6 animate-in" style="text-align:left">';

  // Project Header — matches React AuditOverview header
  h += '<div class="card-3xl" style="padding:32px;display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap">';
  h += '<div style="flex:1;min-width:0">';
  h += '<div style="display:flex;align-items:center;gap:8px;font-size:10px;font-weight:900;color:#2563eb;text-transform:uppercase;letter-spacing:0.1em">' + icon("briefcase", 12) + ' Project Header</div>';
  h += '<h2 style="font-size:24px;font-weight:900;color:#1e293b;margin-top:4px">' + esc(projName) + '</h2>';
  h += '<div style="display:flex;gap:16px;font-size:14px;color:#64748b;font-style:italic;font-weight:500;margin-top:4px">';
  h += '<span>Licensor: ' + esc(projLicensor) + '</span>';
  h += '<span style="color:#cbd5e1">|</span>';
  h += '<span>Licensee: ' + esc(projLicensee) + '</span>';
  h += '</div></div>';
  h += '<div class="stat-blue">';
  h += '<div class="stat-blue-item"><div class="stat-blue-label">Contracts</div><div class="stat-blue-value">' + DATA.contracts.length + '</div></div>';
  h += '<div class="stat-blue-divider"></div>';
  h += '<div class="stat-blue-item"><div class="stat-blue-label">Review Notes</div><div class="stat-blue-value">' + DATA.reviewNotes.length + '</div></div>';
  h += '</div></div>';

  // 1/3 + 2/3 Grid — matches React lg:grid-cols-3
  h += '<div class="grid-1-2">';

  // ── Left column (1/3) ──
  h += '<div class="space-y-6">';

  // Contracts in Scope
  h += '<div class="card" style="border-radius:16px"><div style="padding:24px"><h3 style="font-weight:700;color:#334155;display:flex;align-items:center;gap:8px;border-bottom:1px solid #e2e8f0;padding-bottom:16px;margin-bottom:16px"><span style="color:#f59e0b">' + icon("bell", 18) + '</span> Contracts in Scope</h3>';
  h += '<div class="space-y-3">';
  for (const c of DATA.contracts) {
    h += '<div class="scope-card"><div style="display:flex;align-items:center;gap:12px;overflow:hidden;text-align:left"><span style="color:#22c55e;flex-shrink:0">' + icon("checkCircle", 14) + '</span><div class="name">' + esc(c.id) + ': ' + esc(c.name) + '</div></div>';
    h += '<span style="font-size:8px;padding:2px 8px;border-radius:4px;font-weight:900;text-transform:uppercase;background:#22c55e;color:#fff;white-space:nowrap">' + esc(c.type) + '</span></div>';
  }
  h += '</div></div></div>';

  // Review Notes Summary — by category
  h += '<div class="card" style="border-radius:16px"><div style="padding:24px"><h3 style="font-weight:700;color:#334155;display:flex;align-items:center;gap:8px;border-bottom:1px solid #e2e8f0;padding-bottom:16px;margin-bottom:16px"><span style="color:#3b82f6">' + icon("pencil", 18) + '</span> Review Notes Summary</h3>';
  h += '<div class="space-y-3">';
  var catCounts = { audit_finding: 0, document_gap: 0, system: 0 };
  for (var rn of DATA.reviewNotes) { var cat = rn.category || "uncategorized"; if (catCounts[cat] !== undefined) catCounts[cat]++; }
  var catItems = [
    { label: "Audit Findings", count: catCounts.audit_finding, bgOuter: "background:rgba(254,242,242,.5);border-color:#fecaca", dot: "#ef4444", badge: "#ef4444" },
    { label: "Document Gaps", count: catCounts.document_gap, bgOuter: "background:rgba(255,251,235,.5);border-color:#fde68a", dot: "#f59e0b", badge: "#f59e0b" },
    { label: "System Notes", count: catCounts.system, bgOuter: "background:rgba(248,250,252,.5);border-color:#e2e8f0", dot: "#94a3b8", badge: "#94a3b8" },
  ];
  for (var si of catItems) {
    h += '<div class="summary-row" style="' + si.bgOuter + '">';
    h += '<div style="display:flex;align-items:center;gap:12px;text-align:left"><div class="summary-dot" style="background:' + si.dot + '"></div><span style="font-size:12px;font-weight:700;color:#334155">' + si.label + '</span></div>';
    h += '<span style="background:' + si.badge + ';color:#fff;font-size:10px;font-weight:900;padding:2px 10px;border-radius:9999px">' + si.count + '</span>';
    h += '</div>';
  }
  h += '</div>';
  h += '<div style="padding-top:8px;border-top:1px solid #e2e8f0;margin-top:12px;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between">';
  h += '<span>Pending: ' + pending + '</span><span>Reviewed: ' + reviewed + '</span><span>Resolved: ' + resolved + '</span>';
  h += '</div>';
  h += '</div></div>';

  h += '</div>'; // end left column

  // ── Right column (2/3) ──
  h += '<div class="space-y-6" style="text-align:left">';

  // Audit Right Clauses
  h += '<div class="card" style="border-radius:16px;overflow:hidden">';
  h += '<div style="padding:20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">';
  h += '<h3 style="font-weight:700;color:#334155;display:flex;align-items:center;gap:8px"><span style="color:#3b82f6">' + icon("scale", 18) + '</span> Audit Right Clauses</h3></div>';
  h += '<table><thead><tr><th>Contract</th><th>Section</th><th>Key Terms</th></tr></thead><tbody>';
  if (auditClauses.length) {
    for (const c of auditClauses) {
      const kt = parseJSON(c.key_terms_json) || {};
      const terms = [];
      if (kt.notice_period_days) terms.push(kt.notice_period_days + "d notice");
      if (kt.frequency) terms.push(kt.frequency);
      if (kt.retention_years) terms.push(kt.retention_years + "yr retention");
      h += '<tr><td style="font-weight:700">' + esc(c.contract_id) + '</td><td style="font-family:ui-monospace,monospace;color:#64748b">' + esc(c.section) + '</td><td style="color:#64748b">' + esc(terms.join(", ")) + '</td></tr>';
    }
  } else {
    h += '<tr><td colspan="3" class="empty-notice">Run analysis to populate clauses</td></tr>';
  }
  h += '</tbody></table></div>';

  // Data Retention + Interest — 2-col grid
  h += '<div class="grid-2">';

  // Data Retention
  h += '<div class="card" style="border-radius:16px;overflow:hidden">';
  h += '<div style="padding:16px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><h3 style="font-size:14px;font-weight:700;color:#334155">Data Retention</h3></div>';
  h += '<table style="font-size:12px"><tbody>';
  for (const c of retentionClauses) {
    const kt = parseJSON(c.key_terms_json) || {};
    h += '<tr><td style="padding:12px 16px;font-weight:700;color:#334155">' + esc(c.contract_id) + '</td><td style="padding:12px 16px;color:#64748b">' + (kt.retention_years ? kt.retention_years + " Years" : esc(c.section)) + '</td>';
    h += '<td style="padding:12px 16px;text-align:right"><span style="color:#94a3b8;cursor:pointer">' + icon("link", 14) + '</span></td></tr>';
  }
  if (!retentionClauses.length) h += '<tr><td colspan="3" style="padding:24px;text-align:center;color:#94a3b8;font-style:italic;font-size:11px">Pending analysis</td></tr>';
  h += '</tbody></table></div>';

  // Interest Clause
  h += '<div class="card" style="border-radius:16px;overflow:hidden">';
  h += '<div style="padding:16px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><h3 style="font-size:14px;font-weight:700;color:#334155">Interest Clause</h3></div>';
  h += '<table style="font-size:12px"><tbody>';
  for (const c of interestClauses) {
    const kt = parseJSON(c.key_terms_json) || {};
    h += '<tr><td style="padding:12px 16px;font-weight:700;color:#334155">' + esc(c.contract_id) + '</td><td style="padding:12px 16px;color:#64748b">' + esc(kt.rate || kt.interest_rate || c.section) + '</td>';
    h += '<td style="padding:12px 16px;text-align:right"><span style="color:#94a3b8;cursor:pointer">' + icon("link", 14) + '</span></td></tr>';
  }
  if (!interestClauses.length) h += '<tr><td colspan="3" style="padding:24px;text-align:center;color:#94a3b8;font-style:italic;font-size:11px">Pending analysis</td></tr>';
  h += '</tbody></table></div>';

  h += '</div>'; // end grid-2

  h += '</div>'; // end right column
  h += '</div>'; // end grid-1-2
  h += '</div>'; // end space-y-6

  el.innerHTML = h;
})();

// ── Render Contract Listing — matches ContractListing.tsx ───────────────────
(function renderListing() {
  const el = document.getElementById("listing-content");
  if (!DATA.contracts.length) { el.innerHTML = '<div class="empty-notice">No contracts data extracted.</div>'; return; }
  const masters = DATA.contracts.filter(c => !c.parent_id);
  const getChildren = pid => DATA.contracts.filter(c => c.parent_id === pid);

  let h = '<div class="space-y-6 animate-in" style="text-align:left">';

  // Toolbar — matches React toolbar
  h += '<div class="card-3xl" style="padding:16px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">';
  h += '<div class="view-toggle" id="view-toggle">';
  h += '<button class="view-btn active" data-view="list">' + icon("list", 14) + ' List</button>';
  h += '<button class="view-btn" data-view="timeline">' + icon("gitGraph", 14) + ' Timeline</button>';
  h += '<button class="view-btn" data-view="relationship">' + icon("network", 14) + ' Relationships</button>';
  h += '</div>';
  h += '<div style="display:flex;flex:1;align-items:center;gap:12px;max-width:600px" id="listing-search-area">';
  h += '<div class="search-wrap-sm" style="flex:1"><span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8">' + icon("search", 16) + '</span><input type="text" placeholder="Search contracts..." id="listing-search"></div>';
  h += '</div>';
  h += '</div>';

  // ── List View ──
  h += '<div id="view-list">';
  h += '<div class="card" style="border-radius:16px;overflow:hidden">';
  h += '<table><thead><tr class=""><th>Contract</th><th>Type</th><th>Status</th><th>Effective</th><th>Expiry</th><th style="text-align:right">Confidence</th></tr></thead>';
  h += '<tbody id="listing-tbody" style="font-size:14px;font-weight:500">';

  function renderListRows(query) {
    const q = (query || "").toLowerCase();
    const filtered = DATA.contracts.filter(c => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    const fMasters = filtered.filter(c => !c.parent_id);
    const fGetChildren = pid => filtered.filter(c => c.parent_id === pid);
    let rows = "";
    for (const m of fMasters) {
      const children = fGetChildren(m.id);
      const hasChildren = children.length > 0;
      rows += '<tr class="" style="transition:background .15s" onmouseover="this.style.background=\\'#f8fafc\\'" onmouseout="this.style.background=\\'\\'"><td style="padding:16px 24px">';
      rows += '<div style="display:flex;align-items:center;gap:12px;text-align:left">';
      if (hasChildren) {
        rows += '<button onclick="this.parentElement.parentElement.parentElement.parentElement.classList.toggle(\\'expanded\\')" style="padding:4px;border-radius:4px;border:1px solid #f1f5f9;background:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.05);display:flex;align-items:center">';
        rows += '<span style="color:#94a3b8;transition:transform .2s;display:inline-block" class="row-chevron">' + icon("chevronDown", 14) + '</span></button>';
      }
      rows += '<div><div style="font-weight:700;font-size:14px;color:#1e293b">' + esc(m.id) + ': ' + esc(m.name) + '</div>';
      rows += '<div style="font-size:10px;color:#94a3b8;font-family:ui-monospace,monospace;letter-spacing:-0.02em;margin-top:2px;display:flex;align-items:center;gap:6px">';
      rows += '<span style="color:#94a3b8">' + icon("link", 10) + '</span> ' + esc(m.type);
      if (m.analysis_confidence != null) {
        const pct = (m.analysis_confidence * 100).toFixed(0);
        const cls = m.analysis_confidence >= 0.8 ? "conf-green" : m.analysis_confidence >= 0.5 ? "conf-yellow" : "conf-red";
        rows += '<span class="conf-badge ' + cls + '" style="margin-left:8px">' + pct + '%</span>';
      }
      rows += '</div></div></div></td>';
      rows += '<td style="padding:16px 24px"><span style="padding:2px 8px;border-radius:4px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;box-shadow:0 1px 2px rgba(0,0,0,.05);background:#f1f5f9;color:#64748b">' + esc(m.type) + '</span></td>';
      rows += '<td style="padding:16px 24px;font-size:12px;font-family:ui-monospace,monospace;color:#64748b">' + esc(m.status) + '</td>';
      rows += '<td style="padding:16px 24px;font-size:12px;font-family:ui-monospace,monospace;color:#64748b">' + fmtDate(m.effective_date) + '</td>';
      rows += '<td style="padding:16px 24px;font-size:12px;font-family:ui-monospace,monospace;color:#64748b">' + (fmtDate(m.expiry_date) || "Open Ended") + '</td>';
      rows += '<td style="padding:16px 24px;text-align:right">' + confBar(m.analysis_confidence) + '</td></tr>';

      // Children (always shown in export since no server for detail modal)
      for (const c of children) {
        rows += '<tr style="background:rgba(248,250,252,.4);transition:background .15s" onmouseover="this.style.background=\\'#f8fafc\\'" onmouseout="this.style.background=\\'rgba(248,250,252,.4)\\'"><td style="padding:16px 24px">';
        rows += '<div style="display:flex;align-items:center;gap:12px;text-align:left">';
        rows += '<div style="width:24px;border-bottom:1px solid #e2e8f0;margin-left:4px;margin-bottom:8px"></div>';
        rows += '<div><div style="font-weight:700;font-size:14px;color:#1e293b">' + esc(c.id) + ': ' + esc(c.name) + '</div>';
        rows += '<div style="font-size:10px;color:#94a3b8;font-family:ui-monospace,monospace;letter-spacing:-0.02em;margin-top:2px;display:flex;align-items:center;gap:6px">';
        rows += '<span style="color:#94a3b8">' + icon("link", 10) + '</span> ' + esc(c.type);
        if (c.analysis_confidence != null) {
          const pct2 = (c.analysis_confidence * 100).toFixed(0);
          const cls2 = c.analysis_confidence >= 0.8 ? "conf-green" : c.analysis_confidence >= 0.5 ? "conf-yellow" : "conf-red";
          rows += '<span class="conf-badge ' + cls2 + '" style="margin-left:8px">' + pct2 + '%</span>';
        }
        rows += '</div></div></div></td>';
        rows += '<td style="padding:16px 24px"><span style="padding:2px 8px;border-radius:4px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;box-shadow:0 1px 2px rgba(0,0,0,.05);background:#f1f5f9;color:#64748b">' + esc(c.type) + '</span></td>';
        rows += '<td style="padding:16px 24px;font-size:12px;font-family:ui-monospace,monospace;color:#64748b">' + esc(c.status) + '</td>';
        rows += '<td style="padding:16px 24px;font-size:12px;font-family:ui-monospace,monospace;color:#64748b">' + fmtDate(c.effective_date) + '</td>';
        rows += '<td style="padding:16px 24px;font-size:12px;font-family:ui-monospace,monospace;color:#64748b">' + (fmtDate(c.expiry_date) || "Open Ended") + '</td>';
        rows += '<td style="padding:16px 24px;text-align:right">' + confBar(c.analysis_confidence) + '</td></tr>';
      }
    }
    if (!fMasters.length) rows = '<tr><td colspan="6" class="empty-notice">No matching contracts</td></tr>';
    return rows;
  }

  h += renderListRows("");
  h += '</tbody></table></div></div>';

  // ── Timeline View ──
  h += '<div id="view-timeline" style="display:none">';
  h += '<div class="card" style="border-radius:16px;overflow:hidden"><div class="card-header">Contract Timeline</div>';
  h += renderTimelineSVG();
  h += '</div></div>';

  // ── Relationship View ──
  h += '<div id="view-relationship" style="display:none">';
  h += '<div class="card" style="border-radius:16px;overflow:hidden"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center">Contract Relationship Map';
  h += '<div style="display:flex;gap:12px;font-size:10px;font-weight:700;color:#94a3b8">';
  h += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:2px;background:#6366f1;border-radius:1px"></span>references T&C</span>';
  h += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:2px;background:#ef4444;border-radius:1px"></span>amends</span>';
  h += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:2px;background:#f59e0b;border-radius:1px"></span>pricing for</span>';
  h += '<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:2px;background:#8b5cf6;border-radius:1px"></span>related tech</span>';
  h += '</div></div>';
  h += renderRelationshipSVG();
  h += '</div>';

  // Relationships table
  if (DATA.relationships.length) {
    h += '<div class="card" style="margin-top:16px;border-radius:16px;overflow:hidden"><div class="card-header">Contract Relationships (' + DATA.relationships.length + ')</div>';
    h += '<table><thead><tr><th>Source</th><th>Target</th><th>Type</th><th>Evidence</th><th>Confidence</th></tr></thead><tbody>';
    for (const r of DATA.relationships) {
      h += '<tr><td style="font-weight:700">' + esc(r.source_id) + '</td><td style="font-weight:700">' + esc(r.target_id) + '</td>';
      h += '<td><span class="badge badge-blue">' + esc(r.type) + '</span></td>';
      h += '<td style="font-size:12px;max-width:300px">' + esc(r.evidence_text || "") + '</td>';
      h += '<td>' + confBadge(r.confidence) + '</td></tr>';
    }
    h += '</tbody></table></div>';
  }
  h += '</div>';

  h += '</div>'; // end space-y-6
  el.innerHTML = h;

  // ── View mode switching JS ──
  document.getElementById("view-toggle").addEventListener("click", function(e) {
    const btn = e.target.closest(".view-btn");
    if (!btn) return;
    this.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    document.getElementById("view-list").style.display = view === "list" ? "" : "none";
    document.getElementById("view-timeline").style.display = view === "timeline" ? "" : "none";
    document.getElementById("view-relationship").style.display = view === "relationship" ? "" : "none";
    document.getElementById("listing-search-area").style.display = view === "list" ? "" : "none";
  });

  // ── Search JS ──
  document.getElementById("listing-search").addEventListener("input", function(e) {
    document.getElementById("listing-tbody").innerHTML = renderListRows(e.target.value);
  });
})();

// ── SVG: Relationship Diagram ───────────────────────────────────────────────
function renderRelationshipSVG() {
  const typeColors = { master_tc: "#2563eb", technology_license: "#059669", side_letter: "#d97706" };
  const typeLabels = { master_tc: "Master T&C", technology_license: "Tech License", side_letter: "Side Letter" };
  const edgeColors = { references_tc: "#6366f1", amends: "#ef4444", pricing_for: "#f59e0b", related_technology: "#8b5cf6" };
  const edgeLabels = { references_tc: "references T&C", amends: "amends", pricing_for: "pricing for", related_technology: "related tech" };

  const svgW = 800, svgH = 440, nodeW = 220, nodeH = 70;
  const nodes = [];

  const master = DATA.contracts.find(c => c.type === "master_tc" || !c.parent_id);
  const techLicenses = DATA.contracts.filter(c => c.type === "technology_license");
  const sideLetter = DATA.contracts.find(c => c.type === "side_letter");

  if (master) nodes.push({ id: master.id, name: master.id + ": " + master.name, type: master.type, x: svgW/2-nodeW/2, y: 30, w: nodeW, h: nodeH });
  const spacing = 280, startX = svgW/2 - ((techLicenses.length-1)*spacing)/2 - nodeW/2;
  techLicenses.forEach((c, i) => nodes.push({ id: c.id, name: c.id + ": " + c.name, type: c.type, x: startX + i*spacing, y: 180, w: nodeW, h: nodeH }));
  if (sideLetter && !nodes.find(n => n.id === sideLetter.id)) nodes.push({ id: sideLetter.id, name: sideLetter.id + ": " + sideLetter.name, type: sideLetter.type, x: svgW/2-nodeW/2, y: 330, w: nodeW, h: nodeH });

  const edgeMap = new Map();
  for (const r of DATA.relationships) {
    const key = r.source_id + ">" + r.target_id;
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
  const tMasters = DATA.contracts.filter(c => !c.parent_id && c.type === "master_tc");
  const rows = [];
  let curY = headerH + 10;

  for (const m of tMasters) {
    rows.push({ c: m, y: curY, isChild: false });
    curY += rowH;
    const children = DATA.contracts.filter(c => c.parent_id === m.id);
    for (const ch of children) { rows.push({ c: ch, y: curY, isChild: true }); curY += rowH; }
    curY += 12;
  }
  const grouped = new Set(rows.map(r => r.c.id));
  for (const c of DATA.contracts) {
    if (!grouped.has(c.id)) { rows.push({ c, y: curY, isChild: false }); curY += rowH; }
  }

  const svgH = curY + 20;
  let svg = '<svg viewBox="0 0 '+svgW+' '+svgH+'" style="width:100%;min-height:'+Math.max(200, svgH*0.55)+'px">';

  for (const yr of years) {
    const x = getX(yr+"-01-01", svgW);
    if (x < 0 || x > svgW) continue;
    svg += '<line x1="'+x+'" y1="'+(headerH-5)+'" x2="'+x+'" y2="'+svgH+'" stroke="#f1f5f9" stroke-width="1"/>';
    svg += '<text x="'+(x+4)+'" y="'+(headerH-10)+'" font-size="11" font-weight="800" fill="#cbd5e1">'+yr+'</text>';
  }

  const todayX = getX(new Date().toISOString().slice(0,10), svgW);
  if (todayX > 0 && todayX < svgW) {
    svg += '<line x1="'+todayX+'" y1="'+headerH+'" x2="'+todayX+'" y2="'+svgH+'" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,3"/>';
    svg += '<rect x="'+(todayX-20)+'" y="'+(headerH-4)+'" width="40" height="14" rx="4" fill="#ef4444"/>';
    svg += '<text x="'+todayX+'" y="'+(headerH+7)+'" text-anchor="middle" font-size="8" font-weight="800" fill="#fff">TODAY</text>';
  }

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

// ── Render Technology — matches TechnologyView.tsx ──────────────────────────
(function renderTechnology() {
  const el = document.getElementById("technology-content");
  if (!DATA.contracts.length && !DATA.patents.length && !DATA.products.length) { el.innerHTML = '<div class="empty-notice">Run analysis to detect technologies</div>'; return; }
  const techMap = new Map();

  for (const c of DATA.contracts) {
    if (c.licensed_technology) {
      if (!techMap.has(c.licensed_technology)) techMap.set(c.licensed_technology, { name: c.licensed_technology, contracts: [], patents: [], products: [] });
      techMap.get(c.licensed_technology).contracts.push({ id: c.id, name: c.name, type: c.type, status: c.status, role: "licensed_under" });
    }
  }
  for (const p of DATA.pricingTables) {
    if (p.technology) {
      if (!techMap.has(p.technology)) techMap.set(p.technology, { name: p.technology, contracts: [], patents: [], products: [] });
      const t = techMap.get(p.technology);
      if (!t.contracts.find(x => x.id === p.contract_id)) {
        const cn = DATA.contracts.find(c => c.id === p.contract_id);
        t.contracts.push({ id: p.contract_id, name: cn ? cn.name : p.contract_id, type: cn ? cn.type : "", status: cn ? cn.status : "", role: "pricing_defined_in" });
      }
    }
  }
  // Add patents and products
  for (const p of DATA.patents) {
    if (p.technology && techMap.has(p.technology)) techMap.get(p.technology).patents.push(p);
  }
  for (const p of DATA.products) {
    if (p.technology && techMap.has(p.technology)) techMap.get(p.technology).products.push(p);
  }

  let h = '<div class="space-y-6 animate-in" style="text-align:left">';

  // Header card — matches React TechnologyView header
  h += '<div class="card-3xl" style="padding:24px;display:flex;align-items:center;gap:16px">';
  h += '<span style="color:#3b82f6">' + icon("layers", 24) + '</span>';
  h += '<div><h2 style="font-size:20px;font-weight:900;color:#1e293b;letter-spacing:-0.025em">Technology Inventory</h2>';
  h += '<p style="font-size:12px;color:#94a3b8">' + techMap.size + ' technologies detected</p></div>';
  h += '</div>';

  // Accordion cards — matches React accordion
  let techIdx = 0;
  for (const [, tech] of techMap) {
    const accId = "tech-acc-" + techIdx++;
    h += '<div class="card-3xl" id="' + accId + '">';

    // Header
    h += '<div class="accordion-header" onclick="var b=document.getElementById(\\''+accId+'\\');var bd=b.querySelector(\\'.accordion-body\\');var ch=b.querySelector(\\'.accordion-chevron\\');if(bd.style.display===\\'none\\'){bd.style.display=\\'\\';ch.classList.add(\\'open\\')}else{bd.style.display=\\'none\\';ch.classList.remove(\\'open\\')}">';
    h += '<div style="display:flex;align-items:center;gap:16px">';
    h += '<div class="icon-box-blue">' + icon("box", 24) + '</div>';
    h += '<div><h3 style="font-size:18px;font-weight:900;color:#1e293b">' + esc(tech.name) + '</h3>';
    h += '<p style="font-size:12px;color:#94a3b8;font-weight:500">' + tech.contracts.length + ' governing agreement' + (tech.contracts.length !== 1 ? "s" : "");
    if (tech.patents.length) h += ' &middot; ' + tech.patents.length + ' patent' + (tech.patents.length !== 1 ? "s" : "");
    if (tech.products.length) h += ' &middot; ' + tech.products.length + ' product' + (tech.products.length !== 1 ? "s" : "");
    h += '</p></div></div>';
    h += '<span class="accordion-chevron open">' + icon("chevronDown", 20) + '</span>';
    h += '</div>';

    // Body
    h += '<div class="accordion-body">';

    // Governing Contracts — timeline style
    h += '<h4 style="font-size:10px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;display:flex;align-items:center;gap:8px">' + icon("history", 14) + ' Governing Contracts</h4>';
    h += '<div style="display:flex;flex-direction:column;gap:16px;padding-left:16px;position:relative;margin-top:16px">';
    h += '<div style="position:absolute;left:21px;top:16px;bottom:16px;width:2px;background:#e2e8f0"></div>';
    for (const tc of tech.contracts) {
      h += '<div class="timeline-item">';
      h += '<div class="timeline-dot"></div>';
      h += '<div class="timeline-card">';
      h += '<div style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:#334155;font-family:ui-monospace,monospace;letter-spacing:-0.025em">' + icon("fileText", 14) + ' ' + esc(tc.id) + ': ' + esc(tc.name) + '</div>';
      h += '<span style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:700;border-left:1px solid #f1f5f9;padding-left:12px">' + esc(tc.role) + '</span>';
      h += '</div></div>';
    }
    h += '</div>';

    // Patents
    if (tech.patents.length) {
      h += '<h4 style="font-size:10px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;display:flex;align-items:center;gap:8px;margin-top:24px">' + icon("shield", 14) + ' Patents</h4>';
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:8px">';
      for (const p of tech.patents) {
        h += '<div class="mini-card"><span style="font-weight:700;color:#334155">' + esc(p.country) + '</span><span style="color:#94a3b8;margin-left:8px">' + esc(p.patent_number) + '</span>';
        if (p.is_application) h += '<span style="font-size:9px;color:#d97706;margin-left:4px">(App)</span>';
        h += '</div>';
      }
      h += '</div>';
    }

    // Products
    if (tech.products.length) {
      h += '<h4 style="font-size:10px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;display:flex;align-items:center;gap:8px;margin-top:24px">' + icon("package", 14) + ' Licensed Products</h4>';
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-top:8px">';
      for (const p of tech.products) {
        h += '<div class="mini-card"><span style="font-weight:700;color:#334155">' + esc(p.product_type) + '</span>';
        if (p.category) h += '<span style="color:#94a3b8;margin-left:8px">(' + esc(p.category) + ')</span>';
        h += '</div>';
      }
      h += '</div>';
    }

    h += '</div>'; // end accordion body
    h += '</div>'; // end card
  }

  if (!techMap.size) h += '<div class="card" style="border-radius:16px"><div class="card-body" class="empty-notice" style="text-align:center;color:#94a3b8;font-style:italic;padding:48px">Run analysis to detect technologies</div></div>';
  h += '</div>';
  el.innerHTML = h;
})();

// ── Render Pricing — matches PricingView.tsx ────────────────────────────────
(function renderPricing() {
  const el = document.getElementById("pricing-content");
  const byContract = new Map();
  for (const p of DATA.pricingTables) {
    if (!byContract.has(p.contract_id)) byContract.set(p.contract_id, []);
    byContract.get(p.contract_id).push(p);
  }

  let h = '<div class="space-y-6 animate-in" style="text-align:left">';

  // Header card — matches React PricingView header
  h += '<div class="card-3xl" style="padding:24px;display:flex;align-items:center;gap:16px">';
  h += '<div class="icon-box-blue">' + icon("banknote", 24) + '</div>';
  h += '<div><h2 style="font-size:20px;font-weight:900;color:#1e293b;letter-spacing:-0.05em">Pricing Tables</h2>';
  h += '<p style="font-size:12px;color:#94a3b8;font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:0.1em">' + DATA.pricingTables.length + ' tables across ' + byContract.size + ' contracts</p></div>';
  h += '</div>';

  // Accordion per contract
  let pIdx = 0;
  for (const [cid, tables] of byContract) {
    const cn = DATA.contracts.find(c => c.id === cid);
    const accId = "price-acc-" + pIdx++;
    h += '<div class="card" style="border-radius:16px" id="' + accId + '">';

    // Header
    h += '<button class="accordion-header" style="width:100%;text-align:left;border:none;background:none;font-family:inherit" onclick="var b=document.getElementById(\\''+accId+'\\');var bd=b.querySelector(\\'.accordion-body\\');var ch=b.querySelector(\\'.accordion-chevron\\');if(bd.style.display===\\'none\\'){bd.style.display=\\'\\';ch.classList.add(\\'open\\')}else{bd.style.display=\\'none\\';ch.classList.remove(\\'open\\')}">';
    h += '<div style="display:flex;align-items:center;gap:12px">';
    h += '<span style="color:#3b82f6">' + icon("box", 18) + '</span>';
    h += '<span style="font-weight:900;color:#334155;letter-spacing:-0.025em">' + esc(cid) + ': ' + esc(cn ? cn.name : "") + '</span>';
    h += '<span style="font-size:10px;background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:4px;font-weight:700">' + tables.length + ' table' + (tables.length !== 1 ? "s" : "") + '</span>';
    h += '</div>';
    h += '<span class="accordion-chevron open">' + icon("chevronDown", 20) + '</span>';
    h += '</button>';

    // Body
    h += '<div class="accordion-body" style="padding:16px"><div class="space-y-4">';

    for (const t of tables) {
      h += '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;box-shadow:0 1px 2px rgba(0,0,0,.05)">';

      // Title + Used badge
      h += '<div style="display:flex;align-items:center;justify-content:space-between">';
      h += '<div><div style="font-size:14px;font-weight:700;color:#334155">' + esc(t.name || t.technology) + '</div>';
      h += '<div style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-top:4px">' + esc(t.section || "") + (t.technology ? " | " + esc(t.technology) : "") + '</div></div>';
      if (t.is_used_in_reports) {
        h += '<span class="pill-badge pill-used">' + icon("activity", 10) + ' Used</span>';
      } else {
        h += '<span class="pill-badge pill-unused">' + icon("clock", 10) + ' Not Reported</span>';
      }
      h += '</div>';

      // Tiers
      const tiers = parseJSON(t.tiers_json);
      if (tiers && tiers.length) {
        h += '<table class="tier-table" style="margin-top:16px"><thead><tr><th style="text-align:left">From</th><th style="text-align:left">To</th><th style="text-align:right">Rate</th></tr></thead><tbody>';
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
        h += '<div style="margin-top:16px"><div style="font-size:10px;font-weight:900;text-transform:uppercase;color:#94a3b8;letter-spacing:0.1em">Discounts</div>';
        for (const d of discounts) {
          h += '<div style="font-size:12px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin-top:4px">';
          h += '<span style="font-weight:700">' + esc(d.type || d.description || "") + '</span>';
          if (d.amount) h += '<span style="color:#15803d;margin-left:8px">-$' + d.amount + '</span>';
          if (d.condition || d.description) h += '<span style="color:#94a3b8;margin-left:8px">| ' + esc(d.condition || d.description) + '</span>';
          h += '</div>';
        }
        h += '</div>';
      }

      h += '</div>';
    }

    h += '</div></div>'; // end accordion body
    h += '</div>'; // end card
  }

  if (!byContract.size) h += '<div class="card" style="border-radius:16px"><div class="card-body" style="text-align:center;color:#94a3b8;font-style:italic;padding:48px">Run analysis to populate pricing tables</div></div>';
  h += '</div>';
  el.innerHTML = h;
})();

// ── Render Glossary — matches GlossaryView.tsx ─────────────────────────────
(function renderGlossary() {
  const el = document.getElementById("glossary-content");
  if (!DATA.definitions.length) { el.innerHTML = '<div class="empty-notice">No definitions extracted.</div>'; return; }

  let h = '<div class="space-y-6 animate-in" style="text-align:left">';

  // Header — matches React GlossaryView header
  h += '<div class="card-3xl" style="padding:24px;display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap">';
  h += '<div style="display:flex;align-items:center;gap:12px">';
  h += '<span style="color:#3b82f6">' + icon("book", 24) + '</span>';
  h += '<div><h2 style="font-size:20px;font-weight:900;color:#1e293b;letter-spacing:-0.05em">Contract Glossary</h2>';
  h += '<p style="font-size:12px;color:#94a3b8" id="glossary-count">' + DATA.definitions.length + ' definitions found</p></div>';
  h += '</div>';
  h += '<div class="search-wrap"><span>' + icon("search", 20) + '</span><input type="text" placeholder="Search definitions..." id="glossary-search"></div>';
  h += '</div>';

  h += '<div id="glossary-list"></div>';
  h += '</div>';
  el.innerHTML = h;

  function renderDefs(q) {
    const list = document.getElementById("glossary-list");
    const filtered = q
      ? DATA.definitions.filter(d => d.term.toLowerCase().includes(q) || d.definition.toLowerCase().includes(q))
      : DATA.definitions;
    document.getElementById("glossary-count").textContent = filtered.length + " definitions found";
    let html = '<div style="display:grid;grid-template-columns:1fr;gap:16px">';
    for (const d of filtered) {
      html += '<div class="def-card"><h3 class="def-term">' + esc(d.term) + '</h3>';
      html += '<p class="def-text">' + esc(d.definition) + '</p>';
      html += '<div class="def-meta">' + esc(d.contract_id) + ' ' + esc(d.section || "") + '</div></div>';
    }
    if (!filtered.length) html += '<div style="text-align:center;color:#94a3b8;font-style:italic;padding:48px">No matching definitions</div>';
    html += '</div>';
    list.innerHTML = html;
  }

  renderDefs("");
  document.getElementById("glossary-search").addEventListener("input", function(e) {
    renderDefs(e.target.value.toLowerCase());
  });
})();

// ── Render Review Notes — matches ReviewNotes.tsx ──────────────────────────
(function renderNotes() {
  const el = document.getElementById("notes-content");

  let h = '<div class="space-y-6 animate-in" style="text-align:left">';

  // Filter toolbar
  h += '<div class="filter-toolbar">';
  h += '<span style="font-size:10px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em">Filters:</span>';
  h += '<div style="display:flex;gap:12px">';
  h += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:#fff;padding:4px 12px;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.05);border:1px solid #e2e8f0"><input type="checkbox" checked data-filter="pending" class="note-filter" style="accent-color:#ef4444"><span style="font-size:12px;font-weight:900;color:#475569;text-transform:uppercase">Pending</span></label>';
  h += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:#fff;padding:4px 12px;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.05);border:1px solid #e2e8f0"><input type="checkbox" checked data-filter="reviewed" class="note-filter" style="accent-color:#f97316"><span style="font-size:12px;font-weight:900;color:#475569;text-transform:uppercase">Reviewed</span></label>';
  h += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;background:#fff;padding:4px 12px;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.05);border:1px solid #e2e8f0"><input type="checkbox" checked data-filter="resolved" class="note-filter" style="accent-color:#22c55e"><span style="font-size:12px;font-weight:900;color:#475569;text-transform:uppercase">Resolved</span></label>';
  h += '</div>';
  h += '<span style="font-size:12px;color:#94a3b8" id="notes-count">' + DATA.reviewNotes.length + ' of ' + DATA.reviewNotes.length + ' notes</span>';
  h += '</div>';

  h += '<div id="notes-list"></div>';
  h += '</div>';
  el.innerHTML = h;

  function renderNoteCards() {
    const showPending = document.querySelector('[data-filter="pending"]').checked;
    const showReviewed = document.querySelector('[data-filter="reviewed"]').checked;
    const showResolved = document.querySelector('[data-filter="resolved"]').checked;

    const filtered = DATA.reviewNotes.filter(n => {
      const isResolved = n.is_reviewed && !!n.narrative;
      const isReviewedOnly = n.is_reviewed && !n.narrative;
      if (showPending && !n.is_reviewed) return true;
      if (showReviewed && isReviewedOnly) return true;
      if (showResolved && isResolved) return true;
      return false;
    });

    document.getElementById("notes-count").textContent = filtered.length + " of " + DATA.reviewNotes.length + " notes";

    const list = document.getElementById("notes-list");
    let html = '<div style="display:grid;grid-template-columns:1fr;gap:16px">';

    for (const n of filtered) {
      const isResolved = n.is_reviewed && !!n.narrative;
      const noteClass = n.is_reviewed ? (isResolved ? "note-resolved" : "note-reviewed") : "note-pending";
      const statusLabel = n.is_reviewed ? (isResolved ? "RESOLVED" : "REVIEWED") : "PENDING";
      const statusCls = n.is_reviewed ? (isResolved ? "status-resolved" : "status-reviewed") : "status-pending";
      const iconColor = n.is_reviewed ? "#22c55e" : "#ef4444";

      html += '<div class="card ' + noteClass + '" style="border-radius:16px;padding:24px">';
      html += '<div style="display:flex;align-items:flex-start;gap:16px">';
      html += '<span style="color:' + iconColor + ';flex-shrink:0;margin-top:2px">' + icon("alertTriangle", 20) + '</span>';
      html += '<div style="flex:1;min-width:0">';

      // Meta line
      html += '<div style="display:flex;gap:8px;margin-bottom:4px;text-transform:uppercase;font-size:10px;font-weight:900;letter-spacing:0.1em;color:#94a3b8;flex-wrap:wrap;align-items:center">';
      html += '<span>' + esc(n.type) + '</span>';
      html += '<span class="badge ' + sevClass(n.severity) + '" style="padding:2px 8px;border-radius:4px">' + esc(n.severity) + '</span>';
      html += '<span class="badge ' + statusCls + '" style="padding:2px 8px;border-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.05)">' + statusLabel + '</span>';
      if (n.contract_id) html += '<span style="color:#3b82f6">Contract ' + esc(n.contract_id) + '</span>';
      html += '</div>';

      // Issue title
      html += '<h4 style="color:#334155;font-weight:900;font-size:16px;margin-top:4px">' + esc(n.issue) + '</h4>';

      // Resolution
      if (n.narrative) {
        html += '<div style="margin-top:12px">';
        html += '<label style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;display:flex;align-items:center;gap:8px">' + icon("messageSquare", 12) + ' Resolution</label>';
        html += '<p style="padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;font-style:italic;font-weight:500;color:#475569;font-size:14px;margin-top:4px">' + esc(n.narrative) + '</p>';
        html += '</div>';
      }

      html += '</div></div></div>';
    }

    if (!filtered.length) html += '<div style="text-align:center;color:#94a3b8;font-style:italic;padding:48px">No review notes matching filters</div>';
    html += '</div>';
    list.innerHTML = html;
  }

  renderNoteCards();
  document.querySelectorAll(".note-filter").forEach(cb => {
    cb.addEventListener("change", renderNoteCards);
  });
})();

// ── Footer date ─────────────────────────────────────────────────────────────
document.getElementById("export-date").textContent = new Date(DATA.exportedAt).toLocaleString();
</script>
</body>
</html>`;

  // ── Write file ────────────────────────────────────────────────────────────

  const outDir = path.join(process.cwd(), "exports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const projectName = (projectRow?.name as string || "all").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const outPath = path.join(outDir, `${projectName}-${timestamp}.html`);
  fs.writeFileSync(outPath, html, "utf-8");

  return { html, outPath, projectName: projectRow?.name as string | undefined };
}

// ── CLI entry point ─────────────────────────────────────────────────────────

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  // Usage: npx tsx scripts/export-html.ts [--project <id>]
  const args = process.argv.slice(2);
  const projIdx = args.indexOf("--project");
  const cliProjectId = projIdx >= 0 && projIdx + 1 < args.length ? Number(args[projIdx + 1]) : undefined;

  // If no project specified, use the most recent one
  let projectId = cliProjectId;
  if (!projectId) {
    const dbForCli = new Database(path.join(process.cwd(), "data", "contracts.db"), { readonly: true });
    const latest = dbForCli.prepare("SELECT id, name FROM projects ORDER BY id DESC LIMIT 1").get() as { id: number; name: string } | undefined;
    dbForCli.close();
    if (latest) {
      projectId = latest.id;
      console.log(`Using latest project: ${latest.name} (ID: ${latest.id})`);
    }
  }

  const { outPath } = generateHtmlReport(undefined, projectId);
  const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`\n✅ Export complete!`);
  console.log(`   File: ${outPath}`);
  console.log(`   Size: ${sizeKB} KB`);
  console.log(`   Open in browser: file://${outPath}\n`);
}
