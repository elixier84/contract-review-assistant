import { execSync, exec } from "child_process";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageAnalysis {
  page: number;
  textLength: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Tool paths
// ---------------------------------------------------------------------------

const POPPLER_BIN = (() => {
  const local = path.join(process.cwd(), "tools", "poppler-24.08.0", "Library", "bin", "pdftoppm.exe");
  if (fs.existsSync(local)) return local;
  return "pdftoppm"; // fallback to system PATH
})();

// ---------------------------------------------------------------------------
// Step 2: Analyze pages — per-page text length via pdfjs-dist
// ---------------------------------------------------------------------------

export async function analyzePages(filePath: string): Promise<PageAnalysis[]> {
  // Use pdf-parse with custom pagerender to get per-page text
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const pdfBuffer = fs.readFileSync(filePath);

  const pageTexts: string[] = [];
  const options = {
    pagerender: (pageData: { getTextContent: () => Promise<{ items: { str: string }[] }> }) => {
      return pageData.getTextContent().then((textContent: { items: { str: string }[] }) => {
        const text = textContent.items.map((item) => item.str).join(" ");
        pageTexts.push(text);
        return text;
      });
    },
  };

  await pdfParse(pdfBuffer, options);

  return pageTexts.map((text, i) => ({
    page: i + 1,
    textLength: text.length,
    text,
  }));
}

// ---------------------------------------------------------------------------
// Step 3: Identify suspect pages (two triggers)
// ---------------------------------------------------------------------------

const TABLE_KEYWORDS = /schedule|appendix|table|royalt|pricing|fee|rate|tariff/i;
const NUMBER_PATTERN = /\$[\d,.]+|[\d,]+\s*[-–—]\s*[\d,]+/g;

/**
 * Identify pages that need Vision OCR.
 * Any page with fewer than 100 characters of parser-extracted text
 * is considered empty/scanned and needs OCR. No page cap — contract
 * completeness is non-negotiable for compliance audits.
 */
export function identifySuspectPages(
  pageAnalysis: PageAnalysis[],
): number[] {
  if (pageAnalysis.length === 0) return [];

  const EMPTY_THRESHOLD = 100; // chars — below this, page is unreadable
  const suspects = new Set<number>();

  for (const p of pageAnalysis) {
    // Primary trigger: page has insufficient text (scanned image, blank, etc.)
    if (p.textLength < EMPTY_THRESHOLD) {
      suspects.add(p.page);
      continue;
    }

    // Secondary trigger: table keyword present but numbers missing
    // (indicates a pricing/schedule table rendered as image)
    if (TABLE_KEYWORDS.test(p.text)) {
      const numberMatches = p.text.match(NUMBER_PATTERN);
      const numberCount = numberMatches?.length ?? 0;
      if (numberCount < 3) {
        suspects.add(p.page);
      }
    }
  }

  const sorted = [...suspects].sort((a, b) => a - b);
  return sorted;
}

// ---------------------------------------------------------------------------
// Step 4: Convert suspect pages to PNG images via pdftoppm
// ---------------------------------------------------------------------------

export function convertPagesToImages(
  filePath: string,
  pages: number[],
): { page: number; imagePath: string }[] {
  const tmpDir = path.join(process.cwd(), "tools", "tmp_vision");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const results: { page: number; imagePath: string }[] = [];

  for (const pageNum of pages) {
    const prefix = path.join(tmpDir, `p${pageNum}`);
    try {
      execSync(
        `"${POPPLER_BIN}" -png -r 200 -f ${pageNum} -l ${pageNum} "${filePath}" "${prefix}"`,
        { timeout: 30_000, stdio: "ignore" },
      );

      // pdftoppm outputs with zero-padded page numbers: p2-02.png, p10-10.png
      // Try multiple patterns to find the output file
      const padded = String(pageNum).padStart(2, "0");
      const candidates = [
        `${prefix}-${padded}.png`,     // p2-02.png (common for single-digit pages)
        `${prefix}-${pageNum}.png`,    // p10-10.png (common for 2+ digit pages)
        `${prefix}.png`,               // p2.png (single page fallback)
      ];

      const outputFile = candidates.find((f) => fs.existsSync(f)) ?? null;

      if (outputFile) {
        results.push({ page: pageNum, imagePath: outputFile });
      }
    } catch {
      // pdftoppm failed for this page, skip
      console.warn(`[Vision] pdftoppm failed for page ${pageNum} of ${filePath}`);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Step 5: Extract text from images via Claude Vision
// ---------------------------------------------------------------------------

export function extractWithVision(
  pageImages: { page: number; imagePath: string }[],
): { page: number; text: string }[] {
  const results: { page: number; text: string }[] = [];
  const tmpDir = path.join(process.cwd(), "tools", "tmp_vision");

  for (const { page, imagePath } of pageImages) {
    try {
      const absDir = path.dirname(path.resolve(imagePath));
      const fileName = path.basename(imagePath);

      // Write prompt to a temp file to avoid shell quoting issues on Windows
      const promptFile = path.join(tmpDir, `prompt_p${page}.txt`);
      const absImagePath = path.resolve(imagePath).replace(/\\/g, "/");
      const prompt = [
        `Read the file at ${absImagePath}.`,
        `Extract ALL text content from this document page image.`,
        `For tables, format them as plain text with columns separated by " | ".`,
        `Preserve all numbers, currency symbols, and formatting exactly.`,
        `Output ONLY the extracted text, no commentary.`,
      ].join(" ");
      fs.writeFileSync(promptFile, prompt, "utf-8");

      const cwd = process.cwd().replace(/\\/g, "/");
      const stdout = execSync(
        `claude --print --model sonnet --add-dir "${cwd}" --allowedTools "Read" < "${promptFile}"`,
        {
          encoding: "utf-8",
          maxBuffer: 5 * 1024 * 1024,
          timeout: 120_000,
          shell: "bash",
        },
      ).trim();

      // Cleanup prompt file
      try { fs.unlinkSync(promptFile); } catch { /* ignore */ }

      if (stdout.length > 20) {
        results.push({ page, text: stdout });
        console.log(`[Vision] Page ${page}: extracted ${stdout.length} chars`);
      }
    } catch (err) {
      console.warn(`[Vision] Claude Vision failed for page ${page}:`, err instanceof Error ? err.message.slice(0, 150) : err);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Step 5b: Extract text from images via Claude Vision — PARALLEL
// ---------------------------------------------------------------------------

function visionExtractOne(page: number, imagePath: string): Promise<{ page: number; text: string } | null> {
  return new Promise((resolve) => {
    const tmpDir = path.join(process.cwd(), "tools", "tmp_vision");
    const promptFile = path.join(tmpDir, `prompt_p${page}.txt`);
    const absImagePath = path.resolve(imagePath).replace(/\\/g, "/");
    const prompt = [
      `Read the file at ${absImagePath}.`,
      `Extract ALL text content from this document page image.`,
      `For tables, format them as plain text with columns separated by " | ".`,
      `Preserve all numbers, currency symbols, and formatting exactly.`,
      `Output ONLY the extracted text, no commentary.`,
    ].join(" ");
    fs.writeFileSync(promptFile, prompt, "utf-8");

    const cwd = process.cwd().replace(/\\/g, "/");
    const cmd = `claude --print --model sonnet --add-dir "${cwd}" --allowedTools "Read" < "${promptFile}"`;

    exec(cmd, { encoding: "utf-8", maxBuffer: 5 * 1024 * 1024, timeout: 120_000, shell: "bash" }, (err, stdout) => {
      try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
      if (err || !stdout || stdout.trim().length <= 20) {
        console.warn(`[Vision‖] Page ${page}: failed`);
        resolve(null);
        return;
      }
      const text = stdout.trim();
      console.log(`[Vision‖] Page ${page}: extracted ${text.length} chars`);
      resolve({ page, text });
    });
  });
}

export async function extractWithVisionParallel(
  pageImages: { page: number; imagePath: string }[],
  concurrency = 4,
): Promise<{ page: number; text: string }[]> {
  const results: { page: number; text: string }[] = [];
  const queue = [...pageImages];

  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const batchResults = await Promise.all(
      batch.map(({ page, imagePath }) => visionExtractOne(page, imagePath)),
    );
    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  return results.sort((a, b) => a.page - b.page);
}

// ---------------------------------------------------------------------------
// Step 6: Merge base text with Vision-enhanced text
// ---------------------------------------------------------------------------

export function mergeTexts(
  baseText: string,
  pageAnalysis: PageAnalysis[],
  visionTexts: { page: number; text: string }[],
): string {
  if (visionTexts.length === 0) return baseText;

  // Build page-boundary map from pageAnalysis
  // Approximate: split baseText proportionally by page text lengths
  const totalLen = pageAnalysis.reduce((s, p) => s + p.textLength, 0);
  let cursor = 0;
  const pageOffsets: { page: number; start: number; end: number }[] = [];

  for (const p of pageAnalysis) {
    const ratio = totalLen > 0 ? p.textLength / totalLen : 1 / pageAnalysis.length;
    const segmentLen = Math.round(baseText.length * ratio);
    pageOffsets.push({ page: p.page, start: cursor, end: cursor + segmentLen });
    cursor += segmentLen;
  }

  // For each vision result, append after the corresponding page segment
  let result = baseText;
  // Process in reverse order to preserve offsets
  const sorted = [...visionTexts].sort((a, b) => b.page - a.page);

  for (const vt of sorted) {
    const offset = pageOffsets.find((o) => o.page === vt.page);
    if (offset) {
      const insertPos = Math.min(offset.end, result.length);
      const marker = `\n\n[Vision-Enhanced Page ${vt.page}]\n${vt.text}\n[/Vision-Enhanced Page ${vt.page}]\n\n`;
      result = result.slice(0, insertPos) + marker + result.slice(insertPos);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cleanup: remove temporary image files
// ---------------------------------------------------------------------------

export function cleanupVisionTemp(): void {
  const tmpDir = path.join(process.cwd(), "tools", "tmp_vision");
  if (fs.existsSync(tmpDir)) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator: enhance PDF text extraction with Vision
// ---------------------------------------------------------------------------

export interface EnhanceResult {
  text: string;
  visionPages: number[];
  pageAnalysis: PageAnalysis[];
  visionTexts: { page: number; text: string }[];
  totalPages: number;
  parserPages: number;
  coverage: number; // 0-100
}

export async function enhancePdfWithVision(
  filePath: string,
  baseText: string,
): Promise<EnhanceResult> {
  const emptyResult = (pageAnalysis: PageAnalysis[]): EnhanceResult => ({
    text: baseText,
    visionPages: [],
    pageAnalysis,
    visionTexts: [],
    totalPages: pageAnalysis.length,
    parserPages: pageAnalysis.filter((p) => p.textLength >= 100).length,
    coverage: pageAnalysis.length > 0
      ? Math.round((pageAnalysis.filter((p) => p.textLength >= 100).length / pageAnalysis.length) * 100)
      : 0,
  });

  try {
    // Step 2: Analyze pages
    const pageAnalysis = await analyzePages(filePath);

    // Step 3: Identify pages needing OCR (no page cap)
    const suspectPages = identifySuspectPages(pageAnalysis);

    if (suspectPages.length === 0) {
      return { ...emptyResult(pageAnalysis), coverage: 100 };
    }

    console.log(`[Vision] ${path.basename(filePath)}: ${suspectPages.length}/${pageAnalysis.length} pages need OCR: [${suspectPages.join(", ")}]`);

    // Step 4: Convert to images
    const pageImages = convertPagesToImages(filePath, suspectPages);

    if (pageImages.length === 0) {
      return emptyResult(pageAnalysis);
    }

    // Step 5: Extract with Vision
    const visionTexts = extractWithVision(pageImages);

    // Step 6: Merge
    const mergedText = mergeTexts(baseText, pageAnalysis, visionTexts);

    // Cleanup temp images
    cleanupVisionTemp();

    // Calculate final coverage
    const visionPageSet = new Set(visionTexts.map((v) => v.page));
    const readablePages = pageAnalysis.filter(
      (p) => p.textLength >= 100 || visionPageSet.has(p.page),
    ).length;
    const coverage = pageAnalysis.length > 0
      ? Math.round((readablePages / pageAnalysis.length) * 100)
      : 0;

    return {
      text: mergedText,
      visionPages: visionTexts.map((v) => v.page),
      pageAnalysis,
      visionTexts,
      totalPages: pageAnalysis.length,
      parserPages: pageAnalysis.filter((p) => p.textLength >= 100).length,
      coverage,
    };
  } catch (err) {
    console.warn(`[Vision] Enhancement failed for ${filePath}:`, err instanceof Error ? err.message : err);
    return emptyResult([]);
  }
}
