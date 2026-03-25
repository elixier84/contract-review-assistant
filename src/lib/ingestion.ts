import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { extractText as extractPdfText } from "unpdf";
import { getDb } from "./db";

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

export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".docx" || ext === ".doc") {
    return execSync(`pandoc --to=plain --wrap=none "${filePath}"`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  }

  if (ext === ".pdf") {
    // Try unpdf first (pure JS, no system dependency, Node-compatible)
    try {
      const pdfBuffer = fs.readFileSync(filePath);
      const { text } = await extractPdfText(pdfBuffer);
      const joined = text.join("\n").trim();
      if (joined.length > 50) {
        return joined;
      }
    } catch {
      // unpdf failed, try pandoc
    }

    // Fallback 2: pandoc (handles some PDFs better)
    try {
      const pandocResult = execSync(`pandoc --to=plain --wrap=none "${filePath}"`, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      }).trim();
      if (pandocResult.length > 50) {
        return pandocResult;
      }
    } catch {
      // pandoc failed, try tesseract OCR
    }

    // Fallback 3: tesseract OCR (for scanned PDFs)
    try {
      execSync("which tesseract", { stdio: "ignore" });
      const ocrResult = execSync(`tesseract "${filePath}" stdout 2>/dev/null`, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300_000, // 5 min for large scanned docs
      }).trim();
      if (ocrResult.length > 0) {
        return ocrResult;
      }
    } catch {
      // tesseract not installed or failed
    }

    throw new Error(
      `PDF extraction failed for ${filePath}. Tried: unpdf, pandoc, tesseract. ` +
      `Install tesseract for scanned PDF support: brew install tesseract`
    );
  }

  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf-8").trim();
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
): Promise<IngestResult> {
  // Save uploaded file to contracts/ directory, then delegate to unified path
  const destPath = path.join(contractsDir, originalFileName);
  fs.writeFileSync(destPath, fileBuffer);
  return ingestFromPath(destPath);
}

// ---------------------------------------------------------------------------
// Ingest from filesystem path (unified path for npm run ingest + demo)
// ---------------------------------------------------------------------------

export async function ingestFromPath(filePath: string): Promise<IngestResult> {
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
  try {
    rawText = await extractText(filePath);
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
    INSERT INTO contracts (id, name, type, file_path, file_hash, raw_text, status, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, 'Active', 1)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      file_path = excluded.file_path,
      file_hash = excluded.file_hash,
      raw_text = excluded.raw_text,
      needs_review = 1,
      updated_at = datetime('now')
  `).run(contractId, contractName, contractType, filePath, fileHash, rawText);

  return {
    id: contractId,
    fileName,
    status: isUpdate ? "updated" : "new",
    message: isUpdate
      ? `Updated contract ${contractId} with new content`
      : `Created contract ${contractId}: ${contractName}`,
  };
}

export async function ingestAllContracts(contractsDir: string): Promise<IngestResult[]> {
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
    const result = await ingestFromPath(filePath);
    results.push(result);

    const tag = result.status === "error" ? "ERR" : result.status === "skipped" ? "SKIP" : "OK";
    const prefix = result.status === "error" ? "  [ERR]  " : result.status === "skipped" ? "  [SKIP] " : "  [OK]   ";
    console.log(`${prefix}${file}${result.id ? ` → contract ${result.id}` : ""}: ${result.message}`);
  }

  return results;
}
