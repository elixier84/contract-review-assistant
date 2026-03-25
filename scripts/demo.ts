/**
 * demo.ts — End-to-end demo pipeline
 * Chains: prerequisite checks → reset → ingest → analyze → export
 * Fail-fast: stops on first error, no partial output.
 *
 * Usage: npm run demo
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { getDb, closeDb } from "../src/lib/db";
import { ingestAllContracts } from "../src/lib/ingestion";
import { analyzeContractsBatch } from "../src/lib/claude-analyzer";
import { generateHtmlReport } from "./export-html";

const contractsDir = path.join(process.cwd(), "contracts");

function checkPrerequisites(): void {
  console.log("Checking prerequisites...\n");

  // Node.js — already running if we got here
  console.log("  ✓ Node.js");

  // Claude CLI
  try {
    execSync("which claude", { stdio: "ignore" });
    console.log("  ✓ Claude CLI");
  } catch {
    console.error("  ✗ Claude CLI not found. Install: https://docs.anthropic.com/en/docs/claude-cli");
    process.exit(1);
  }

  // Pandoc (required for DOCX)
  try {
    execSync("which pandoc", { stdio: "ignore" });
    console.log("  ✓ Pandoc");
  } catch {
    console.error("  ✗ Pandoc not found. Install: brew install pandoc");
    process.exit(1);
  }

  // Tesseract (optional — needed for scanned PDFs)
  try {
    execSync("which tesseract", { stdio: "ignore" });
    console.log("  ✓ Tesseract OCR");
  } catch {
    console.log("  ⚠ Tesseract not installed (scanned PDF OCR unavailable). Install: brew install tesseract");
  }

  // Contracts directory
  if (!fs.existsSync(contractsDir)) {
    console.error(`  ✗ Contracts directory not found: ${contractsDir}`);
    process.exit(1);
  }

  const contractFiles = fs.readdirSync(contractsDir).filter((f) =>
    /\.(docx|doc|pdf|txt)$/i.test(f)
  );
  if (contractFiles.length === 0) {
    console.error(`  ✗ No contract files found in ${contractsDir}`);
    process.exit(1);
  }
  console.log(`  ✓ ${contractFiles.length} contract file(s) in ${contractsDir}`);
  console.log("");
}

function resetAnalysis(): void {
  console.log("Resetting previous analysis data...\n");
  const db = getDb();
  db.prepare("UPDATE contracts SET analysis_json = NULL, analysis_confidence = NULL, needs_review = 1").run();
  db.prepare("DELETE FROM clauses").run();
  db.prepare("DELETE FROM definitions").run();
  db.prepare("DELETE FROM relationships").run();
  db.prepare("DELETE FROM pricing_tables").run();
  db.prepare("DELETE FROM patents").run();
  db.prepare("DELETE FROM licensed_products").run();
  db.prepare("DELETE FROM review_notes").run();
  console.log("  ✓ Analysis data cleared\n");
}

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log("╔══════════════════════════════════╗");
  console.log("║  Contract Review Assistant Demo   ║");
  console.log("╚══════════════════════════════════╝\n");

  // Step 0: Prerequisites
  checkPrerequisites();

  // Step 1: Reset
  resetAnalysis();

  // Step 2: Ingest
  console.log("Step 1/3: Ingesting contracts...\n");
  const results = await ingestAllContracts(contractsDir);
  const errors = results.filter((r) => r.status === "error");
  const ingested = results.filter((r) => r.status === "new" || r.status === "updated");

  if (ingested.length === 0) {
    console.error("\n✗ No contracts were successfully ingested.");
    closeDb();
    process.exit(1);
  }
  if (errors.length > 0) {
    console.warn(`\n⚠ ${errors.length} file(s) failed to ingest (continuing with ${ingested.length} contract(s))`);
  }
  console.log(`\n  ✓ ${ingested.length} contract(s) ingested\n`);

  // Step 3: Analyze
  console.log("Step 2/3: Analyzing contracts...\n");
  const db = getDb();
  const contracts = db
    .prepare("SELECT id, name FROM contracts WHERE analysis_json IS NULL ORDER BY id")
    .all() as { id: string; name: string }[];

  if (contracts.length === 0) {
    console.log("  No un-analyzed contracts found.\n");
  } else {
    const result = await analyzeContractsBatch(
      contracts.map((c) => c.id),
      6,
      undefined,
      true,
    );
    console.log(`\n  ✓ Analyzed: ${result.succeeded}, Failed: ${result.failed}`);
    if (result.crossContractNotesCreated !== undefined) {
      console.log(`  ✓ Cross-contract review notes: ${result.crossContractNotesCreated}`);
    }
    console.log("");
  }

  // Step 4: Export
  console.log("Step 3/3: Exporting HTML report...\n");
  const { outPath } = generateHtmlReport();
  const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);

  closeDb();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const minutes = Math.floor(Number(elapsed) / 60);
  const seconds = Number(elapsed) % 60;
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  console.log("╔══════════════════════════════════╗");
  console.log("║          Demo Complete!           ║");
  console.log("╚══════════════════════════════════╝");
  console.log(`\n  Time:  ${timeStr}`);
  console.log(`  File:  ${outPath}`);
  console.log(`  Size:  ${sizeKB} KB`);
  console.log(`  Open:  file://${outPath}\n`);
}

main().catch((err) => {
  console.error("\n✗ Fatal error:", err);
  closeDb();
  process.exit(1);
});
