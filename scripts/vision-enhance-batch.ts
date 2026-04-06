import { enhancePdfWithVision } from "../src/lib/vision-enhance";
import { getDb, closeDb } from "../src/lib/db";

// Usage: npx tsx scripts/vision-enhance-batch.ts [contract_ids...]
// If no IDs given, processes all contracts with low text extraction

async function main() {
  const db = getDb();
  const args = process.argv.slice(2);

  let contracts: { id: string; file_path: string; raw_text: string; name: string }[];

  if (args.length > 0) {
    contracts = args.map(id =>
      db.prepare("SELECT id, file_path, raw_text, name FROM contracts WHERE id = ?").get(id)
    ).filter(Boolean) as typeof contracts;
  } else {
    // Find contracts with suspiciously short text relative to their page count
    contracts = db.prepare(
      "SELECT id, file_path, raw_text, name FROM contracts WHERE LENGTH(raw_text) < 2000 AND raw_text IS NOT NULL ORDER BY id"
    ).all() as typeof contracts;
  }

  if (contracts.length === 0) {
    console.log("No contracts to enhance.");
    closeDb();
    return;
  }

  console.log(`=== Vision Enhancement ===`);
  console.log(`Processing ${contracts.length} contract(s)\n`);

  for (const c of contracts) {
    console.log(`--- ${c.id}: ${c.name?.slice(0, 50)} ---`);
    console.log(`  Current text: ${c.raw_text?.length || 0} chars`);

    try {
      const result = await enhancePdfWithVision(c.file_path, c.raw_text);

      if (result.visionPages.length > 0) {
        db.prepare("UPDATE contracts SET raw_text = ?, updated_at = datetime('now') WHERE id = ?")
          .run(result.text, c.id);

        // Add review note
        db.prepare(`
          INSERT INTO review_notes (contract_id, type, issue, severity, is_reviewed, narrative, created_at, updated_at)
          VALUES (?, 'vision_enhanced', ?, 'medium', 0, '', datetime('now'), datetime('now'))
        `).run(
          c.id,
          `Pages ${result.visionPages.join(", ")} enhanced via Claude Vision OCR. Manual verification recommended.`,
        );

        console.log(`  Enhanced: ${result.text.length} chars (+${result.text.length - (c.raw_text?.length || 0)})`);
        console.log(`  Vision pages: [${result.visionPages.join(", ")}]`);
      } else {
        console.log("  No suspect pages found — skipped.");
      }
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
    }
    console.log();
  }

  closeDb();
  console.log("Done.");
}

main().catch(err => {
  console.error(err);
  closeDb();
  process.exit(1);
});
