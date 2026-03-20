# Audit Domain Context

## Royalty Compliance Audit Flow
1. **Notification** → Licensor notifies licensee of upcoming audit
2. **Pre-fieldwork** → Auditor reviews contracts, builds clause map, identifies rates ← THIS TOOL
3. **Fieldwork** → On-site data collection, report verification
4. **Calculation** → Apply rates to reported quantities, check under-reporting
5. **Reporting** → Draft findings, negotiate with licensee

## Why Each Clause Matters
- **Audit Right**: Defines access scope, notice period, frequency — disputes arise when not followed exactly
- **Data Retention**: If licensee destroyed records within retention period → adverse inference
- **Interest**: Applied to underpayments. 1.5%/month compounds significantly over multi-year audit periods
- **Under-reporting**: 3x penalty is the biggest financial lever in audits
- **CPI Adjustment**: Rates from base year (often 1993) must be adjusted annually — missing this undervalues findings
- **Non-Patent Country**: Discount only valid if NO patents exist in that country — requires patent schedule cross-reference

## Royalty Calculation Logic (from test data)
- **Unit**: LD1 (Licensed Device Type 1) = one full-frequency audio channel output
- **Counting**: 5.1 surround decoder = 5 LD1s; stereo = 2 LD1s
- **Volume tiers**: Per-quarter cumulative (not per-product)
- **Combo rule** (Side Letter 85002): Product with 2+ Orion technologies → pay only highest single rate
- **CPI multiplier**: Applied annually based on COLA index delta from Dec 1993
- **Discounts**: Multi-channel ($0.35/product for 5+ LD1s), Non-Patent Country ($0.18/LD1, max 3 LD1s)

## Contract Hierarchy Pattern
```
Master T&C (85001)
├── Technology License (85003) → "APPLICABLE STANDARD TERMS AND CONDITIONS: 85001"
├── Technology License (85004) → same reference
└── Side Letter (85002) → references technologies from 85003 & 85004
```

In conflict: Technology License terms override Master T&C ("terms of this Agreement shall control").

## Known Contract Patterns

### Cover Page Fields (Technology License)
- EFFECTIVE DATE, EXPIRATION DATE, TERRITORY, LICENSED PRODUCT, LICENSED TECHNOLOGY
- INITIAL FEE, AGREEMENT NO, APPLICABLE STANDARD TERMS AND CONDITIONS

### Clause Locations in Master T&C
- §1: Main Definitions (21+ terms)
- §5.4: Interest (1.5%/month, capped at legal max)
- §5.6: Audit right (10 days notice, annual, licensor's expense, 3yr retention)
- §5.7: Under-reporting penalty (3x royalty + interest + full audit cost)
- §6: Termination conditions

### Appendix Structure (Technology License)
- Appendix A: Schedule of Patents (country × patent number table)
- Appendix B: List of Deliverables
- Appendix C: Schedule of Trademarks
- Appendix D: Schedule of Notices
- Appendix E: Schedule of Royalties (tier table + discounts + CPI + aggregation)
- Appendix F: Schedule of Licensed Products (product type list)
