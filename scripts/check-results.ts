import { getDb, closeDb } from "../src/lib/db";

const db = getDb();

console.log("=== Analysis Results Summary ===\n");

// Contract status
const contracts = db.prepare("SELECT id, name, analysis_confidence, needs_review FROM contracts ORDER BY id").all() as any[];
console.log("Contracts:");
for (const c of contracts) {
  console.log(`  ${c.id}: ${c.name} — confidence: ${c.analysis_confidence?.toFixed(2) ?? "N/A"}, needs_review: ${c.needs_review ? "YES" : "no"}`);
}

// Table counts
const tables = ["clauses", "definitions", "relationships", "pricing_tables", "patents", "licensed_products", "technologies", "review_notes"];
console.log("\nTable Counts:");
for (const t of tables) {
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${t}`).get() as any;
  console.log(`  ${t}: ${row.cnt}`);
}

// Review notes detail
console.log("\nReview Notes:");
const notes = db.prepare("SELECT id, contract_id, type, severity, issue FROM review_notes ORDER BY id").all() as any[];
for (const n of notes) {
  console.log(`  [${n.severity}] ${n.type} (contract ${n.contract_id}): ${n.issue.substring(0, 120)}...`);
}

// Cross-contract notes specifically
const crossNotes = notes.filter((n: any) => n.type.startsWith("cross_contract_"));
console.log(`\nCross-contract notes: ${crossNotes.length}`);

closeDb();
