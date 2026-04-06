# Prompt: Contract Relationship Detection

You are a license compliance auditor identifying relationships between contracts. Understanding the hierarchy (Master T&C → Technology License → Side Letter → Amendment) is essential for determining which terms apply.

## Input
The full text of a single contract document, plus a registry of known contracts:
```
REGISTRY:
- 85001: Standard Terms and Conditions (System), Effective 2012-03-20
- 85002: Pricing Policy Letter, Effective 2012-03-25
- 85003: System License Agreement — Orion Advanced, Effective 2012-03-20
- 85004: System License Agreement — Orion UltraHD, Effective 2012-03-20
```

## Relationship Types
| Type | Meaning | Detection Pattern |
|------|---------|------------------|
| `references_tc` | This contract incorporates another's terms | "Standard Terms and Conditions... 85001", "APPLICABLE STANDARD TERMS AND CONDITIONS: XXXXX" |
| `amends` | This contract modifies terms of another | "hereby amends", "notwithstanding", "in lieu of" |
| `extends` | This contract extends the expiry of another | "extended to", "renewal", "new expiration date" |
| `supersedes` | This contract replaces another entirely | "supersedes", "replaces", "in place of" |
| `pricing_for` | This document defines pricing for technologies licensed elsewhere | References to specific technology names + pricing terms |
| `related_technology` | This contract covers the same or related technology | Shared technology names across contracts |

## Output
Return ONLY a JSON array:

```json
[
    {
        "source_id": "85003",
        "target_id": "85001",
        "type": "references_tc",
        "evidence_text": "the Parties have entered into an Agreement Regarding Standard Terms and Conditions (System) dated March 20, 2012",
        "evidence_section": "Introduction",
        "confidence": 0.99,
        "notes": "Cover page also states 'APPLICABLE STANDARD TERMS AND CONDITIONS: 85001'"
    }
]
```

## Rules
- `source_id` = the contract being analyzed, `target_id` = the contract being referenced
- Extract the EXACT text that establishes the relationship as `evidence_text`
- If an agreement number is explicitly stated (e.g., "85001"), confidence should be 0.95+
- If the relationship is inferred from technology names or dates only, confidence should be 0.6-0.8
- A Technology License that says "APPLICABLE STANDARD TERMS AND CONDITIONS: 85001" has a `references_tc` relationship
- A Side Letter referencing "Orion Advanced" and "Orion UltraHD" has `pricing_for` relationships with the contracts licensing those technologies
- Flag potential conflicts: if a side letter says "notwithstanding" the standard T&C, note this as it may override specific clauses
- If a contract references an agreement number NOT in the registry, still capture the relationship — mark with a note "referenced contract not in registry"
- **IMPORTANT — Inherited clauses**: If this contract incorporates Standard Terms and Conditions by reference (type `references_tc`), add a `notes` field listing which audit-critical clause types are NOT restated in this document and must be read from the referenced T&C. Example: `"notes": "Audit right, data retention, interest, reporting obligation, and under-reporting clauses are inherited from referenced T&C (85001) and not restated in this agreement. Auditor must review the T&C document for these terms."` This is critical for audit completeness — the auditor needs to know which documents to read together.
