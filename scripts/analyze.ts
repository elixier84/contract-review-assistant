import { getDb, closeDb } from "../src/lib/db";
import { analyzeContractsBatch } from "../src/lib/claude-analyzer";

async function main() {
  console.log("=== Contract Analysis ===\n");

  // Parse optional --concurrency flag
  const concurrencyArg = process.argv.find((a) => a.startsWith("--concurrency="));
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split("=")[1], 10) : 6;

  // Parse optional --no-cross flag to skip cross-contract analysis
  const skipCross = process.argv.includes("--no-cross");

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
  console.log(`\nConcurrency: ${concurrency}, Cross-contract: ${!skipCross}\n`);

  const result = await analyzeContractsBatch(
    contracts.map((c) => c.id),
    concurrency,
    (event) => {
      // Progress events are already logged by analyzeContract
    },
    !skipCross,
  );

  console.log("\n=== Summary ===");
  console.log(`  Analyzed: ${result.succeeded}`);
  console.log(`  Failed:   ${result.failed}`);
  console.log(`  Total:    ${result.total}`);
  if (result.crossContractNotesCreated !== undefined) {
    console.log(`  Cross-contract notes: ${result.crossContractNotesCreated}`);
  }

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
