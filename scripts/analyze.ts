import { getDb, closeDb } from "../src/lib/db";
import { analyzeContract } from "../src/lib/claude-analyzer";

async function main() {
  console.log("=== Contract Analysis ===\n");

  const db = getDb();

  const contracts = db
    .prepare("SELECT id, name FROM contracts WHERE analysis_json IS NULL ORDER BY id")
    .all() as { id: string; name: string }[];

  if (contracts.length === 0) {
    console.log("No un-analyzed contracts found. All contracts have been analyzed.");
    closeDb();
    return;
  }

  console.log(`Found ${contracts.length} contract(s) to analyze:`);
  for (const c of contracts) {
    console.log(`  - ${c.id}: ${c.name}`);
  }

  let succeeded = 0;
  let failed = 0;

  for (const contract of contracts) {
    try {
      await analyzeContract(contract.id);
      succeeded++;
    } catch (err) {
      console.error(`\n  FAILED to analyze ${contract.id}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log("\n=== Summary ===");
  console.log(`  Analyzed: ${succeeded}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total:    ${contracts.length}`);

  // Show final state
  const results = db
    .prepare("SELECT id, name, analysis_confidence, needs_review FROM contracts ORDER BY id")
    .all() as { id: string; name: string; analysis_confidence: number | null; needs_review: number }[];

  console.log("\n=== Contract Status ===");
  for (const r of results) {
    const conf = r.analysis_confidence !== null ? r.analysis_confidence.toFixed(2) : "N/A";
    const review = r.needs_review ? "YES" : "no";
    console.log(`  ${r.id}: ${r.name} — confidence: ${conf}, needs_review: ${review}`);
  }

  closeDb();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  closeDb();
  process.exit(1);
});
