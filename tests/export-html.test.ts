import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";
import { generateHtmlReport } from "../scripts/export-html";

// ---------------------------------------------------------------------------
// Test helper: create a temp SQLite DB with the CRA schema
// ---------------------------------------------------------------------------

let testDbPath: string;
let tmpDir: string;

function createTestDb(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cra-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Minimal schema matching the real schema from docs/SCHEMA.md
  db.exec(`
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'technology_license',
      status TEXT NOT NULL DEFAULT 'Active',
      file_path TEXT,
      file_hash TEXT,
      raw_text TEXT,
      effective_date TEXT,
      expiry_date TEXT,
      parent_id TEXT,
      licensed_technology TEXT,
      territory TEXT,
      initial_fee REAL,
      analysis_json TEXT,
      analysis_confidence REAL,
      needs_review INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE clauses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id TEXT NOT NULL,
      type TEXT NOT NULL,
      section TEXT,
      snippet TEXT,
      key_terms_json TEXT,
      confidence REAL,
      needs_review INTEGER DEFAULT 0,
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );

    CREATE TABLE definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id TEXT NOT NULL,
      term TEXT NOT NULL,
      definition TEXT NOT NULL,
      section TEXT,
      UNIQUE(contract_id, term),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );

    CREATE TABLE relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      type TEXT NOT NULL,
      evidence_text TEXT,
      evidence_section TEXT,
      confidence REAL,
      UNIQUE(source_id, target_id, type),
      FOREIGN KEY (source_id) REFERENCES contracts(id),
      FOREIGN KEY (target_id) REFERENCES contracts(id)
    );

    CREATE TABLE pricing_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id TEXT NOT NULL,
      technology TEXT,
      name TEXT,
      section TEXT,
      royalty_basis TEXT,
      tiers_json TEXT,
      discounts_json TEXT,
      cpi_adjustment TEXT,
      aggregation_rules TEXT,
      confidence REAL,
      needs_review INTEGER DEFAULT 0,
      is_used_in_reports INTEGER DEFAULT 0,
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );

    CREATE TABLE patents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id TEXT NOT NULL,
      technology TEXT,
      country TEXT,
      patent_number TEXT,
      is_application INTEGER DEFAULT 0,
      UNIQUE(contract_id, patent_number),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );

    CREATE TABLE licensed_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id TEXT NOT NULL,
      technology TEXT,
      product_type TEXT,
      category TEXT,
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );

    CREATE TABLE review_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id TEXT,
      type TEXT NOT NULL,
      issue TEXT NOT NULL,
      severity TEXT DEFAULT 'medium',
      is_reviewed INTEGER DEFAULT 0,
      narrative TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );

    CREATE TABLE technologies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE tech_contract_map (
      tech_id INTEGER NOT NULL,
      contract_id TEXT NOT NULL,
      role TEXT DEFAULT 'licensed_under',
      PRIMARY KEY (tech_id, contract_id),
      FOREIGN KEY (tech_id) REFERENCES technologies(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );
  `);

  db.close();
  return dbPath;
}

function seedTestData(dbPath: string): void {
  const db = new Database(dbPath);

  db.prepare(`
    INSERT INTO contracts (id, name, type, effective_date, expiry_date, analysis_confidence, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run("85001", "Standard Terms and Conditions", "master_tc", "2012-03-20", null, 0.92, 0);

  db.prepare(`
    INSERT INTO contracts (id, name, type, effective_date, parent_id, licensed_technology, analysis_confidence, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run("85003", "Orion Advanced License", "technology_license", "2012-05-01", "85001", "Orion Advanced", 0.88, 0);

  db.prepare(`INSERT INTO clauses (contract_id, type, section, snippet, confidence) VALUES (?, ?, ?, ?, ?)`)
    .run("85001", "audit_right", "Section 8.1", "Licensor may audit...", 0.95);

  db.prepare(`INSERT INTO definitions (contract_id, term, definition, section) VALUES (?, ?, ?, ?)`)
    .run("85001", "Licensed Product", "Any product using the Licensed Technology", "Section 1.1");

  db.prepare(`INSERT INTO relationships (source_id, target_id, type, confidence) VALUES (?, ?, ?, ?)`)
    .run("85003", "85001", "references_tc", 0.95);

  db.prepare(`INSERT INTO review_notes (contract_id, type, issue, severity) VALUES (?, ?, ?, ?)`)
    .run("85001", "clause_ambiguity", "Audit notice period unclear", "medium");

  db.prepare(`INSERT INTO technologies (name) VALUES (?)`)
    .run("Orion Advanced");

  db.close();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeAll(() => {
  testDbPath = createTestDb();
});

afterAll(() => {
  // Cleanup temp files
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  // Cleanup any generated export files
  const exportsDir = path.join(process.cwd(), "exports");
  if (fs.existsSync(exportsDir)) {
    for (const f of fs.readdirSync(exportsDir)) {
      if (f.startsWith("contract-review-") && f.endsWith(".html")) {
        // Only remove test-generated files (recent timestamps)
        const stat = fs.statSync(path.join(exportsDir, f));
        if (Date.now() - stat.mtimeMs < 60_000) {
          fs.unlinkSync(path.join(exportsDir, f));
        }
      }
    }
  }
});

describe("generateHtmlReport", () => {
  it("generates HTML from an empty database", () => {
    const { html, outPath } = generateHtmlReport(testDbPath);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Contract Review Assistant");
    expect(html).toContain("0 of 0 contracts analyzed");
    expect(outPath).toMatch(/contract-review-.*\.html$/);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it("generates HTML with seeded contract data", () => {
    seedTestData(testDbPath);
    const { html } = generateHtmlReport(testDbPath);

    // Coverage banner reflects data
    expect(html).toContain("2 of 2 contracts analyzed");
    // Embedded DATA contains contract info
    expect(html).toContain("85001");
    expect(html).toContain("85003");
    expect(html).toContain("Standard Terms and Conditions");
    expect(html).toContain("Orion Advanced License");
  });

  it("includes all 6 tab sections", () => {
    const { html } = generateHtmlReport(testDbPath);

    expect(html).toContain('data-tab="overview"');
    expect(html).toContain('data-tab="listing"');
    expect(html).toContain('data-tab="technology"');
    expect(html).toContain('data-tab="pricing"');
    expect(html).toContain('data-tab="glossary"');
    expect(html).toContain('data-tab="notes"');
  });

  it("includes print CSS", () => {
    const { html } = generateHtmlReport(testDbPath);

    expect(html).toContain("@media print");
    expect(html).toContain("page-break-before");
    expect(html).toContain("page-break-inside");
  });

  it("includes empty state CSS class", () => {
    const { html } = generateHtmlReport(testDbPath);

    expect(html).toContain("empty-notice");
  });

  it("generates valid output file path", () => {
    const { outPath } = generateHtmlReport(testDbPath);

    expect(outPath).toContain("exports");
    expect(path.extname(outPath)).toBe(".html");
  });

  it("produces standalone HTML with embedded data", () => {
    const { html } = generateHtmlReport(testDbPath);

    // Data is embedded as a JS constant
    expect(html).toContain("const DATA =");
    // No external stylesheet or script references
    expect(html).not.toContain('<link rel="stylesheet"');
    expect(html).not.toContain('<script src=');
  });

  it("includes confBadge function with Not Analyzed handling", () => {
    const { html } = generateHtmlReport(testDbPath);

    expect(html).toContain("Not Analyzed");
    expect(html).toContain("Low Confidence");
  });
});

describe("generateHtmlReport with unanalyzed contracts", () => {
  let unanalyzedDbPath: string;
  let unanalyzedTmpDir: string;

  beforeAll(() => {
    unanalyzedTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cra-unanalyzed-"));
    unanalyzedDbPath = path.join(unanalyzedTmpDir, "test.db");

    // Copy schema from test DB
    fs.copyFileSync(testDbPath, unanalyzedDbPath);

    const db = new Database(unanalyzedDbPath);
    // Clear seeded data (child tables first due to FK constraints) and add unanalyzed contract
    db.exec("DELETE FROM review_notes; DELETE FROM relationships; DELETE FROM clauses; DELETE FROM definitions; DELETE FROM pricing_tables; DELETE FROM patents; DELETE FROM licensed_products; DELETE FROM tech_contract_map; DELETE FROM contracts");
    db.prepare(`
      INSERT INTO contracts (id, name, type, analysis_confidence, needs_review)
      VALUES (?, ?, ?, NULL, 1)
    `).run("99001", "Unanalyzed Contract", "technology_license");
    db.close();
  });

  afterAll(() => {
    if (unanalyzedTmpDir && fs.existsSync(unanalyzedTmpDir)) {
      fs.rmSync(unanalyzedTmpDir, { recursive: true, force: true });
    }
  });

  it("shows 0 of 1 analyzed for unanalyzed contracts", () => {
    const { html } = generateHtmlReport(unanalyzedDbPath);
    expect(html).toContain("0 of 1 contracts analyzed");
  });
});
