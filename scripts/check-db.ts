import { getDb, closeDb } from "../src/lib/db";

const db = getDb();
const contracts = db.prepare("SELECT id, name, analysis_confidence, needs_review, analysis_json IS NOT NULL as analyzed FROM contracts ORDER BY id").all() as any[];
console.log("Contracts:");
for (const c of contracts) {
  const analyzed = c.analyzed ? "YES" : "NO";
  console.log(`  ${c.id}: ${c.name} | analyzed=${analyzed} | confidence=${c.analysis_confidence} | needs_review=${c.needs_review}`);
}
const notes = db.prepare("SELECT COUNT(*) as cnt FROM review_notes").get() as any;
console.log(`\nReview notes: ${notes.cnt}`);
const crossNotes = db.prepare("SELECT COUNT(*) as cnt FROM review_notes WHERE type LIKE 'cross_contract_%'").get() as any;
console.log(`Cross-contract notes: ${crossNotes.cnt}`);
closeDb();
