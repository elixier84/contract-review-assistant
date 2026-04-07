/**
 * reextract-parallel.ts
 * Same as reextract.ts but uses parallel Vision OCR.
 *
 * Usage: npx tsx scripts/reextract-parallel.ts <contract_id> [--concurrency N]
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  analyzePages,
  identifySuspectPages,
  convertPagesToImages,
  extractWithVisionParallel,
  cleanupVisionTemp,
  type PageAnalysis,
} from "../src/lib/vision-enhance";

const dbPath = path.join(process.cwd(), "data", "contracts.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

function saveParserPages(contractId: string, pageAnalysis: PageAnalysis[]): void {
  const upsert = db.prepare(`
    INSERT INTO contract_pages (contract_id, page_number, source, text, char_count, is_empty, updated_at)
    VALUES (?, ?, 'parser', ?, ?, ?, datetime('now'))
    ON CONFLICT(contract_id, page_number) DO UPDATE SET
      source = CASE WHEN excluded.char_count > char_count THEN excluded.source ELSE source END,
      text = CASE WHEN excluded.char_count > char_count THEN excluded.text ELSE text END,
      char_count = CASE WHEN excluded.char_count > char_count THEN excluded.char_count ELSE char_count END,
      is_empty = CASE WHEN excluded.char_count > char_count THEN excluded.is_empty ELSE is_empty END,
      updated_at = datetime('now')
  `);
  const tx = db.transaction(() => {
    for (const p of pageAnalysis) {
      upsert.run(contractId, p.page, p.text, p.textLength, p.textLength < 100 ? 1 : 0);
    }
  });
  tx();
}

function saveVisionPages(contractId: string, visionTexts: { page: number; text: string }[]): void {
  const upsert = db.prepare(`
    INSERT INTO contract_pages (contract_id, page_number, source, text, char_count, is_empty, updated_at)
    VALUES (?, ?, 'vision', ?, ?, 0, datetime('now'))
    ON CONFLICT(contract_id, page_number) DO UPDATE SET
      source = 'vision', text = excluded.text, char_count = excluded.char_count, is_empty = 0, updated_at = datetime('now')
  `);
  const tx = db.transaction(() => {
    for (const vt of visionTexts) {
      upsert.run(contractId, vt.page, vt.text, vt.text.length);
    }
  });
  tx();
}

function updateRawTextFromPages(contractId: string): void {
  const pages = db.prepare(
    "SELECT page_number, source, text, char_count FROM contract_pages WHERE contract_id = ? ORDER BY page_number"
  ).all(contractId) as { page_number: number; source: string; text: string; char_count: number }[];

  let fullText = "";
  for (const p of pages) {
    if (p.char_count > 0) {
      if (p.source === "vision") {
        fullText += `\n\n[Page ${p.page_number} — Vision OCR]\n${p.text}\n[/Page ${p.page_number}]\n`;
      } else {
        fullText += `\n\n[Page ${p.page_number}]\n${p.text}\n[/Page ${p.page_number}]\n`;
      }
    }
  }
  db.prepare("UPDATE contracts SET raw_text = ?, updated_at = datetime('now') WHERE id = ?")
    .run(fullText.trim(), contractId);
  console.log(`  Updated raw_text: ${fullText.length} chars (from ${pages.length} pages)`);
}

function printCoverageReport(contractId: string): void {
  const pages = db.prepare(
    "SELECT page_number, source, char_count, is_empty FROM contract_pages WHERE contract_id = ? ORDER BY page_number"
  ).all(contractId) as { page_number: number; source: string; char_count: number; is_empty: number }[];

  const total = pages.length;
  const readable = pages.filter((p) => !p.is_empty).length;
  const parserPages = pages.filter((p) => p.source === "parser" && !p.is_empty);
  const visionPages = pages.filter((p) => p.source === "vision");
  const emptyPages = pages.filter((p) => p.is_empty);
  const coverage = total > 0 ? Math.round((readable / total) * 100) : 0;

  console.log(`\n${"─".repeat(50)}`);
  console.log(`COVERAGE REPORT: ${contractId}`);
  console.log(`${"─".repeat(50)}`);
  console.log(`  Total pages:     ${total}`);
  console.log(`  Parser readable: ${parserPages.length}`);
  console.log(`  Vision OCR:      ${visionPages.length}`);
  console.log(`  Still empty:     ${emptyPages.length}${emptyPages.length ? ` → [${emptyPages.map((p) => p.page_number).join(", ")}]` : ""}`);
  console.log(`  Coverage:        ${readable}/${total} (${coverage}%)`);
  console.log(`${"─".repeat(50)}`);
}

async function reextractParallel(contractId: string, concurrency: number): Promise<void> {
  const row = db.prepare("SELECT id, name, file_path FROM contracts WHERE id = ?").get(contractId) as {
    id: string; name: string; file_path: string;
  } | undefined;

  if (!row || !row.file_path || !fs.existsSync(row.file_path)) {
    console.error(`Contract ${contractId} not found or file missing`);
    return;
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Re-extracting (PARALLEL ×${concurrency}): ${row.id} | ${row.name}`);
  console.log(`${"=".repeat(70)}`);

  const t0 = Date.now();

  console.log(`\n[1/4] Analyzing pages with parser...`);
  const pageAnalysis = await analyzePages(row.file_path);
  console.log(`  Total: ${pageAnalysis.length} pages, parser-readable: ${pageAnalysis.filter((p) => p.textLength >= 100).length}`);
  saveParserPages(row.id, pageAnalysis);

  console.log(`\n[2/4] Identifying pages needing OCR...`);
  const suspectPages = identifySuspectPages(pageAnalysis);
  console.log(`  Pages needing OCR: ${suspectPages.length}`);

  if (suspectPages.length === 0) {
    updateRawTextFromPages(row.id);
    printCoverageReport(row.id);
    console.log(`\n⏱  Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  console.log(`\n[3/4] Running Vision OCR (${concurrency} parallel)...`);
  const pageImages = convertPagesToImages(row.file_path, suspectPages);
  console.log(`  Converted ${pageImages.length} pages to images.`);

  const visionTexts = await extractWithVisionParallel(pageImages, concurrency);
  console.log(`  Vision extracted: ${visionTexts.length}/${suspectPages.length} pages`);
  saveVisionPages(row.id, visionTexts);

  cleanupVisionTemp();

  console.log(`\n[4/4] Rebuilding full text...`);
  updateRawTextFromPages(row.id);
  printCoverageReport(row.id);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n⏱  Total time: ${elapsed}s`);
}

// CLI
const args = process.argv.slice(2);
const contractId = args[0];
const concIdx = args.indexOf("--concurrency");
const concurrency = concIdx >= 0 && args[concIdx + 1] ? Number(args[concIdx + 1]) : 4;

if (!contractId) {
  console.log("Usage: npx tsx scripts/reextract-parallel.ts <contract_id> [--concurrency N]");
  process.exit(1);
}

// Clear existing data for clean comparison
db.prepare("DELETE FROM contract_pages WHERE contract_id = ?").run(contractId);

reextractParallel(contractId, concurrency).then(() => db.close());
