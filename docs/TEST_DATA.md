# Test Data — 4 Masked Contracts

Licensor: Orion Audio Licensing Corporation (Delaware, Portland OR)
Licensee: Sakura Electronics Co., Ltd. (Osaka, Japan)

## 85001 — Standard Terms and Conditions (Master)
- **Type**: master_tc
- **Effective**: 2012-03-20
- **Expiry**: None (perpetual until terminated)
- **Role**: All definitions, audit rights, payment terms, termination conditions
- **Key clauses**:
  - §5.4 Interest: 1.5%/month (max legal rate)
  - §5.6 Audit: 10 calendar days notice, once/year, licensor's expense, 3yr record retention
  - §5.7 Under-reporting: $10K or 5% threshold → 3x royalty + interest + full audit costs
  - §6.1 Auto-renewal: successive 1yr periods unless 90 days notice
- **Definitions**: 21 terms in §1 including Licensed Product (§1.9), Sell (§1.15), Subsidiary (§1.16)
- **No pricing tables** — pricing is in individual Technology Licenses

## 85002 — Pricing Policy Letter (Side Letter)
- **Type**: side_letter
- **Effective**: 2012-03-25 (latter of two signature dates)
- **Expiry**: 2016-03-31
- **Role**: Special automotive combo pricing for products with 2+ Orion technologies
- **References**: Orion Standard, Orion Advanced, Orion UltraHD (technologies from 85003, 85004, and an unlisted Orion Standard agreement)
- **Key rule**: "the single highest of the Standard Royalty Rates" for Eligible Products
- **Same tier table** as 85003/85004: $2.20→$1.10→$0.44→$0.38→$0.33 per Channel
- **Additional discounts**: $0.35 multi-channel (Orion Standard/Advanced only, NOT UltraHD), $0.18 non-patent
- **Eligible Products**: 4 specific automotive product types (Blu-ray, headunit, surround processor, amplifier)
- **Non-aggregation rule**: Channels exempt from royalty under this letter cannot be aggregated with other products

## 85003 — System License Agreement: Orion Advanced
- **Type**: technology_license
- **Effective**: 2012-03-20
- **Expiry**: 2013-03-31
- **Licensed Technology**: Orion Advanced consumer decoder
- **Initial Fee**: $30,000
- **Territory**: Worldwide manufacturing + sales
- **Parent**: 85001 (cover page: "APPLICABLE STANDARD TERMS AND CONDITIONS: 85001")
- **Pricing** (Appendix E): LD1-based, same 5-tier table
  - Multi-channel discount: $0.35 for 5+ LD1s
  - Virtualized output discount: multi-channel to 2 outputs → charged as 3 LD1s only
  - Non-patent discount: $0.18/LD1, max 3
  - CPI: COLA from Dec 1993
- **Patents** (Appendix A): 65+ granted patents across 25+ countries, 25+ applications
- **Licensed Products** (Appendix F): 14 product types (consumer + automotive)

## 85004 — System License Agreement: Orion UltraHD
- **Type**: technology_license
- **Effective**: 2012-03-20
- **Expiry**: 2013-03-31
- **Licensed Technology**: Orion UltraHD consumer decoder
- **Initial Fee**: $15,000
- **Territory**: Worldwide
- **Parent**: 85001
- **Pricing** (Appendix E): Same LD1 basis, same tier table
  - NO multi-channel discount (unlike Orion Advanced)
  - Non-patent discount: $0.18/LD1, max 3
  - CPI: COLA from Dec 1993
- **Patents** (Appendix A): 35+ granted, 16 applications
- **Licensed Products** (Appendix F): 13 product types

## Expected Extraction Results

### Relationships Claude should detect:
| Source | Target | Type | Evidence |
|--------|--------|------|----------|
| 85003 | 85001 | references_tc | Cover page + Introduction |
| 85004 | 85001 | references_tc | Cover page + Introduction |
| 85002 | 85003 | pricing_for | References "Orion Advanced" technology |
| 85002 | 85004 | pricing_for | References "Orion UltraHD" technology |

### Review Notes Claude should auto-flag:
- 85002 references "Orion Standard" which has no corresponding agreement in the test set
- 85003/85004 expiry is 2013-03-31 — extremely short term, may indicate auto-renewal under §6.1
- 85002 expiry (2016-03-31) extends beyond 85003/85004 base expiry — potential coverage gap issue
