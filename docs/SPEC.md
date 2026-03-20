# CRA Architecture Spec

## System Flow
```
./contracts/ (PDF/DOCX)
    → [Ingestion] pandoc/pdf-parse text extraction
    → [Claude CLI] 6 analysis tasks per contract
    → [SQLite] structured data storage
    → [Next.js API] JSON endpoints
    → [React Dashboard] 6-tab UI on localhost:3000
```

## Design Decisions
- **Local-only**: No cloud. Contract files stay on disk. DB stores extracted text + analysis, not originals.
- **File path + page number**: "View" button opens local PDF at exact page. No need to store PDFs in DB.
- **NetSuite migration**: Only ingestion layer changes. Analysis + storage + dashboard stay identical.

## API Routes
```
/api/projects          GET/POST
/api/contracts         GET (with relationship joins)
/api/contracts/:id     GET single + full analysis
/api/clauses           GET (filterable by type)
/api/pricing           GET (grouped by technology)
/api/glossary          GET (searchable)
/api/technologies      GET/POST
/api/notes             GET/POST/PATCH
/api/analyze/:id       POST — trigger Claude re-analysis
/api/ingest            POST — upload new contract
```

## Dashboard Tabs

### 1. Audit Overview
- Manual inputs: Project name, Licensor, Licensee, Notification Date, Audit Scope
- Auto sections: Contracts found/expected, Review Notes summary, Audit Right Clauses table, Data Retention table, Interest Clause table

### 2. Contract Listing
- Table: Agreement Number, Type, Class, Name, Status, Start Date, End Date
- Expandable master→child hierarchy, search, Add/Edit modal
- Timeline View: Gantt-style effective/expiry dates with extension markers
- Phase 2 columns: Product Quantity, ASP, Gross Amount (from royalty reports, not contracts)

### 3. Technology
- Tech inventory with governing contract chain (Master → Addendum → Extension)
- Deep-links to Document and Pricing views

### 4. Pricing
- Tables grouped by technology: name, source agreement, section, Used/Not Reported
- Phase 2: OCR tagging workspace for scanned PDFs

### 5. Glossary
- All extracted definitions, searchable
- Source contract + section reference

### 6. Review Notes
- Three-state: Pending → Reviewed → Resolved (with auditor narrative)
- Auto-flagged by Claude + manual entries

## Implementation Phases

### Phase 1: Foundation
- Next.js + SQLite + Tailwind scaffolding
- SQLite schema (see docs/SCHEMA.md)
- DOCX text extraction via pandoc → store raw_text in contracts table
- Basic dashboard rendering from DB (replace mock data)

### Phase 2: Claude Analysis
- 6 prompt templates → Claude CLI wrapper
- Per-contract analysis → store in respective tables
- Confidence scoring + needs_review flagging
- Auto-generate Review Notes for low-confidence

### Phase 3: Advanced
- PDF ingestion (digital + OCR)
- Cross-reference validation
- Export to XLSX for audit workpapers
- Contract timeline with real DB data

### Phase 4: Polish
- Dashboard real-time refresh
- "View" button → local PDF at page
- Demo dataset E2E flow
- Documentation

## File Structure
```
contract-review-assistant/
├── CLAUDE.md
├── package.json / next.config.js / tailwind.config.js / tsconfig.json
├── .gitignore
├── contracts/                    # gitignored
├── data/contracts.db             # gitignored
├── docs/
│   ├── SPEC.md                   # This file
│   ├── SCHEMA.md                 # SQLite schema
│   ├── DOMAIN.md                 # Audit domain context
│   └── TEST_DATA.md              # Test contract details
├── src/
│   ├── app/
│   │   ├── page.tsx / layout.tsx
│   │   └── api/{projects,contracts,clauses,pricing,glossary,technologies,notes,analyze,ingest}/
│   ├── components/
│   │   └── {AuditOverview,ContractListing,TimelineView,TechnologyView,PricingView,GlossaryView,ReviewNotes}.tsx
│   ├── lib/
│   │   └── {db,ingestion,claude-analyzer,ocr}.ts
│   └── prompts/
│       └── {01-metadata,02-clauses,03-glossary,04-relationships,05-pricing,06-patents-products}.md
└── scripts/
    └── {init-db,ingest,analyze}.ts
```
