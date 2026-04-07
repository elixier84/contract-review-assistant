import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "contracts.db");

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Remove existing DB for clean init
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log("Removed existing database.");
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = `
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    licensor TEXT NOT NULL,
    licensee TEXT NOT NULL,
    notification_date TEXT,
    audit_scope_start TEXT,
    audit_scope_end TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE contracts (
    id TEXT PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'Active',
    effective_date TEXT,
    expiry_date TEXT,
    parent_id TEXT REFERENCES contracts(id),
    licensed_technology TEXT,
    territory TEXT,
    initial_fee REAL,
    file_path TEXT,
    file_hash TEXT,
    raw_text TEXT,
    analysis_json TEXT,
    analysis_confidence REAL,
    needs_review BOOLEAN DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL REFERENCES contracts(id),
    target_id TEXT NOT NULL REFERENCES contracts(id),
    type TEXT NOT NULL,
    evidence_text TEXT,
    evidence_section TEXT,
    confidence REAL,
    UNIQUE(source_id, target_id, type)
);

CREATE TABLE extensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id TEXT REFERENCES contracts(id),
    extended_by TEXT REFERENCES contracts(id),
    original_expiry TEXT,
    new_expiry TEXT,
    evidence_text TEXT
);

CREATE TABLE clauses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id TEXT NOT NULL REFERENCES contracts(id),
    type TEXT NOT NULL,
    section TEXT,
    snippet TEXT NOT NULL,
    key_terms_json TEXT,
    page_number INTEGER,
    confidence REAL,
    needs_review BOOLEAN DEFAULT 1
);

CREATE TABLE definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id TEXT NOT NULL REFERENCES contracts(id),
    term TEXT NOT NULL,
    definition TEXT NOT NULL,
    section TEXT,
    UNIQUE(contract_id, term)
);

CREATE TABLE pricing_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id TEXT NOT NULL REFERENCES contracts(id),
    technology TEXT,
    name TEXT,
    section TEXT,
    royalty_basis TEXT,
    tiers_json TEXT,
    discounts_json TEXT,
    cpi_adjustment TEXT,
    aggregation_rules TEXT,
    is_used_in_reports BOOLEAN DEFAULT 0,
    confidence REAL,
    needs_review BOOLEAN DEFAULT 1
);

CREATE TABLE technologies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'Active',
    description TEXT
);

CREATE TABLE tech_contract_map (
    tech_id INTEGER REFERENCES technologies(id),
    contract_id TEXT REFERENCES contracts(id),
    role TEXT,
    PRIMARY KEY (tech_id, contract_id)
);

CREATE TABLE licensed_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id TEXT NOT NULL REFERENCES contracts(id),
    technology TEXT,
    product_type TEXT,
    category TEXT
);

CREATE TABLE patents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id TEXT NOT NULL REFERENCES contracts(id),
    technology TEXT,
    country TEXT,
    patent_number TEXT,
    is_application BOOLEAN DEFAULT 0,
    UNIQUE(contract_id, country, patent_number)
);

CREATE TABLE review_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id TEXT REFERENCES contracts(id),
    type TEXT NOT NULL,
    issue TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    is_reviewed BOOLEAN DEFAULT 0,
    narrative TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE contract_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id TEXT NOT NULL REFERENCES contracts(id),
    page_number INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'parser',     -- 'parser', 'vision', 'manual'
    text TEXT NOT NULL DEFAULT '',
    char_count INTEGER NOT NULL DEFAULT 0,
    is_empty BOOLEAN NOT NULL DEFAULT 1,
    confidence REAL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(contract_id, page_number)
);
`;

db.exec(schema);

// Verify all tables were created
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as { name: string }[];

console.log(`Database initialized at ${DB_PATH}`);
console.log(`Tables created (${tables.length}):`);
tables.forEach((t) => console.log(`  - ${t.name}`));

db.close();
