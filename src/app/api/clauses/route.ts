import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const contractId = searchParams.get("contract_id");

  const db = getDb();

  const projectId = searchParams.get("project_id");

  let sql = "SELECT c.* FROM clauses c WHERE 1=1";
  const params: string[] = [];

  if (projectId) {
    sql += " AND c.contract_id IN (SELECT id FROM contracts WHERE project_id = ?)";
    params.push(projectId);
  }

  if (type) {
    sql += " AND c.type = ?";
    params.push(type);
  }

  if (contractId) {
    sql += " AND c.contract_id = ?";
    params.push(contractId);
  }

  sql += " ORDER BY c.contract_id, c.type, c.section";

  const clauses = db.prepare(sql).all(...params);

  return NextResponse.json({ clauses });
}
