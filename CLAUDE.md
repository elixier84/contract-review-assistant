# Contract Review Assistant (CRA)

Local-first contract review tool for license compliance audit pre-fieldwork.
PDF/DOCX contracts → text extraction → Claude analysis → SQLite → React dashboard.

## Tech Stack
- Next.js 14+ (App Router) — TypeScript strict
- SQLite via better-sqlite3
- Tailwind CSS + Lucide React
- Text extraction: pandoc (DOCX), pdf-parse (PDF), tesseract (scanned)
- AI analysis: Claude Code CLI

## Key Commands
```bash
npm run dev          # Start dashboard on localhost:3000
npm run db:init      # Create SQLite schema
npm run ingest       # Extract text from contracts/ folder → DB
npm run analyze      # Run Claude analysis on un-analyzed contracts
```

## Project Structure
```
contracts/           # Input files (gitignored, sensitive)
data/contracts.db    # SQLite (gitignored, regenerable)
src/app/             # Next.js pages + API routes
src/components/      # 6 dashboard tabs (Overview, Listing, Tech, Pricing, Glossary, Notes)
src/lib/             # db.ts, ingestion.ts, claude-analyzer.ts
src/prompts/         # 6 analysis prompt templates (read before running analysis)
docs/                # Architecture spec, schema, domain context, test data info
```

## Conventions
- TypeScript strict. ES modules.
- Dates: ISO 8601 in DB, display as DD-MMM-YYYY (e.g. 20-MAR-2012)
- Contract IDs = agreement numbers as strings ('85001', '85003')
- Confidence: 0.0–1.0. Below 0.8 → needs_review flag. Below 0.5 → auto-create Review Note.
- Conservative extraction: skip uncertain items rather than include false positives
- Never auto-resolve ambiguity — flag for auditor review

## Test Data
4 masked DOCX contracts in `contracts/`:
- 85001: Master T&C (all definitions, audit rights, interest 1.5%/mo, 3yr retention)
- 85002: Side Letter — automotive combo pricing (references 85003 & 85004)
- 85003: Technology License — Orion Advanced (references 85001)
- 85004: Technology License — Orion UltraHD (references 85001)

See `docs/TEST_DATA.md` for full analysis and relationship map.

## Architecture Docs
Read these BEFORE implementation:
- `docs/SPEC.md` — Full architecture, phases, dashboard tab requirements
- `docs/SCHEMA.md` — SQLite schema (13 tables)
- `docs/DOMAIN.md` — Audit domain context, royalty calculation logic, why each clause matters
- `src/prompts/01-metadata.md` through `06-patents-products.md` — Analysis task specs
