# Phase 1 Foundation Planning Document

> **Summary**: Next.js + SQLite scaffolding, DOCX text extraction, DB storage
>
> **Project**: Contract Review Assistant (CRA)
> **Author**: Jay
> **Date**: 2026-03-19
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

Contract PDF/DOCX files from `contracts/` folder to extract raw text, store in SQLite, and serve via Next.js dashboard. This is Phase 1 (Foundation) of the CRA system.

### 1.2 Background

License compliance audit pre-fieldwork requires structured extraction of contract clauses, pricing, definitions, and relationships. This phase builds the data pipeline: files -> text -> DB.

### 1.3 Related Documents

- Architecture: `docs/SPEC.md`
- Schema: `docs/SCHEMA.md`
- Domain: `docs/DOMAIN.md`
- Test Data: `docs/TEST_DATA.md`

---

## 2. Scope

### 2.1 In Scope

- [x] Next.js 14+ App Router project scaffolding (TypeScript strict, Tailwind, ESLint)
- [x] SQLite schema creation (13 tables from SCHEMA.md)
- [x] DOCX text extraction via pandoc
- [x] Store raw_text + metadata in contracts table
- [x] Basic db.ts library (connection, query helpers)
- [x] npm scripts: `db:init`, `ingest`

### 2.2 Out of Scope

- Claude AI analysis (Phase 2)
- PDF extraction / OCR (Phase 3)
- Dashboard UI components (Phase 1b)
- API routes (Phase 1b)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Initialize Next.js 14+ with App Router, TypeScript strict, Tailwind | High | Pending |
| FR-02 | Create SQLite DB with all 13 tables from SCHEMA.md | High | Pending |
| FR-03 | Extract text from 4 DOCX files using pandoc CLI | High | Pending |
| FR-04 | Store raw_text, file_path, file_hash in contracts table | High | Pending |
| FR-05 | Idempotent ingestion (skip if file_hash unchanged) | Medium | Pending |
| FR-06 | npm run db:init creates/resets the database | High | Pending |
| FR-07 | npm run ingest processes all files in contracts/ | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Data Integrity | File hash prevents duplicate ingestion | Manual test |
| Portability | Local-only, no cloud dependencies | Code review |
| Reproducibility | db:init + ingest recreates full DB from source files | Manual test |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [x] `npm run db:init` creates `data/contracts.db` with all 13 tables
- [x] `npm run ingest` extracts text from 4 DOCX files
- [x] Each contract row has: id, name, type, file_path, file_hash, raw_text
- [x] `npm run dev` starts Next.js on localhost:3000

### 4.2 Quality Criteria

- [x] TypeScript strict mode, zero errors
- [x] Build succeeds (`npm run build`)
- [x] SQLite schema matches SCHEMA.md exactly

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| pandoc not installed | High | Medium | Check at startup, provide install instructions |
| DOCX formatting loss | Medium | Low | pandoc --to=plain preserves structure adequately |
| npm naming restriction (uppercase dir) | Low | High | Use lowercase in package.json name field |

---

## 6. Architecture Considerations

### 6.1 Project Level: Dynamic

Local full-stack app with SQLite backend. Not a simple static site, not enterprise microservices.

### 6.2 Key Architectural Decisions

| Decision | Selected | Rationale |
|----------|----------|-----------|
| Framework | Next.js 14+ App Router | Per CLAUDE.md spec |
| Database | SQLite via better-sqlite3 | Local-first, no server needed |
| Styling | Tailwind CSS | Per CLAUDE.md spec |
| Icons | Lucide React | Per CLAUDE.md spec |
| DOCX extraction | pandoc CLI | Reliable, handles complex formatting |
| Scripts | tsx for TypeScript scripts | Run .ts scripts directly |

### 6.3 Folder Structure

```
src/
  app/
    page.tsx          # Dashboard entry
    layout.tsx        # Root layout
    api/              # API routes (Phase 1b)
  components/         # Dashboard tabs (Phase 1b)
  lib/
    db.ts             # SQLite connection + helpers
    ingestion.ts      # DOCX text extraction
scripts/
  init-db.ts          # Schema creation
  ingest.ts           # Batch ingestion runner
data/
  contracts.db        # SQLite database (gitignored)
contracts/            # Source DOCX/PDF files (gitignored)
```

---

## 7. Implementation Order

1. **Project init**: `create-next-app` with TS + Tailwind + App Router
2. **Dependencies**: `better-sqlite3`, `@types/better-sqlite3`, `tsx`
3. **db.ts**: SQLite connection singleton, getDb() helper
4. **init-db.ts**: Execute all CREATE TABLE statements from SCHEMA.md
5. **ingestion.ts**: pandoc DOCX->text, SHA-256 hash, upsert to contracts
6. **ingest.ts**: Glob `contracts/*.docx`, run ingestion on each
7. **Verify**: Check DB has 4 rows with raw_text populated

---

## 8. Test Data Mapping

| File | Contract ID | Type | Name |
|------|------------|------|------|
| MASKED_85001_Standard_T_and_C.docx | 85001 | master_tc | Standard Terms and Conditions |
| MASKED_85002_Pricing_Policy_Letter.docx | 85002 | side_letter | Pricing Policy Letter |
| MASKED_85003_Orion_Advanced_License.docx | 85003 | technology_license | Orion Advanced System License |
| MASKED_85004_Orion_UltraHD_License.docx | 85004 | technology_license | Orion UltraHD System License |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-19 | Initial draft | Jay |
