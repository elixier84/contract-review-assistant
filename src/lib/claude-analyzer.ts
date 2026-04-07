import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getDb } from "./db";

// ---------------------------------------------------------------------------
// Note category mapping: type → category
// ---------------------------------------------------------------------------

function noteCategory(type: string): string {
  if (type.startsWith("cross_contract_")) return "audit_finding";
  if (type === "clause_ambiguity" || type === "pricing_mismatch" || type === "date_conflict" || type === "discrepancy") return "audit_finding";
  if (type === "missing_link" || type === "inherited_clause") return "document_gap";
  if (type === "vision_enhanced" || type === "low_confidence") return "system";
  return "uncategorized";
}

// ---------------------------------------------------------------------------
// Model configuration per prompt
// ---------------------------------------------------------------------------

export type ModelTier = "haiku" | "sonnet" | "opus";

const PROMPT_MODEL_MAP: Record<string, ModelTier> = {
  "01-metadata":        "sonnet",  // 정형 데이터 추출 (날짜, 이름, 기술명)
  "02-clauses":         "sonnet",  // 조항 해석, 핵심 조건 판단
  "03-glossary":        "sonnet",  // 용어·정의 추출
  "04-relationships":   "sonnet",  // 계약간 관계 추론
  "05-pricing":         "sonnet",  // 복잡한 가격/할인 구조
  "06-patents-products": "sonnet", // 특허번호·제품명 추출
  "07-cross-contract":  "opus",    // 교차 비교 — 가장 복잡, 최고 품질 필요
};

const DEFAULT_MODEL: ModelTier = "sonnet";

// ---------------------------------------------------------------------------
// Progress event types
// ---------------------------------------------------------------------------

export interface AnalysisProgressEvent {
  type:
    | "prompt_start" | "prompt_complete" | "prompt_error"
    | "contract_start" | "contract_complete" | "contract_error"
    | "cross_contract_start" | "cross_contract_complete" | "cross_contract_error";
  contractId?: string;
  promptName?: string;
  model?: ModelTier;
  error?: string;
  confidence?: number;
}

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  contracts: Array<{ id: string; status: "success" | "error"; error?: string; confidence?: number | null }>;
  crossContractNotesCreated?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip markdown code fences (```json ... ```) that Claude sometimes wraps around output. */
export function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text.trim();
}

/**
 * Extract valid JSON from CLI output that may contain decoration text
 * (e.g. bkit feature reports, horizontal rules, markdown).
 * Finds the first top-level { or [ and matches to its closing counterpart.
 */
export function extractJson(raw: string): string {
  const stripped = stripCodeFences(raw);

  // Fast path: already valid JSON
  const trimmed = stripped.trim();
  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && (trimmed.endsWith("}") || trimmed.endsWith("]"))) {
    return trimmed;
  }

  // Find the first { or [ and extract the balanced JSON block
  const startIdx = stripped.search(/[\[{]/);
  if (startIdx === -1) return trimmed; // no JSON found, let caller handle error

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (depth === 0) {
      return stripped.slice(startIdx, i + 1);
    }
  }

  // Fallback: return from start of JSON to end
  return stripped.slice(startIdx);
}

/** Run claude CLI with content piped via stdin — cross-platform (macOS, Linux, Windows). */
function runClaudeCLI(content: string, modelId: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["--print", "--model", modelId], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32", // required for .cmd wrappers on Windows
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.stdin.write(content, "utf-8");
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("Claude CLI timeout (7 min)"));
    }, 420_000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && stdout.trim() === "") {
        reject(new Error(`Claude CLI exited ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Core: run a Claude prompt against contract text (async, non-blocking)
// ---------------------------------------------------------------------------

// Refusal patterns from Claude CLI output
const REFUSAL_PATTERNS = [
  /\bI can(?:'t| not)\b/i,
  /\bI'm unable\b/i,
  /\bI am unable\b/i,
  /\bI cannot\b/i,
  /\bI'm not able\b/i,
  /\bI must decline\b/i,
  /\bI won't be able\b/i,
];

export function detectRefusal(text: string): boolean {
  // Only check the first 500 chars — refusals appear at the start
  const head = text.slice(0, 500);
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(head));
}

export class RefusalError extends Error {
  constructor(public readonly rawOutput: string) {
    super("Claude refused to analyze this content");
    this.name = "RefusalError";
  }
}

export async function runPrompt(
  promptPath: string,
  contractText: string,
  extraContext?: string,
  model?: ModelTier,
): Promise<unknown> {
  const promptContent = fs.readFileSync(promptPath, "utf-8");

  let combined = promptContent + "\n\n---\n\nCONTRACT TEXT:\n\n" + contractText;
  if (extraContext) {
    combined += "\n\n" + extraContext;
  }

  // Unset CLAUDECODE to allow nested CLI invocation
  const env = { ...process.env };
  delete env.CLAUDECODE;

  const modelId = model ?? DEFAULT_MODEL;
  const stdout = await runClaudeCLI(combined, modelId, env);

  // Check for model refusal before attempting JSON parse
  if (detectRefusal(stdout)) {
    throw new RefusalError(stdout.slice(0, 200));
  }

  const cleaned = extractJson(stdout);
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------------
// Store functions (unchanged — all synchronous SQLite writes)
// ---------------------------------------------------------------------------

export function storeMetadata(contractId: string, result: Record<string, unknown>): void {
  const db = getDb();

  const territory = result.territory as Record<string, string> | null;
  const territoryStr = territory
    ? [territory.manufacturing, territory.sales].filter(Boolean).join("; ")
    : null;

  // Resolve parent_id from applicable_standard_tc
  const parentId = (result.applicable_standard_tc as string) ?? null;

  // If parentId is provided, verify it exists — only set if it does
  let resolvedParent: string | null = null;
  if (parentId) {
    const exists = db.prepare("SELECT id FROM contracts WHERE id = ?").get(parentId);
    if (exists) resolvedParent = parentId;
  }

  db.prepare(`
    UPDATE contracts
    SET effective_date       = ?,
        expiry_date          = ?,
        licensed_technology  = ?,
        territory            = ?,
        initial_fee          = ?,
        parent_id            = ?,
        analysis_json        = ?,
        analysis_confidence  = ?,
        updated_at           = datetime('now')
    WHERE id = ?
  `).run(
    (result.effective_date as string) ?? null,
    (result.expiry_date as string) ?? null,
    (result.licensed_technology as string) ?? null,
    territoryStr,
    (result.initial_fee as number) ?? null,
    resolvedParent,
    JSON.stringify(result),
    (result.confidence as number) ?? null,
    contractId,
  );
}

export function storeClauses(contractId: string, result: unknown[]): void {
  const db = getDb();
  const del = db.prepare("DELETE FROM clauses WHERE contract_id = ?");
  const ins = db.prepare(`
    INSERT INTO clauses (contract_id, type, section, snippet, key_terms_json, confidence, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    del.run(contractId);
    for (const c of result) {
      const clause = c as Record<string, unknown>;
      const confidence = (clause.confidence as number) ?? null;
      ins.run(
        contractId,
        clause.type,
        clause.section ?? null,
        clause.snippet,
        clause.key_terms ? JSON.stringify(clause.key_terms) : null,
        confidence,
        confidence !== null && confidence < 0.8 ? 1 : 0,
      );
    }
  });
  txn();
}

export function storeDefinitions(contractId: string, result: unknown[]): void {
  const db = getDb();
  const del = db.prepare("DELETE FROM definitions WHERE contract_id = ?");
  const ins = db.prepare(`
    INSERT OR IGNORE INTO definitions (contract_id, term, definition, section)
    VALUES (?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    del.run(contractId);
    for (const d of result) {
      const def = d as Record<string, unknown>;
      ins.run(
        contractId,
        def.term,
        def.definition,
        def.section ?? null,
      );
    }
  });
  txn();
}

export function storeRelationships(contractId: string, result: unknown[]): void {
  const db = getDb();
  const del = db.prepare("DELETE FROM relationships WHERE source_id = ?");
  const ins = db.prepare(`
    INSERT OR IGNORE INTO relationships (source_id, target_id, type, evidence_text, evidence_section, confidence)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    del.run(contractId);
    for (const r of result) {
      const rel = r as Record<string, unknown>;
      // Only insert if target exists in DB
      const targetId = rel.target_id as string;
      const exists = db.prepare("SELECT id FROM contracts WHERE id = ?").get(targetId);
      if (exists) {
        ins.run(
          contractId,
          targetId,
          rel.type,
          rel.evidence_text ?? null,
          rel.evidence_section ?? null,
          (rel.confidence as number) ?? null,
        );
      } else {
        // Create a review note for missing referenced contract
        db.prepare(`
          INSERT INTO review_notes (contract_id, type, category, issue, severity)
          VALUES (?, 'missing_link', 'document_gap', ?, 'medium')
        `).run(
          contractId,
          `Contract references agreement ${targetId} which is not in the registry`,
        );
      }
    }
  });
  txn();
}

export function storePricing(contractId: string, result: unknown[]): void {
  const db = getDb();
  const del = db.prepare("DELETE FROM pricing_tables WHERE contract_id = ?");
  const ins = db.prepare(`
    INSERT INTO pricing_tables (contract_id, technology, name, section, royalty_basis, tiers_json, discounts_json, cpi_adjustment, aggregation_rules, confidence, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    del.run(contractId);
    for (const p of result) {
      const pricing = p as Record<string, unknown>;
      const confidence = (pricing.confidence as number) ?? null;
      ins.run(
        contractId,
        (pricing.technology as string) ?? null,
        (pricing.name as string) ?? null,
        (pricing.section as string) ?? null,
        pricing.royalty_basis ? JSON.stringify(pricing.royalty_basis) : null,
        pricing.tiers ? JSON.stringify(pricing.tiers) : null,
        pricing.discounts ? JSON.stringify(pricing.discounts) : null,
        pricing.cpi_adjustment ? JSON.stringify(pricing.cpi_adjustment) : null,
        (pricing.aggregation_rules as string) ?? null,
        confidence,
        confidence !== null && confidence < 0.8 ? 1 : 0,
      );
    }
  });
  txn();
}

export function storePatentsProducts(contractId: string, result: Record<string, unknown>): void {
  const db = getDb();

  const delPatents = db.prepare("DELETE FROM patents WHERE contract_id = ?");
  const delProducts = db.prepare("DELETE FROM licensed_products WHERE contract_id = ?");
  const insPatent = db.prepare(`
    INSERT OR IGNORE INTO patents (contract_id, technology, country, patent_number, is_application)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insProduct = db.prepare(`
    INSERT INTO licensed_products (contract_id, technology, product_type, category)
    VALUES (?, ?, ?, ?)
  `);

  const technology = (result.technology as string) ?? null;

  const txn = db.transaction(() => {
    delPatents.run(contractId);
    delProducts.run(contractId);

    // Insert patents
    const patents = (result.patents as unknown[]) ?? [];
    for (const p of patents) {
      const pat = p as Record<string, unknown>;
      insPatent.run(
        contractId,
        technology,
        pat.country ?? null,
        pat.number ?? pat.patent_number ?? null,
        pat.is_application ? 1 : 0,
      );
    }

    // Insert licensed products
    const products = (result.licensed_products as unknown[]) ?? [];
    for (const lp of products) {
      const prod = lp as Record<string, unknown>;
      insProduct.run(
        contractId,
        technology,
        prod.product_type ?? null,
        prod.category ?? null,
      );
    }

    // Upsert technologies table and tech_contract_map
    if (technology) {
      db.prepare(`
        INSERT OR IGNORE INTO technologies (name) VALUES (?)
      `).run(technology);

      const techRow = db.prepare("SELECT id FROM technologies WHERE name = ?").get(technology) as { id: number } | undefined;
      if (techRow) {
        db.prepare(`
          INSERT OR IGNORE INTO tech_contract_map (tech_id, contract_id, role)
          VALUES (?, ?, 'licensed_under')
        `).run(techRow.id, contractId);
      }
    }
  });
  txn();
}

// ---------------------------------------------------------------------------
// Build registry string for relationship prompt
// ---------------------------------------------------------------------------

function buildRegistry(): string {
  const db = getDb();
  const contracts = db.prepare(
    "SELECT id, name, effective_date FROM contracts ORDER BY id",
  ).all() as { id: string; name: string; effective_date: string | null }[];

  const lines = contracts.map(
    (c) => `- ${c.id}: ${c.name}${c.effective_date ? `, Effective ${c.effective_date}` : ""}`,
  );
  return "REGISTRY:\n" + lines.join("\n");
}

// ---------------------------------------------------------------------------
// Prompt file paths
// ---------------------------------------------------------------------------

const PROMPTS_DIR = path.join(process.cwd(), "src", "prompts");

const PROMPT_FILES = {
  metadata: path.join(PROMPTS_DIR, "01-metadata.md"),
  clauses: path.join(PROMPTS_DIR, "02-clauses.md"),
  glossary: path.join(PROMPTS_DIR, "03-glossary.md"),
  relationships: path.join(PROMPTS_DIR, "04-relationships.md"),
  pricing: path.join(PROMPTS_DIR, "05-pricing.md"),
  patentsProducts: path.join(PROMPTS_DIR, "06-patents-products.md"),
  crossContract: path.join(PROMPTS_DIR, "07-cross-contract.md"),
};

// ---------------------------------------------------------------------------
// Confidence collector helper
// ---------------------------------------------------------------------------

function collectConfidences(result: unknown): number[] {
  const confidences: number[] = [];
  if (result && typeof result === "object") {
    if ("confidence" in (result as Record<string, unknown>)) {
      const c = (result as Record<string, unknown>).confidence as number;
      if (typeof c === "number") confidences.push(c);
    }
    if (Array.isArray(result)) {
      for (const item of result) {
        if (item && typeof item === "object" && "confidence" in item) {
          const c = (item as Record<string, unknown>).confidence as number;
          if (typeof c === "number") confidences.push(c);
        }
      }
    }
  }
  return confidences;
}

// ---------------------------------------------------------------------------
// Orchestrator: analyze a single contract (6 prompts in PARALLEL)
// ---------------------------------------------------------------------------

interface PromptTask {
  name: string;
  promptFile: string;
  model?: ModelTier;
  extraContext?: () => string;
  store: (contractId: string, result: unknown) => void;
}

export async function analyzeContract(
  contractId: string,
  onProgress?: (event: AnalysisProgressEvent) => void,
): Promise<void> {
  const db = getDb();

  const row = db.prepare("SELECT raw_text, name FROM contracts WHERE id = ?").get(contractId) as
    | { raw_text: string; name: string }
    | undefined;

  if (!row || !row.raw_text) {
    console.error(`  No raw_text for contract ${contractId}, skipping.`);
    return;
  }

  let contractText = row.raw_text;
  console.log(`\n  Analyzing contract ${contractId}: ${row.name}`);
  onProgress?.({ type: "contract_start", contractId });

  // Pre-analysis: Vision OCR for pages that parser couldn't read
  const filePath = (db.prepare("SELECT file_path FROM contracts WHERE id = ?").get(contractId) as { file_path: string } | undefined)?.file_path;
  if (filePath && filePath.toLowerCase().endsWith(".pdf")) {
    try {
      // Check if there are empty pages in contract_pages
      const emptyCount = (db.prepare(
        "SELECT COUNT(*) as cnt FROM contract_pages WHERE contract_id = ? AND is_empty = 1"
      ).get(contractId) as { cnt: number })?.cnt ?? 0;
      const totalCount = (db.prepare(
        "SELECT COUNT(*) as cnt FROM contract_pages WHERE contract_id = ?"
      ).get(contractId) as { cnt: number })?.cnt ?? 0;

      if (emptyCount > 0 && totalCount > 0) {
        const coverage = Math.round(((totalCount - emptyCount) / totalCount) * 100);
        console.log(`  [Vision] Coverage: ${totalCount - emptyCount}/${totalCount} pages (${coverage}%). Running parallel Vision OCR on ${emptyCount} empty pages...`);

        const { analyzePages, identifySuspectPages, convertPagesToImages, extractWithVisionParallel, cleanupVisionTemp } = await import("./vision-enhance");
        const pageAnalysis = await analyzePages(filePath);
        const suspectPages = identifySuspectPages(pageAnalysis);

        if (suspectPages.length > 0) {
          const pageImages = convertPagesToImages(filePath, suspectPages);
          const visionTexts = await extractWithVisionParallel(pageImages, 4);

          if (visionTexts.length > 0) {
            // Save Vision pages to contract_pages
            const upsertPage = db.prepare(`
              INSERT INTO contract_pages (contract_id, page_number, source, text, char_count, is_empty, updated_at)
              VALUES (?, ?, 'vision', ?, ?, 0, datetime('now'))
              ON CONFLICT(contract_id, page_number) DO UPDATE SET
                source = 'vision', text = excluded.text, char_count = excluded.char_count,
                is_empty = 0, updated_at = datetime('now')
            `);
            const tx = db.transaction(() => {
              for (const vt of visionTexts) {
                upsertPage.run(contractId, vt.page, vt.text, vt.text.length);
              }
            });
            tx();

            // Rebuild raw_text from contract_pages
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
            contractText = fullText.trim();
            db.prepare("UPDATE contracts SET raw_text = ?, updated_at = datetime('now') WHERE id = ?")
              .run(contractText, contractId);

            // Add review note
            db.prepare(`
              INSERT INTO review_notes (contract_id, type, category, issue, severity, is_reviewed, narrative, created_at, updated_at)
              VALUES (?, 'vision_enhanced', 'system', ?, 'medium', 0, '', datetime('now'), datetime('now'))
            `).run(contractId, `Pages ${visionTexts.map((v) => v.page).join(", ")} enhanced via Vision OCR (parallel). Manual verification recommended.`);

            const newEmptyCount = pages.filter((p) => p.char_count === 0).length;
            const newCoverage = Math.round(((pages.length - newEmptyCount) / pages.length) * 100);
            console.log(`  [Vision] Enhanced: ${visionTexts.length} pages. Coverage: ${newCoverage}%. Text: ${row.raw_text.length} → ${contractText.length} chars`);
          }

          cleanupVisionTemp();
        }
      } else if (totalCount === 0) {
        // No page data yet — run page analysis and store it
        console.log(`  [Pages] No page data found. Running page analysis...`);
        const { analyzePages, identifySuspectPages, convertPagesToImages, extractWithVisionParallel, cleanupVisionTemp } = await import("./vision-enhance");
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

        const emptyPages = pageAnalysis.filter((p) => p.textLength < 100);
        if (emptyPages.length > 0) {
          console.log(`  [Vision] ${emptyPages.length}/${pageAnalysis.length} pages need OCR. Running parallel Vision...`);
          const suspectPages = identifySuspectPages(pageAnalysis);
          const pageImages = convertPagesToImages(filePath, suspectPages);
          const visionTexts = await extractWithVisionParallel(pageImages, 4);

          if (visionTexts.length > 0) {
            const tx2 = db.transaction(() => {
              for (const vt of visionTexts) {
                upsertPage.run(contractId, vt.page, vt.text, vt.text.length, 0);
                // Fix: upsert uses parser source, need separate statement for vision
                db.prepare(`UPDATE contract_pages SET source = 'vision' WHERE contract_id = ? AND page_number = ?`)
                  .run(contractId, vt.page);
              }
            });
            tx2();

            // Rebuild raw_text
            const pages = db.prepare(
              "SELECT page_number, source, text, char_count FROM contract_pages WHERE contract_id = ? ORDER BY page_number"
            ).all(contractId) as { page_number: number; source: string; text: string; char_count: number }[];
            let fullText = "";
            for (const p of pages) {
              if (p.char_count > 0) {
                fullText += p.source === "vision"
                  ? `\n\n[Page ${p.page_number} — Vision OCR]\n${p.text}\n[/Page ${p.page_number}]\n`
                  : `\n\n[Page ${p.page_number}]\n${p.text}\n[/Page ${p.page_number}]\n`;
              }
            }
            contractText = fullText.trim();
            db.prepare("UPDATE contracts SET raw_text = ?, updated_at = datetime('now') WHERE id = ?")
              .run(contractText, contractId);
            console.log(`  [Vision] Enhanced: ${visionTexts.length} pages. Text: ${row.raw_text.length} → ${contractText.length} chars`);
          }

          cleanupVisionTemp();
        }
      }
    } catch (err) {
      console.warn(`  [Vision] Pre-analysis check failed: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
    }
  }

  // Coverage gate: warn if still insufficient
  {
    const emptyCheck = db.prepare(
      "SELECT COUNT(*) as empty, (SELECT COUNT(*) FROM contract_pages WHERE contract_id = ?) as total FROM contract_pages WHERE contract_id = ? AND is_empty = 1"
    ).get(contractId, contractId) as { empty: number; total: number } | undefined;
    if (emptyCheck && emptyCheck.total > 0) {
      const coverage = Math.round(((emptyCheck.total - emptyCheck.empty) / emptyCheck.total) * 100);
      if (coverage < 70) {
        console.warn(`  ⚠️  Coverage ${coverage}% — analysis results may be unreliable`);
        db.prepare(`
          INSERT OR IGNORE INTO review_notes (contract_id, type, category, issue, severity, is_reviewed, narrative, created_at, updated_at)
          VALUES (?, 'low_coverage', 'system', ?, 'high', 0, '', datetime('now'), datetime('now'))
        `).run(contractId, `Text extraction coverage is only ${coverage}%. Analysis may miss critical contract terms. Manual review of original document recommended.`);
      }
    }
  }

  const tasks: PromptTask[] = [
    {
      name: "01-metadata",
      promptFile: PROMPT_FILES.metadata,
      model: PROMPT_MODEL_MAP["01-metadata"],
      store: (id, res) => storeMetadata(id, res as Record<string, unknown>),
    },
    {
      name: "02-clauses",
      promptFile: PROMPT_FILES.clauses,
      model: PROMPT_MODEL_MAP["02-clauses"],
      store: (id, res) => storeClauses(id, res as unknown[]),
    },
    {
      name: "03-glossary",
      promptFile: PROMPT_FILES.glossary,
      model: PROMPT_MODEL_MAP["03-glossary"],
      store: (id, res) => storeDefinitions(id, res as unknown[]),
    },
    {
      name: "04-relationships",
      promptFile: PROMPT_FILES.relationships,
      model: PROMPT_MODEL_MAP["04-relationships"],
      extraContext: () => buildRegistry(),
      store: (id, res) => storeRelationships(id, res as unknown[]),
    },
    {
      name: "05-pricing",
      promptFile: PROMPT_FILES.pricing,
      model: PROMPT_MODEL_MAP["05-pricing"],
      store: (id, res) => storePricing(id, res as unknown[]),
    },
    {
      name: "06-patents-products",
      promptFile: PROMPT_FILES.patentsProducts,
      model: PROMPT_MODEL_MAP["06-patents-products"],
      store: (id, res) => storePatentsProducts(id, res as Record<string, unknown>),
    },
  ];

  // Run all 6 prompts in PARALLEL
  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      console.log(`    Running ${task.name} (${task.model ?? DEFAULT_MODEL})...`);
      onProgress?.({ type: "prompt_start", contractId, promptName: task.name, model: task.model ?? DEFAULT_MODEL });

      try {
        const result = await runPrompt(
          task.promptFile,
          contractText,
          task.extraContext ? task.extraContext() : undefined,
          task.model,
        );
        console.log(`    ${task.name} (${task.model ?? DEFAULT_MODEL}) complete.`);
        onProgress?.({ type: "prompt_complete", contractId, promptName: task.name, model: task.model ?? DEFAULT_MODEL });
        return { task, result };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`    ERROR in ${task.name} (${task.model ?? DEFAULT_MODEL}): ${errMsg}`);
        onProgress?.({ type: "prompt_error", contractId, promptName: task.name, model: task.model ?? DEFAULT_MODEL, error: errMsg });

        // Create review_note for refusals so they're visible, not silent
        if (err instanceof RefusalError) {
          const noteDb = getDb();
          noteDb.prepare(`
            INSERT INTO review_notes (contract_id, type, category, issue, severity)
            VALUES (?, 'analysis_refusal', 'system', ?, 'high')
          `).run(contractId, `Model refused to analyze prompt ${task.name}: ${err.rawOutput}`);
        }

        throw err;
      }
    }),
  );

  // Store results sequentially (safe for SQLite) and collect confidences
  const confidences: number[] = [];

  for (const outcome of results) {
    if (outcome.status === "fulfilled") {
      const { task, result } = outcome.value;
      task.store(contractId, result);
      confidences.push(...collectConfidences(result));
    }
  }

  // Calculate overall confidence
  // Exclude very low confidence values (< 0.3) — these typically mean
  // "clause not present in this document" rather than "extraction failed"
  const meaningfulConfidences = confidences.filter(c => c >= 0.3);
  const avgConfidence =
    meaningfulConfidences.length > 0
      ? meaningfulConfidences.reduce((sum, c) => sum + c, 0) / meaningfulConfidences.length
      : null;

  const needsReview = avgConfidence === null || avgConfidence < 0.8 ? 1 : 0;

  db.prepare(`
    UPDATE contracts
    SET analysis_confidence = ?,
        needs_review        = ?,
        updated_at          = datetime('now')
    WHERE id = ?
  `).run(avgConfidence, needsReview, contractId);

  // Auto-create review note for low-confidence tasks
  if (avgConfidence !== null && avgConfidence < 0.5) {
    db.prepare(`
      INSERT INTO review_notes (contract_id, type, category, issue, severity)
      VALUES (?, 'clause_ambiguity', 'audit_finding', ?, 'high')
    `).run(
      contractId,
      `Overall analysis confidence is ${avgConfidence.toFixed(2)} — below 0.5 threshold. Manual review recommended.`,
    );
  }

  onProgress?.({ type: "contract_complete", contractId, confidence: avgConfidence ?? undefined });
  console.log(
    `  Contract ${contractId} done. Confidence: ${avgConfidence?.toFixed(2) ?? "N/A"}, needs_review: ${needsReview === 1}`,
  );
}

// ---------------------------------------------------------------------------
// Batch analysis with concurrency control
// ---------------------------------------------------------------------------

const DEFAULT_CONCURRENCY = 6;

export async function analyzeContractsBatch(
  contractIds: string[],
  concurrency: number = DEFAULT_CONCURRENCY,
  onProgress?: (event: AnalysisProgressEvent) => void,
  runCrossContract: boolean = true,
): Promise<BatchResult> {
  // Dynamic import for ESM-only p-limit
  const { default: pLimit } = await import("p-limit");
  const limit = pLimit(concurrency);

  const contractResults: BatchResult["contracts"] = [];

  const promises = contractIds.map((id) =>
    limit(async () => {
      try {
        await analyzeContract(id, onProgress);
        // Read final confidence from DB
        const db = getDb();
        const row = db.prepare("SELECT analysis_confidence FROM contracts WHERE id = ?").get(id) as
          { analysis_confidence: number | null } | undefined;
        contractResults.push({ id, status: "success", confidence: row?.analysis_confidence ?? null });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        onProgress?.({ type: "contract_error", contractId: id, error: errMsg });
        contractResults.push({ id, status: "error", error: errMsg });
      }
    }),
  );

  await Promise.allSettled(promises);

  const succeeded = contractResults.filter((r) => r.status === "success").length;

  // Run cross-contract analysis if requested and any succeeded
  let crossContractNotesCreated: number | undefined;
  if (runCrossContract && succeeded > 0) {
    try {
      crossContractNotesCreated = await runCrossContractAnalysis(onProgress);
    } catch (err) {
      console.error(`  Cross-contract analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      onProgress?.({ type: "cross_contract_error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    total: contractIds.length,
    succeeded,
    failed: contractIds.length - succeeded,
    contracts: contractResults,
    crossContractNotesCreated,
  };
}

// ---------------------------------------------------------------------------
// Cross-contract analysis
// ---------------------------------------------------------------------------

function buildCrossContractContext(projectId?: number): string {
  const db = getDb();

  const projectFilter = projectId ? " WHERE project_id = ?" : "";
  const contractIdFilter = projectId
    ? " WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)"
    : "";
  const relFilter = projectId
    ? " WHERE source_id IN (SELECT id FROM contracts WHERE project_id = ?)"
    : "";
  const params = projectId ? [projectId] : [];

  const contracts = db.prepare(
    `SELECT id, name, type, effective_date, expiry_date, parent_id, licensed_technology FROM contracts${projectFilter} ORDER BY id`,
  ).all(...params);

  const definitions = db.prepare(
    `SELECT contract_id, term, definition, section FROM definitions${contractIdFilter} ORDER BY term`,
  ).all(...params);

  const clauses = db.prepare(
    `SELECT contract_id, type, section, snippet, key_terms_json, confidence FROM clauses${contractIdFilter} ORDER BY contract_id`,
  ).all(...params);

  const pricing = db.prepare(
    `SELECT contract_id, technology, name, royalty_basis, tiers_json, discounts_json FROM pricing_tables${contractIdFilter} ORDER BY contract_id`,
  ).all(...params);

  const relationships = db.prepare(
    `SELECT source_id, target_id, type, confidence FROM relationships${relFilter} ORDER BY source_id`,
  ).all(...params);

  return JSON.stringify({ contracts, definitions, clauses, pricing, relationships }, null, 2);
}

export async function runCrossContractAnalysis(
  onProgress?: (event: AnalysisProgressEvent) => void,
  projectId?: number,
): Promise<number> {
  console.log("\n  Running cross-contract analysis...");
  onProgress?.({ type: "cross_contract_start" });

  const context = buildCrossContractContext(projectId);
  const crossModel = PROMPT_MODEL_MAP["07-cross-contract"] ?? DEFAULT_MODEL;
  const result = await runPrompt(PROMPT_FILES.crossContract, context, undefined, crossModel);

  const db = getDb();
  const notes = result as Array<{
    contract_id: string;
    type: string;
    issue: string;
    severity: string;
    related_contracts?: string[];
  }>;

  // Clear previous cross-contract notes before inserting new ones
  db.prepare("DELETE FROM review_notes WHERE type IN ('cross_contract_definition', 'cross_contract_pricing', 'cross_contract_coverage', 'cross_contract_date', 'cross_contract_override')").run();

  let created = 0;
  for (const note of notes) {
    const issue = note.related_contracts
      ? `${note.issue} [Related: ${note.related_contracts.join(", ")}]`
      : note.issue;

    db.prepare(`
      INSERT INTO review_notes (contract_id, type, category, issue, severity)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      note.contract_id || null,
      note.type,
      noteCategory(note.type),
      issue,
      note.severity || "medium",
    );
    created++;
  }

  console.log(`  Cross-contract analysis complete. Created ${created} review notes.`);
  onProgress?.({ type: "cross_contract_complete" });
  return created;
}
