import { getDb, closeDb } from "../src/lib/db";

const db = getDb();

console.log("Resetting all analysis data...\n");

// Clear analysis results from contracts
db.prepare("UPDATE contracts SET analysis_json = NULL, analysis_confidence = NULL, needs_review = 1, effective_date = NULL, expiry_date = NULL, licensed_technology = NULL, territory = NULL, initial_fee = NULL, parent_id = NULL").run();
console.log("  contracts: analysis fields cleared");

// Clear dependent tables
const tables = ["clauses", "definitions", "relationships", "pricing_tables", "patents", "licensed_products", "tech_contract_map", "technologies", "review_notes"];
for (const t of tables) {
  const result = db.prepare(`DELETE FROM ${t}`).run();
  console.log(`  ${t}: ${result.changes} rows deleted`);
}

console.log("\nDone. All contracts ready for re-analysis.");
closeDb();
