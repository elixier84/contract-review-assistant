import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface ValidationIssue {
  type: "missing_target" | "orphan_child" | "circular_ref" | "date_conflict" | "missing_parent_ref";
  severity: "high" | "medium" | "low";
  message: string;
  contract_id: string;
  related_id?: string;
}

export async function GET() {
  const db = getDb();
  const issues: ValidationIssue[] = [];

  // 1. Check relationships: target contracts must exist
  const relationships = db.prepare(`
    SELECT r.source_id, r.target_id, r.type, r.evidence_text,
           s.name as source_name, t.name as target_name
    FROM relationships r
    LEFT JOIN contracts s ON s.id = r.source_id
    LEFT JOIN contracts t ON t.id = r.target_id
  `).all() as {
    source_id: string; target_id: string; type: string;
    evidence_text: string | null; source_name: string | null; target_name: string | null;
  }[];

  for (const rel of relationships) {
    if (!rel.source_name) {
      issues.push({
        type: "missing_target",
        severity: "high",
        message: `Relationship source ${rel.source_id} not found in contracts`,
        contract_id: rel.source_id,
        related_id: rel.target_id,
      });
    }
    if (!rel.target_name) {
      issues.push({
        type: "missing_target",
        severity: "high",
        message: `Relationship target ${rel.target_id} referenced by ${rel.source_id} not found`,
        contract_id: rel.source_id,
        related_id: rel.target_id,
      });
    }
  }

  // 2. Check parent_id references
  const contracts = db.prepare(`
    SELECT c.id, c.name, c.parent_id, c.effective_date, c.expiry_date,
           p.id as parent_exists
    FROM contracts c
    LEFT JOIN contracts p ON p.id = c.parent_id
    WHERE c.parent_id IS NOT NULL
  `).all() as {
    id: string; name: string; parent_id: string;
    effective_date: string | null; expiry_date: string | null;
    parent_exists: string | null;
  }[];

  for (const c of contracts) {
    if (!c.parent_exists) {
      issues.push({
        type: "orphan_child",
        severity: "high",
        message: `Contract ${c.id} (${c.name}) references parent ${c.parent_id} which does not exist`,
        contract_id: c.id,
        related_id: c.parent_id,
      });
    }
  }

  // 3. Check technology license contracts reference master T&C
  const techLicenses = db.prepare(`
    SELECT c.id, c.name FROM contracts c
    WHERE c.type = 'technology_license'
  `).all() as { id: string; name: string }[];

  for (const tl of techLicenses) {
    const hasRef = db.prepare(`
      SELECT 1 FROM relationships
      WHERE source_id = ? AND type = 'references_tc'
    `).get(tl.id);

    if (!hasRef) {
      issues.push({
        type: "missing_parent_ref",
        severity: "medium",
        message: `Technology license ${tl.id} (${tl.name}) has no reference to Master T&C`,
        contract_id: tl.id,
      });
    }
  }

  // 4. Date conflicts: child effective date before parent
  const childContracts = db.prepare(`
    SELECT c.id, c.name, c.effective_date, c.parent_id,
           p.effective_date as parent_effective
    FROM contracts c
    JOIN contracts p ON p.id = c.parent_id
    WHERE c.effective_date IS NOT NULL AND p.effective_date IS NOT NULL
  `).all() as {
    id: string; name: string; effective_date: string; parent_id: string; parent_effective: string;
  }[];

  for (const c of childContracts) {
    if (c.effective_date < c.parent_effective) {
      issues.push({
        type: "date_conflict",
        severity: "medium",
        message: `Contract ${c.id} effective date (${c.effective_date}) is before parent ${c.parent_id} (${c.parent_effective})`,
        contract_id: c.id,
        related_id: c.parent_id,
      });
    }
  }

  // 5. Circular reference check (simple: A→B→A)
  for (const rel of relationships) {
    const reverse = relationships.find(
      r => r.source_id === rel.target_id && r.target_id === rel.source_id && r.type === rel.type
    );
    if (reverse) {
      // Avoid duplicates
      if (rel.source_id < rel.target_id) {
        issues.push({
          type: "circular_ref",
          severity: "low",
          message: `Circular ${rel.type} between ${rel.source_id} and ${rel.target_id}`,
          contract_id: rel.source_id,
          related_id: rel.target_id,
        });
      }
    }
  }

  // Auto-create review notes for high-severity issues not already noted
  let autoCreated = 0;
  for (const issue of issues.filter(i => i.severity === "high")) {
    const existing = db.prepare(
      "SELECT 1 FROM review_notes WHERE contract_id = ? AND issue = ?"
    ).get(issue.contract_id, issue.message);

    if (!existing) {
      db.prepare(
        `INSERT INTO review_notes (contract_id, type, issue, severity)
         VALUES (?, ?, ?, ?)`
      ).run(issue.contract_id, issue.type, issue.message, issue.severity);
      autoCreated++;
    }
  }

  return NextResponse.json({
    issues,
    summary: {
      total: issues.length,
      high: issues.filter(i => i.severity === "high").length,
      medium: issues.filter(i => i.severity === "medium").length,
      low: issues.filter(i => i.severity === "low").length,
      auto_created_notes: autoCreated,
    },
  });
}
