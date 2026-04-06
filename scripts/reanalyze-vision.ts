import { analyzeContract, runCrossContractAnalysis } from "../src/lib/claude-analyzer";
import { getDb, closeDb } from "../src/lib/db";

// Re-analyze specific contracts (Vision will auto-trigger if text density is low)
// Then run cross-contract analysis for the project

const ids = process.argv.slice(2);
const projectId = 2; // Samsung project

if (ids.length === 0) {
  console.log("Usage: npx tsx scripts/reanalyze-vision.ts <contract_id1> <contract_id2> ...");
  process.exit(1);
}

async function main() {
  console.log(`=== Re-analyzing ${ids.length} contracts with Vision enhancement ===\n`);

  for (const id of ids) {
    console.log(`--- Contract ${id} ---`);
    try {
      await analyzeContract(id);
      const db = getDb();
      const r = db.prepare("SELECT analysis_confidence, LENGTH(raw_text) as textLen FROM contracts WHERE id = ?").get(id) as { analysis_confidence: number | null; textLen: number } | undefined;
      console.log(`  Result: ${r?.analysis_confidence ? (r.analysis_confidence * 100).toFixed(0) + "%" : "?"} confidence, ${r?.textLen} chars`);
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
    }
    console.log();
  }

  console.log("=== Running Cross-Contract Analysis ===");
  try {
    const notes = await runCrossContractAnalysis(undefined, projectId);
    console.log(`Cross-contract notes created: ${notes}`);
  } catch (err) {
    console.error(`Cross-contract failed: ${err instanceof Error ? err.message : err}`);
  }

  closeDb();
  console.log("\nDone.");
}

main().catch(err => {
  console.error(err);
  closeDb();
  process.exit(1);
});
