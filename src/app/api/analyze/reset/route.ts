import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * POST /api/analyze/reset
 * Resets all analysis data while preserving contract raw_text.
 * Body: { contractIds?: string[] } — if omitted, resets ALL contracts.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { contractIds } = body as { contractIds?: string[] };

  const db = getDb();

  const txn = db.transaction(() => {
    if (contractIds && contractIds.length > 0) {
      // Reset specific contracts
      const placeholders = contractIds.map(() => "?").join(",");

      db.prepare(`
        UPDATE contracts
        SET analysis_json = NULL, analysis_confidence = NULL, needs_review = 1,
            effective_date = NULL, expiry_date = NULL, licensed_technology = NULL,
            territory = NULL, initial_fee = NULL, parent_id = NULL,
            updated_at = datetime('now')
        WHERE id IN (${placeholders})
      `).run(...contractIds);

      db.prepare(`DELETE FROM clauses WHERE contract_id IN (${placeholders})`).run(...contractIds);
      db.prepare(`DELETE FROM definitions WHERE contract_id IN (${placeholders})`).run(...contractIds);
      db.prepare(`DELETE FROM relationships WHERE source_id IN (${placeholders})`).run(...contractIds);
      db.prepare(`DELETE FROM pricing_tables WHERE contract_id IN (${placeholders})`).run(...contractIds);
      db.prepare(`DELETE FROM patents WHERE contract_id IN (${placeholders})`).run(...contractIds);
      db.prepare(`DELETE FROM licensed_products WHERE contract_id IN (${placeholders})`).run(...contractIds);
      db.prepare(`DELETE FROM review_notes WHERE contract_id IN (${placeholders})`).run(...contractIds);

      // Clean up orphaned technologies
      db.prepare(`
        DELETE FROM tech_contract_map WHERE contract_id IN (${placeholders})
      `).run(...contractIds);
      db.prepare(`
        DELETE FROM technologies WHERE id NOT IN (SELECT DISTINCT tech_id FROM tech_contract_map)
      `).run();
    } else {
      // Reset ALL
      db.prepare(`
        UPDATE contracts
        SET analysis_json = NULL, analysis_confidence = NULL, needs_review = 1,
            effective_date = NULL, expiry_date = NULL, licensed_technology = NULL,
            territory = NULL, initial_fee = NULL, parent_id = NULL,
            updated_at = datetime('now')
      `).run();

      for (const table of ["clauses", "definitions", "relationships", "pricing_tables", "patents", "licensed_products", "tech_contract_map", "technologies", "review_notes"]) {
        db.prepare(`DELETE FROM ${table}`).run();
      }
    }
  });

  txn();

  const remaining = db.prepare(
    "SELECT COUNT(*) as cnt FROM contracts WHERE analysis_json IS NOT NULL"
  ).get() as { cnt: number };

  return NextResponse.json({
    reset: contractIds || "all",
    analyzedRemaining: remaining.cnt,
  });
}
