/**
 * reextract.ts
 * Re-extract contract text with full Vision OCR coverage.
 * Populates contract_pages table with page-level data.
 *
 * Usage: npx tsx scripts/reextract.ts <contract_id>
 *        npx tsx scripts/reextract.ts --project <id>
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  analyzePages,
  identifySuspectPages,
  convertPagesToImages,
  extractWithVision,
  mergeTexts,
  cleanupVisionTemp,
  type PageAnalysis,
} from "../src/lib/vision-enhance";

const dbPath = path.join(process.cwd(), "data", "contracts.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// ---------------------------------------------------------------------------
// Step 1: Save parser page-level data to contract_pages
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Step 2: Save Vision-enhanced page data
// ---------------------------------------------------------------------------

function saveVisionPages(contractId: string, visionTexts: { page: number; text: string }[]): void {
  const upsert = db.prepare(`
    INSERT INTO contract_pages (contract_id, page_number, source, text, char_count, is_empty, updated_at)
    VALUES (?, ?, 'vision', ?, ?, 0, datetime('now'))
    ON CONFLICT(contract_id, page_number) DO UPDATE SET
      source = 'vision',
      text = excluded.text,
      char_count = excluded.char_count,
      is_empty = 0,
      updated_at = datetime('now')
  `);

  const tx = db.transaction(() => {
    for (const vt of visionTexts) {
      upsert.run(contractId, vt.page, vt.text, vt.text.length);
    }
  });
  tx();
}

// ---------------------------------------------------------------------------
// Main: re-extract a single contract
// ---------------------------------------------------------------------------

async function reextractContract(contractId: string): Promise<void> {
  const row = db.prepare("SELECT id, name, file_path, raw_text FROM contracts WHERE id = ?").get(contractId) as {
    id: string; name: string; file_path: string; raw_text: string;
  } | undefined;

  if (!row) {
    console.error(`Contract ${contractId} not found`);
    return;
  }

  if (!row.file_path || !fs.existsSync(row.file_path)) {
    console.error(`File not found: ${row.file_path}`);
    return;
  }

  const ext = path.extname(row.file_path).toLowerCase();
  if (ext !== ".pdf") {
    console.log(`${contractId}: Not a PDF (${ext}), skipping Vision. Parser-only.`);
    return;
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Re-extracting: ${row.id} | ${row.name}`);
  console.log(`File: ${row.file_path}`);
  console.log(`${"=".repeat(70)}`);

  // Step 1: Analyze pages with parser
  console.log(`\n[1/4] Analyzing pages with parser...`);
  const pageAnalysis = await analyzePages(row.file_path);
  const totalPages = pageAnalysis.length;
  const parserReadable = pageAnalysis.filter((p) => p.textLength >= 100).length;
  const parserCoverage = Math.round((parserReadable / totalPages) * 100);

  console.log(`  Total pages: ${totalPages}`);
  console.log(`  Parser-readable: ${parserReadable}/${totalPages} (${parserCoverage}%)`);

  // Save parser results to contract_pages
  saveParserPages(row.id, pageAnalysis);
  console.log(`  Saved to contract_pages table.`);

  // Step 2: Identify pages needing Vision OCR
  console.log(`\n[2/4] Identifying pages needing OCR...`);
  const suspectPages = identifySuspectPages(pageAnalysis);
  console.log(`  Pages needing OCR: ${suspectPages.length}`);

  if (suspectPages.length === 0) {
    console.log(`  ✅ Full parser coverage — no Vision needed.`);
    updateRawTextFromPages(row.id);
    printCoverageReport(row.id);
    return;
  }

  console.log(`  Pages: [${suspectPages.join(", ")}]`);

  // Step 3: Convert to images and run Vision OCR
  console.log(`\n[3/4] Running Vision OCR on ${suspectPages.length} pages...`);
  const pageImages = convertPagesToImages(row.file_path, suspectPages);
  console.log(`  Converted ${pageImages.length} pages to images.`);

  if (pageImages.length === 0) {
    console.error(`  ❌ Failed to convert any pages to images.`);
    updateRawTextFromPages(row.id);
    printCoverageReport(row.id);
    return;
  }

  const visionTexts = extractWithVision(pageImages);
  console.log(`  Vision extracted: ${visionTexts.length}/${suspectPages.length} pages`);

  // Save Vision results to contract_pages
  saveVisionPages(row.id, visionTexts);
  console.log(`  Saved Vision pages to contract_pages table.`);

  // Cleanup
  cleanupVisionTemp();

  // Step 4: Rebuild raw_text from page data and update contract
  console.log(`\n[4/4] Rebuilding full text from page data...`);
  updateRawTextFromPages(row.id);

  printCoverageReport(row.id);
}

// ---------------------------------------------------------------------------
// Rebuild raw_text from contract_pages (authoritative source)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Coverage report
// ---------------------------------------------------------------------------

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

  if (coverage >= 90) {
    console.log(`  ✅ Coverage adequate for analysis`);
  } else if (coverage >= 70) {
    console.log(`  ⚠️  Coverage marginal — some content may be missing`);
  } else {
    console.log(`  ❌ Coverage insufficient — analysis unreliable`);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("Usage: npx tsx scripts/reextract.ts <contract_id>");
  console.log("       npx tsx scripts/reextract.ts --project <id>");
  process.exit(1);
}

if (args[0] === "--project" && args[1]) {
  const projectId = Number(args[1]);
  const contracts = db.prepare("SELECT id FROM contracts WHERE project_id = ? ORDER BY id").all(projectId) as { id: string }[];
  console.log(`Project ${projectId}: ${contracts.length} contracts to re-extract`);

  (async () => {
    for (const c of contracts) {
      await reextractContract(c.id);
    }
    db.close();
  })();
} else {
  const contractId = args[0];
  reextractContract(contractId).then(() => db.close());
}
