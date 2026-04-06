import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const contractId = searchParams.get("contract_id");
  const status = searchParams.get("status"); // pending, reviewed, resolved

  let sql = "SELECT * FROM review_notes";
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  const projectId = searchParams.get("project_id");

  if (projectId) {
    conditions.push("contract_id IN (SELECT id FROM contracts WHERE project_id = ?)");
    params.push(projectId);
  }

  if (contractId) {
    conditions.push("contract_id = ?");
    params.push(contractId);
  }

  if (status === "pending") {
    conditions.push("is_reviewed = 0");
  } else if (status === "reviewed") {
    conditions.push("is_reviewed = 1 AND (narrative IS NULL OR narrative = '')");
  } else if (status === "resolved") {
    conditions.push("is_reviewed = 1 AND narrative IS NOT NULL AND narrative != ''");
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY severity DESC, created_at DESC";

  const notes = db.prepare(sql).all(...params);
  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  const db = getDb();
  const body = await request.json();

  const { contract_id, type, issue, severity } = body;

  if (!type || !issue) {
    return NextResponse.json(
      { error: "type and issue are required" },
      { status: 400 }
    );
  }

  const result = db
    .prepare(
      `INSERT INTO review_notes (contract_id, type, issue, severity)
       VALUES (?, ?, ?, ?)`
    )
    .run(contract_id || null, type, issue, severity || "medium");

  const note = db
    .prepare("SELECT * FROM review_notes WHERE id = ?")
    .get(result.lastInsertRowid);

  return NextResponse.json({ note }, { status: 201 });
}
