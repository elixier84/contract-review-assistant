import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import * as XLSX from "xlsx";

export async function GET() {
  const db = getDb();

  const wb = XLSX.utils.book_new();

  // 1. Contracts sheet
  const contracts = db.prepare(`
    SELECT id, name, type, status, effective_date, expiry_date,
           parent_id, licensed_technology, territory, initial_fee,
           analysis_confidence, needs_review
    FROM contracts ORDER BY id
  `).all();
  const wsContracts = XLSX.utils.json_to_sheet(contracts);
  XLSX.utils.book_append_sheet(wb, wsContracts, "Contracts");

  // 2. Clauses sheet
  const clauses = db.prepare(`
    SELECT c.id, c.contract_id, ct.name as contract_name, c.type, c.section,
           c.snippet, c.key_terms_json, c.confidence, c.needs_review
    FROM clauses c JOIN contracts ct ON ct.id = c.contract_id
    ORDER BY c.contract_id, c.type
  `).all();
  const wsClause = XLSX.utils.json_to_sheet(clauses);
  XLSX.utils.book_append_sheet(wb, wsClause, "Clauses");

  // 3. Definitions sheet
  const definitions = db.prepare(`
    SELECT d.contract_id, c.name as contract_name, d.term, d.definition, d.section
    FROM definitions d JOIN contracts c ON c.id = d.contract_id
    ORDER BY d.contract_id, d.term
  `).all();
  const wsDefs = XLSX.utils.json_to_sheet(definitions);
  XLSX.utils.book_append_sheet(wb, wsDefs, "Definitions");

  // 4. Relationships sheet
  const relationships = db.prepare(`
    SELECT r.source_id, s.name as source_name,
           r.target_id, t.name as target_name,
           r.type, r.evidence_text, r.evidence_section, r.confidence
    FROM relationships r
    JOIN contracts s ON s.id = r.source_id
    JOIN contracts t ON t.id = r.target_id
    ORDER BY r.source_id
  `).all();
  const wsRels = XLSX.utils.json_to_sheet(relationships);
  XLSX.utils.book_append_sheet(wb, wsRels, "Relationships");

  // 5. Pricing sheet (flattened tiers)
  const pricing = db.prepare(`
    SELECT pt.contract_id, c.name as contract_name, pt.technology, pt.name as table_name,
           pt.section, pt.royalty_basis, pt.tiers_json, pt.discounts_json,
           pt.cpi_adjustment, pt.is_used_in_reports, pt.confidence
    FROM pricing_tables pt JOIN contracts c ON c.id = pt.contract_id
    ORDER BY pt.contract_id, pt.technology
  `).all() as Record<string, unknown>[];

  // Flatten tiers into individual rows
  const pricingRows: Record<string, unknown>[] = [];
  for (const pt of pricing) {
    let tiers: { from?: number; to?: number | null; rate?: number }[] = [];
    try { tiers = JSON.parse(pt.tiers_json as string); } catch { /* ignore */ }
    if (tiers.length > 0) {
      for (const tier of tiers) {
        pricingRows.push({
          contract_id: pt.contract_id,
          contract_name: pt.contract_name,
          technology: pt.technology,
          table_name: pt.table_name,
          section: pt.section,
          royalty_basis: pt.royalty_basis,
          tier_from: tier.from,
          tier_to: tier.to ?? "∞",
          tier_rate: tier.rate,
          is_used: pt.is_used_in_reports ? "Yes" : "No",
        });
      }
    } else {
      pricingRows.push({
        contract_id: pt.contract_id,
        contract_name: pt.contract_name,
        technology: pt.technology,
        table_name: pt.table_name,
        section: pt.section,
        royalty_basis: pt.royalty_basis,
        tier_from: "",
        tier_to: "",
        tier_rate: "",
        is_used: pt.is_used_in_reports ? "Yes" : "No",
      });
    }
  }
  const wsPricing = XLSX.utils.json_to_sheet(pricingRows);
  XLSX.utils.book_append_sheet(wb, wsPricing, "Pricing");

  // 6. Patents sheet
  const patents = db.prepare(`
    SELECT p.contract_id, c.name as contract_name, p.technology,
           p.country, p.patent_number, p.is_application
    FROM patents p JOIN contracts c ON c.id = p.contract_id
    ORDER BY p.technology, p.country
  `).all();
  const wsPatents = XLSX.utils.json_to_sheet(patents);
  XLSX.utils.book_append_sheet(wb, wsPatents, "Patents");

  // 7. Review Notes sheet
  const notes = db.prepare(`
    SELECT rn.contract_id, rn.type, rn.issue, rn.severity,
           CASE WHEN rn.is_reviewed THEN 'Yes' ELSE 'No' END as reviewed,
           rn.narrative, rn.created_at
    FROM review_notes rn ORDER BY rn.severity DESC, rn.created_at DESC
  `).all();
  const wsNotes = XLSX.utils.json_to_sheet(notes);
  XLSX.utils.book_append_sheet(wb, wsNotes, "Review Notes");

  // Generate buffer
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="CRA_Export_${new Date().toISOString().split("T")[0]}.xlsx"`,
    },
  });
}
