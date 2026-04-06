import { ingestFromPath } from "../src/lib/ingestion";

async function main() {
  console.log("Starting re-ingest of AGR1512703 with Vision enhancement...\n");
  const result = await ingestFromPath(
    "contracts/AGR1512703 - Fully Signed.pdf",
  );
  console.log("\nResult:", JSON.stringify(result, null, 2));

  // Check if pricing data is now in raw_text
  const { getDb } = await import("../src/lib/db");
  const db = getDb();
  const row = db
    .prepare("SELECT LENGTH(raw_text) as len FROM contracts WHERE id = ?")
    .get(result.id) as { len: number } | undefined;
  console.log("\nRaw text length:", row?.len);

  // Check for Vision markers
  const raw = db
    .prepare("SELECT raw_text FROM contracts WHERE id = ?")
    .get(result.id) as { raw_text: string } | undefined;
  if (raw?.raw_text) {
    const visionMarkers = raw.raw_text.match(/\[Vision-Enhanced Page \d+\]/g);
    console.log("Vision markers found:", visionMarkers || "none");

    // Check for pricing amounts
    const amounts = ["$1.20", "$0.95", "$0.90", "$0.85", "$0.80"];
    for (const a of amounts) {
      console.log(`  ${a}: ${raw.raw_text.includes(a) ? "FOUND" : "MISSING"}`);
    }
  }

  // Check review notes
  const notes = db
    .prepare(
      "SELECT type, issue FROM review_notes WHERE contract_id = ? AND type = 'vision_enhanced'",
    )
    .all(result.id);
  console.log("\nVision review notes:", notes.length);
}

main().catch(console.error);
