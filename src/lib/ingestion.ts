import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { extractText as extractPdfText } from "unpdf";
import pdfParse from "pdf-parse";
import { getDb } from "./db";
import { analyzePages } from "./vision-enhance";

// Portable pandoc path (no admin install needed)
const PANDOC_BIN = (() => {
  const local = path.join(process.cwd(), "tools", "pandoc-3.6.4", "pandoc.exe");
  if (fs.existsSync(local)) return `"${local}"`;
  return "pandoc"; // fallback to system PATH
})();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContractMeta {
  id: string;
  name: string;
  type: "master_tc" | "technology_license" | "side_letter" | "amendment" | "extension";
}

export interface IngestResult {
  id: string;
  fileName: string;
  status: "new" | "skipped" | "updated" | "duplicate_content" | "error";
  message: string;
}

// ---------------------------------------------------------------------------
// Hardcoded map for the 4 test contracts (backward compat)
// ---------------------------------------------------------------------------

const FILE_MAP: Record<string, ContractMeta> = {
  "MASKED_85001_Standard_T_and_C.docx": {
    id: "85001",
    name: "Standard Terms and Conditions",
    type: "master_tc",
  },
  "MASKED_85002_Pricing_Policy_Letter.docx": {
    id: "85002",
    name: "Pricing Policy Letter",
    type: "side_letter",
  },
  "MASKED_85003_Orion_Advanced_License.docx": {
    id: "85003",
    name: "Orion Advanced System License Agreement",
    type: "technology_license",
  },
  "MASKED_85004_Orion_UltraHD_License.docx": {
    id: "85004",
    name: "Orion UltraHD System License Agreement",
    type: "technology_license",
  },
};

// ---------------------------------------------------------------------------
// Utilities (cross-platform safe)
// ---------------------------------------------------------------------------

export function computeFileHash(content: Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function computeFileHashFromPath(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return computeFileHash(content);
}

interface ExtractResult {
  text: string;
  visionPages: number[];
  filePath?: string;
}

export async function extractText(filePath: string): Promise<ExtractResult> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".docx" || ext === ".doc") {
    const text = execSync(`${PANDOC_BIN} --to=plain --wrap=none "${filePath}"`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
    return { text, visionPages: [] };
  }

  if (ext === ".pdf") {
    const pdfBuffer = fs.readFileSync(filePath);
    let baseText = "";

    // Try 1: unpdf (pure JS)
    try {
      const { text } = await extractPdfText(pdfBuffer);
      const joined = text.join("\n").trim();
      if (joined.length > 50) baseText = joined;
    } catch {
      // unpdf failed
    }

    // Try 2: pdf-parse (more robust for many PDF types)
    if (!baseText) {
      try {
        const data = await pdfParse(pdfBuffer);
        if (data.text && data.text.trim().length > 50) {
          baseText = data.text.trim();
        }
      } catch {
        // pdf-parse failed
      }
    }

    // Try 3: pandoc (local portable)
    if (!baseText) {
      try {
        const pandocResult = execSync(`${PANDOC_BIN} --to=plain --wrap=none "${filePath}"`, {
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        }).trim();
        if (pandocResult.length > 50) baseText = pandocResult;
      } catch {
        // pandoc failed
      }
    }

    // Try 4: tesseract OCR (for scanned PDFs)
    if (!baseText) {
      try {
        const tesseractBin = process.platform === "win32" ? "tesseract.exe" : "tesseract";
        execSync(`${tesseractBin} --version`, { stdio: "ignore" });
        const ocrResult = execSync(`${tesseractBin} "${filePath}" stdout 2>${process.platform === "win32" ? "NUL" : "/dev/null"}`, {
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
          timeout: 300_000,
        }).trim();
        if (ocrResult.length > 0) baseText = ocrResult;
      } catch {
        // tesseract not installed or failed
      }
    }

    if (!baseText) {
      throw new Error(
        `PDF extraction failed for ${filePath}. Tried: unpdf, pdf-parse, pandoc, tesseract. ` +
        `The PDF may be scanned images only. Install tesseract for OCR support.`
      );
    }

      // Store page-level parser results (Vision runs later during analyze)
    return { text: baseText, visionPages: [], filePath };
  }

  if (ext === ".txt") {
    return { text: fs.readFileSync(filePath, "utf-8").trim(), visionPages: [] };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

// ---------------------------------------------------------------------------
// Dedup: check content hash against ALL existing contracts
// ---------------------------------------------------------------------------

export function findDuplicateByHash(db: ReturnType<typeof getDb>, fileHash: string): { id: string; name: string } | null {
  const row = db
    .prepare("SELECT id, name FROM contracts WHERE file_hash = ?")
    .get(fileHash) as { id: string; name: string } | undefined;
  return row ?? null;
}

export function findDuplicateByFilename(db: ReturnType<typeof getDb>, fileName: string): { id: string; name: string } | null {
  const row = db
    .prepare("SELECT id, name FROM contracts WHERE file_path LIKE ?")
    .get(`%${fileName}`) as { id: string; name: string } | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Contract ID derivation from filename
// ---------------------------------------------------------------------------

/**
 * Try to extract an agreement number from the filename.
 * Patterns:
 *   MASKED_85001_Name.docx  → "85001"
 *   85001_Name.docx         → "85001"
 *   Agreement_85001.docx    → "85001"
 * Falls back to auto-generated ID from max existing + 1.
 */
export function deriveContractId(fileName: string): string {
  // Match 4-6 digit number (works with underscores, hyphens, dots as delimiters)
  const match = fileName.match(/(?:^|[^0-9])(\d{4,6})(?=[^0-9]|$)/);
  if (match) return match[1];

  // Fallback: generate next sequential ID
  const db = getDb();
  const maxRow = db.prepare("SELECT MAX(CAST(id AS INTEGER)) as maxId FROM contracts WHERE id GLOB '[0-9]*'").get() as { maxId: number | null } | undefined;
  const nextId = (maxRow?.maxId ?? 89999) + 1;
  return String(nextId);
}

/**
 * Derive a human-readable name from filename.
 *   MASKED_85001_Standard_T_and_C.docx → "Standard T and C"
 */
function deriveContractName(fileName: string): string {
  const stem = path.parse(fileName).name;
  // Remove common prefixes: MASKED_, number prefixes
  const cleaned = stem
    .replace(/^MASKED_/i, "")
    .replace(/^\d{4,6}_/, "")
    .replace(/_/g, " ");
  return cleaned || stem;
}

// ---------------------------------------------------------------------------
// Upload-based ingest (for API file uploads — saves buffer to disk first)
// ---------------------------------------------------------------------------

export async function ingestFile(
  fileBuffer: Buffer,
  originalFileName: string,
  contractsDir: string,
  projectId?: number,
): Promise<IngestResult> {
  // Save uploaded file to contracts/ directory, then delegate to unified path
  const destPath = path.join(contractsDir, originalFileName);
  fs.writeFileSync(destPath, fileBuffer);
  return ingestFromPath(destPath, projectId);
}

// ---------------------------------------------------------------------------
// Ingest from filesystem path (unified path for npm run ingest + demo)
// ---------------------------------------------------------------------------

export async function ingestFromPath(filePath: string, projectId?: number): Promise<IngestResult> {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = computeFileHash(fileBuffer);
  const db = getDb();

  // Check content duplicate
  const contentDup = findDuplicateByHash(db, fileHash);
  if (contentDup) {
    return {
      id: contentDup.id,
      fileName,
      status: "skipped",
      message: `Unchanged (contract ${contentDup.id})`,
    };
  }

  // Check filename duplicate (same file, new content = update)
  const filenameDup = findDuplicateByFilename(db, fileName);
  const isUpdate = !!filenameDup;

  // Extract text
  let rawText: string;
  let visionPages: number[] = [];
  try {
    const result = await extractText(filePath);
    rawText = result.text;
    visionPages = result.visionPages;
  } catch (err) {
    return {
      id: "",
      fileName,
      status: "error",
      message: `Text extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!rawText || rawText.length < 50) {
    return {
      id: "",
      fileName,
      status: "error",
      message: "Extracted text too short — file may be empty or scanned image",
    };
  }

  // Use FILE_MAP metadata hints if available, otherwise derive from filename
  const knownMeta = FILE_MAP[fileName];
  const contractId = isUpdate ? filenameDup.id : (knownMeta?.id ?? deriveContractId(fileName));
  const contractName = knownMeta?.name ?? deriveContractName(fileName);
  const contractType = knownMeta?.type ?? "technology_license";

  db.prepare(`
    INSERT INTO contracts (id, name, type, file_path, file_hash, raw_text, project_id, status, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', 1)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      file_path = excluded.file_path,
      file_hash = excluded.file_hash,
      raw_text = excluded.raw_text,
      needs_review = 1,
      updated_at = datetime('now')
  `).run(contractId, contractName, contractType, filePath, fileHash, rawText, projectId ?? null);

  // Store page-level parser data for PDFs
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    try {
      const pageAnalysis = await analyzePages(filePath);
      const upsertPage = db.prepare(`
        INSERT INTO contract_pages (contract_id, page_number, source, text, char_count, is_empty, updated_at)
        VALUES (?, ?, 'parser', ?, ?, ?, datetime('now'))
        ON CONFLICT(contract_id, page_number) DO UPDATE SET
          source = 'parser', text = excluded.text, char_count = excluded.char_count,
          is_empty = excluded.is_empty, updated_at = datetime('now')
      `);
      const tx = db.transaction(() => {
        for (const p of pageAnalysis) {
          upsertPage.run(contractId, p.page, p.text, p.textLength, p.textLength < 100 ? 1 : 0);
        }
      });
      tx();
      const emptyCount = pageAnalysis.filter((p) => p.textLength < 100).length;
      const coverage = Math.round(((pageAnalysis.length - emptyCount) / pageAnalysis.length) * 100);
      console.log(`    Pages: ${pageAnalysis.length} total, ${emptyCount} empty → coverage ${coverage}%`);
    } catch (err) {
      console.warn(`    [Pages] Failed to store page data: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
    }
  }

  // Create Review Note if Vision was used
  if (visionPages.length > 0) {
    const pageList = visionPages.join(", ");
    db.prepare(`
      INSERT INTO review_notes (contract_id, type, category, issue, severity, is_reviewed, narrative, created_at, updated_at)
      VALUES (?, 'vision_enhanced', 'system', ?, 'medium', 0, '', datetime('now'), datetime('now'))
    `).run(
      contractId,
      `Pages ${pageList} contained image-only content (tables/figures). Text was extracted via Claude Vision OCR. Manual verification of extracted tables recommended.`,
    );
  }

  return {
    id: contractId,
    fileName,
    status: isUpdate ? "updated" : "new",
    message: isUpdate
      ? `Updated contract ${contractId} with new content`
      : `Created contract ${contractId}: ${contractName}` +
        (visionPages.length > 0 ? ` (Vision-enhanced: pages ${visionPages.join(", ")})` : ""),
  };
}

export async function ingestAllContracts(contractsDir: string, projectId?: number): Promise<IngestResult[]> {
  const files = fs.readdirSync(contractsDir).filter((f) =>
    /\.(docx|doc|pdf|txt)$/i.test(f)
  );

  if (files.length === 0) {
    console.log("No supported files found in", contractsDir);
    return [];
  }

  console.log(`Found ${files.length} file(s) in ${contractsDir}\n`);

  const results: IngestResult[] = [];
  for (const file of files) {
    const filePath = path.join(contractsDir, file);
    const result = await ingestFromPath(filePath, projectId);
    results.push(result);

    const tag = result.status === "error" ? "ERR" : result.status === "skipped" ? "SKIP" : "OK";
    const prefix = result.status === "error" ? "  [ERR]  " : result.status === "skipped" ? "  [SKIP] " : "  [OK]   ";
    console.log(`${prefix}${file}${result.id ? ` → contract ${result.id}` : ""}: ${result.message}`);
  }

  return results;
}
