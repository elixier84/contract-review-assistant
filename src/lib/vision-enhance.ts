import { execSync } from "child_process";
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

export function identifySuspectPages(
  pageAnalysis: PageAnalysis[],
  maxPages = 15,
): number[] {
  if (pageAnalysis.length === 0) return [];

  const avgLen =
    pageAnalysis.reduce((s, p) => s + p.textLength, 0) / pageAnalysis.length;
  const suspects = new Set<number>();

  for (const p of pageAnalysis) {
    // Trigger 1: Low density — less than 50% of average
    if (p.textLength < avgLen * 0.5 && p.textLength < 200) {
      suspects.add(p.page);
      continue;
    }

    // Trigger 2: Table keyword present but numbers missing
    if (TABLE_KEYWORDS.test(p.text)) {
      const numberMatches = p.text.match(NUMBER_PATTERN);
      const numberCount = numberMatches?.length ?? 0;
      // If keyword found but fewer than 3 number patterns, suspect
      if (numberCount < 3) {
        suspects.add(p.page);
      }
    }
  }

  // Also check: if a page has table keyword, check the NEXT page too
  // (table might span across pages)
  for (const p of pageAnalysis) {
    if (TABLE_KEYWORDS.test(p.text) && suspects.has(p.page)) {
      const nextPage = p.page + 1;
      if (nextPage <= pageAnalysis.length) {
        suspects.add(nextPage);
      }
    }
  }

  // Cap at maxPages to avoid excessive Vision calls
  const sorted = [...suspects].sort((a, b) => a - b);
  return sorted.slice(0, maxPages);
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

      // pdftoppm outputs as prefix-{pageNum}.png
      const expectedFile = `${prefix}-${pageNum}.png`;
      // Or sometimes just prefix.png for single page
      const altFile = `${prefix}.png`;

      const outputFile = fs.existsSync(expectedFile)
        ? expectedFile
        : fs.existsSync(altFile)
          ? altFile
          : null;

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

export async function enhancePdfWithVision(
  filePath: string,
  baseText: string,
): Promise<{ text: string; visionPages: number[] }> {
  try {
    // Step 2: Analyze pages
    const pageAnalysis = await analyzePages(filePath);

    // Step 3: Identify suspect pages
    const suspectPages = identifySuspectPages(pageAnalysis);

    if (suspectPages.length === 0) {
      return { text: baseText, visionPages: [] };
    }

    console.log(`[Vision] ${path.basename(filePath)}: ${suspectPages.length} suspect pages detected: [${suspectPages.join(", ")}]`);

    // Step 4: Convert to images
    const pageImages = convertPagesToImages(filePath, suspectPages);

    if (pageImages.length === 0) {
      return { text: baseText, visionPages: [] };
    }

    // Step 5: Extract with Vision
    const visionTexts = extractWithVision(pageImages);

    // Step 6: Merge
    const mergedText = mergeTexts(baseText, pageAnalysis, visionTexts);

    // Cleanup temp images
    cleanupVisionTemp();

    return {
      text: mergedText,
      visionPages: visionTexts.map((v) => v.page),
    };
  } catch (err) {
    console.warn(`[Vision] Enhancement failed for ${filePath}:`, err instanceof Error ? err.message : err);
    return { text: baseText, visionPages: [] };
  }
}
