import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const contractId = searchParams.get("contract_id");

  const db = getDb();

  let sql = "SELECT * FROM clauses WHERE 1=1";
  const params: string[] = [];

  if (type) {
    sql += " AND type = ?";
    params.push(type);
  }

  if (contractId) {
    sql += " AND contract_id = ?";
    params.push(contractId);
  }

  sql += " ORDER BY contract_id, type, section";

  const clauses = db.prepare(sql).all(...params);

  return NextResponse.json({ clauses });
}
