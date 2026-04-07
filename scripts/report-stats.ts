import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const db = new Database(path.join(process.cwd(), "data", "contracts.db"), { readonly: true });
const projectId = 2;

// Contract details
const contracts = db.prepare("SELECT id, name, file_path, analysis_confidence, needs_review FROM contracts WHERE project_id = ? ORDER BY id").all(projectId) as {
  id: string; name: string; file_path: string; analysis_confidence: number; needs_review: number;
}[];

console.log("=== CONTRACT DETAILS ===");
for (const c of contracts) {
  const pages = db.prepare(
    `SELECT COUNT(*) as total,
     SUM(CASE WHEN is_empty = 0 THEN 1 ELSE 0 END) as readable,
     SUM(CASE WHEN source = 'vision' THEN 1 ELSE 0 END) as vision,
     SUM(CASE WHEN source = 'parser' AND is_empty = 0 THEN 1 ELSE 0 END) as parser_ok,
     SUM(char_count) as totalChars
     FROM contract_pages WHERE contract_id = ?`
  ).get(c.id) as { total: number; readable: number; vision: number; parser_ok: number; totalChars: number };

  const fn = c.file_path ? path.basename(c.file_path) : "(extracted)";
  let fileSize = 0;
  try { fileSize = fs.statSync(c.file_path).size; } catch { /* */ }

  console.log(JSON.stringify({
    id: c.id,
    fileName: fn,
    fileSizeKB: Math.round(fileSize / 1024),
    totalPages: pages.total || 0,
    parserPages: pages.parser_ok || 0,
    visionPages: pages.vision || 0,
    totalChars: pages.totalChars || 0,
    coverage: pages.total > 0 ? Math.round((pages.readable || 0) / pages.total * 100) : 0,
    confidence: c.analysis_confidence ? Math.round(c.analysis_confidence * 100) : null,
  }));
}

// Summary stats
const rels = db.prepare("SELECT type, COUNT(*) as cnt FROM relationships WHERE source_id IN (SELECT id FROM contracts WHERE project_id = ?) GROUP BY type").all(projectId);
console.log("\nRELS:" + JSON.stringify(rels));

const notes = db.prepare("SELECT category, COUNT(*) as cnt FROM review_notes WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?) GROUP BY category").all(projectId);
console.log("NOTES:" + JSON.stringify(notes));

const clauses = db.prepare("SELECT type, COUNT(*) as cnt FROM clauses WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?) GROUP BY type ORDER BY cnt DESC").all(projectId);
console.log("CLAUSES:" + JSON.stringify(clauses));

const defs = db.prepare("SELECT COUNT(*) as cnt FROM definitions WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)").get(projectId) as { cnt: number };
console.log("DEFS:" + defs.cnt);

const pricing = db.prepare("SELECT COUNT(*) as cnt FROM pricing_tables WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)").get(projectId) as { cnt: number };
console.log("PRICING:" + pricing.cnt);

db.close();
