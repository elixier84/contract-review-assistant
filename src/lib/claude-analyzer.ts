import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { getDb } from "./db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip markdown code fences (```json ... ```) that Claude sometimes wraps around output. */
function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text.trim();
}

/** Write content to a temp file and return the path. Caller must unlink. */
function writeTempFile(content: string): string {
  const tmpPath = path.join(os.tmpdir(), `cra-prompt-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(tmpPath, content, "utf-8");
  return tmpPath;
}

// ---------------------------------------------------------------------------
// Core: run a Claude prompt against contract text
// ---------------------------------------------------------------------------

export async function runPrompt(
  promptPath: string,
  contractText: string,
  extraContext?: string,
): Promise<unknown> {
  const promptContent = fs.readFileSync(promptPath, "utf-8");

  let combined = promptContent + "\n\n---\n\nCONTRACT TEXT:\n\n" + contractText;
  if (extraContext) {
    combined += "\n\n" + extraContext;
  }

  const tmpFile = writeTempFile(combined);

  try {
    // Unset CLAUDECODE to allow nested CLI invocation
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const stdout = execSync(`claude --print --model sonnet < "${tmpFile}"`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      timeout: 300_000, // 5 min
      shell: "/bin/zsh",
      env,
    });

    const cleaned = stripCodeFences(stdout);
    return JSON.parse(cleaned);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Store functions
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
          INSERT INTO review_notes (contract_id, type, issue, severity)
          VALUES (?, 'missing_link', ?, 'medium')
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
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

interface PromptTask {
  name: string;
  promptFile: string;
  extraContext?: () => string;
  store: (contractId: string, result: unknown) => void;
}

export async function analyzeContract(contractId: string): Promise<void> {
  const db = getDb();

  const row = db.prepare("SELECT raw_text, name FROM contracts WHERE id = ?").get(contractId) as
    | { raw_text: string; name: string }
    | undefined;

  if (!row || !row.raw_text) {
    console.error(`  No raw_text for contract ${contractId}, skipping.`);
    return;
  }

  const contractText = row.raw_text;
  console.log(`\n  Analyzing contract ${contractId}: ${row.name}`);

  const tasks: PromptTask[] = [
    {
      name: "01-metadata",
      promptFile: PROMPT_FILES.metadata,
      store: (id, res) => storeMetadata(id, res as Record<string, unknown>),
    },
    {
      name: "02-clauses",
      promptFile: PROMPT_FILES.clauses,
      store: (id, res) => storeClauses(id, res as unknown[]),
    },
    {
      name: "03-glossary",
      promptFile: PROMPT_FILES.glossary,
      store: (id, res) => storeDefinitions(id, res as unknown[]),
    },
    {
      name: "04-relationships",
      promptFile: PROMPT_FILES.relationships,
      extraContext: () => buildRegistry(),
      store: (id, res) => storeRelationships(id, res as unknown[]),
    },
    {
      name: "05-pricing",
      promptFile: PROMPT_FILES.pricing,
      store: (id, res) => storePricing(id, res as unknown[]),
    },
    {
      name: "06-patents-products",
      promptFile: PROMPT_FILES.patentsProducts,
      store: (id, res) => storePatentsProducts(id, res as Record<string, unknown>),
    },
  ];

  const confidences: number[] = [];

  for (const task of tasks) {
    console.log(`    Running ${task.name}...`);
    try {
      const result = await runPrompt(
        task.promptFile,
        contractText,
        task.extraContext ? task.extraContext() : undefined,
      );
      task.store(contractId, result);

      // Collect confidence values
      if (result && typeof result === "object") {
        if ("confidence" in (result as Record<string, unknown>)) {
          const c = (result as Record<string, unknown>).confidence as number;
          if (typeof c === "number") confidences.push(c);
        }
        // For array results, average item-level confidences
        if (Array.isArray(result)) {
          for (const item of result) {
            if (item && typeof item === "object" && "confidence" in item) {
              const c = (item as Record<string, unknown>).confidence as number;
              if (typeof c === "number") confidences.push(c);
            }
          }
        }
      }

      console.log(`    ${task.name} complete.`);
    } catch (err) {
      console.error(`    ERROR in ${task.name}: ${err instanceof Error ? err.message : String(err)}`);
      // Continue with remaining tasks
    }
  }

  // Calculate overall confidence
  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
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
      INSERT INTO review_notes (contract_id, type, issue, severity)
      VALUES (?, 'clause_ambiguity', ?, 'high')
    `).run(
      contractId,
      `Overall analysis confidence is ${avgConfidence.toFixed(2)} — below 0.5 threshold. Manual review recommended.`,
    );
  }

  console.log(
    `  Contract ${contractId} done. Confidence: ${avgConfidence?.toFixed(2) ?? "N/A"}, needs_review: ${needsReview === 1}`,
  );
}
