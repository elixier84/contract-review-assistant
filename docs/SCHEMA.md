# SQLite Schema — contracts.db

```sql
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
    id TEXT PRIMARY KEY,                -- Agreement number: '85001'
    project_id INTEGER REFERENCES projects(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,                 -- master_tc, technology_license, side_letter, amendment, extension
    status TEXT DEFAULT 'Active',       -- Active, Expired, Terminated, Cancelled
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
    type TEXT NOT NULL,                 -- references_tc, amends, extends, supersedes, pricing_for
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
    type TEXT NOT NULL,                 -- audit_right, data_retention, interest, under_reporting,
                                       -- termination, sell_off, cpi_adjustment, non_patent_discount,
                                       -- reporting_obligation, payment_terms
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
    role TEXT,                          -- licensed_under, pricing_defined_in, referenced_in
    PRIMARY KEY (tech_id, contract_id)
);

CREATE TABLE licensed_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id TEXT NOT NULL REFERENCES contracts(id),
    technology TEXT,
    product_type TEXT,
    category TEXT                       -- consumer_electronics, automotive, pc_software
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
    type TEXT NOT NULL,                 -- discrepancy, missing_link, ocr_issue, pricing_mismatch,
                                       -- clause_ambiguity, date_conflict, manual
    issue TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',     -- low, medium, high, critical
    is_reviewed BOOLEAN DEFAULT 0,
    narrative TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```
