# Phase 2 Claude Analysis Planning Document

> **Summary**: 6 analysis prompts via Claude CLI, per-contract structured extraction to SQLite
>
> **Project**: Contract Review Assistant (CRA)
> **Author**: Jay
> **Date**: 2026-03-19
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

Run 6 Claude analysis tasks per contract to extract metadata, clauses, definitions, relationships, pricing, and patents/products. Store structured results in corresponding SQLite tables.

### 1.2 Background

Phase 1 stored raw_text from 4 DOCX contracts. Phase 2 uses Claude to parse that text into structured data needed for the audit dashboard.

### 1.3 Related Documents

- Architecture: `docs/SPEC.md` (Phase 2 section)
- Prompts: `src/prompts/01-metadata.md` through `06-patents-products.md`
- Schema: `docs/SCHEMA.md`
- Domain: `docs/DOMAIN.md`
- Test Data: `docs/TEST_DATA.md` (expected extraction results)

---

## 2. Scope

### 2.1 In Scope

- [ ] Claude CLI wrapper (`src/lib/claude-analyzer.ts`)
- [ ] 6 analysis tasks per contract (metadata, clauses, glossary, relationships, pricing, patents-products)
- [ ] Store results in: contracts, clauses, definitions, relationships, pricing_tables, technologies, tech_contract_map, licensed_products, patents
- [ ] Confidence scoring: < 0.8 → needs_review, < 0.5 → auto-create review_note
- [ ] `npm run analyze` script to process un-analyzed contracts
- [ ] API routes: `/api/contracts`, `/api/contracts/:id`, `/api/analyze/:id`

### 2.2 Out of Scope

- Dashboard UI rendering (Phase 1b)
- PDF/OCR ingestion (Phase 3)
- Cross-reference validation (Phase 3)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Owner |
|----|-------------|----------|-------|
| FR-01 | Claude CLI wrapper: send prompt + contract text, parse JSON response | High | developer |
| FR-02 | 01-metadata: extract and update contracts table fields | High | developer |
| FR-03 | 02-clauses: extract to clauses table | High | developer |
| FR-04 | 03-glossary: extract to definitions table | High | developer |
| FR-05 | 04-relationships: extract to relationships table (with registry) | High | developer |
| FR-06 | 05-pricing: extract to pricing_tables table | High | developer |
| FR-07 | 06-patents-products: extract to patents + licensed_products tables | High | developer |
| FR-08 | Confidence < 0.8 → set needs_review = 1 | High | developer |
| FR-09 | Confidence < 0.5 → auto-create review_note | Medium | developer |
| FR-10 | API GET /api/contracts — list all with basic fields | High | frontend |
| FR-11 | API GET /api/contracts/:id — full detail with analysis | High | frontend |
| FR-12 | API POST /api/analyze/:id — trigger re-analysis | Medium | frontend |
| FR-13 | Run analysis on 4 contracts, verify completeness | High | qa |

---

## 4. Architecture

### 4.1 Claude CLI Wrapper

```
claude-analyzer.ts
  ├── analyzeContract(contractId) — orchestrates all 6 tasks
  ├── runPrompt(promptPath, contractText, extraContext?) — calls Claude CLI
  ├── storeMetadata(contractId, result)
  ├── storeClauses(contractId, result)
  ├── storeDefinitions(contractId, result)
  ├── storeRelationships(contractId, result)
  ├── storePricing(contractId, result)
  └── storePatentsProducts(contractId, result)
```

### 4.2 Claude CLI Invocation

```bash
echo "<prompt>\n<contract_text>" | claude --print --model sonnet
```

### 4.3 Analysis Flow

```
For each un-analyzed contract:
  1. Read raw_text from DB
  2. Run 6 prompts sequentially (to avoid rate limits)
  3. Parse JSON response from each
  4. Insert/upsert into respective tables
  5. Calculate overall confidence (average of 6 tasks)
  6. Update contracts.analysis_confidence + contracts.needs_review
  7. If any task confidence < 0.5 → create review_note
```

---

## 5. Team Assignment (Dynamic Mode)

| Teammate | Role | Tasks |
|----------|------|-------|
| developer | Core analyzer | FR-01~FR-09: claude-analyzer.ts, analyze script, DB storage |
| frontend | API layer | FR-10~FR-12: API routes for contracts and analysis |
| qa | Verification | FR-13: Run analysis, verify DB data, validate against TEST_DATA.md |

---

## 6. Success Criteria

- [ ] All 4 contracts analyzed with 6 prompts each
- [ ] clauses table populated (audit_right, interest, data_retention, etc.)
- [ ] definitions table populated (21+ terms from 85001)
- [ ] relationships table has 4+ detected relationships (per TEST_DATA.md)
- [ ] pricing_tables has tier data for 85002, 85003, 85004
- [ ] patents table populated for 85003, 85004
- [ ] review_notes auto-created for low-confidence items

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-19 | Initial draft | Jay |
