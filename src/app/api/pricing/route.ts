import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const technology = searchParams.get("technology");
  const contractId = searchParams.get("contract_id");

  let sql = `SELECT pt.*, c.name as contract_name
             FROM pricing_tables pt
             JOIN contracts c ON c.id = pt.contract_id`;
  const conditions: string[] = [];
  const params: string[] = [];

  if (technology) {
    conditions.push("pt.technology = ?");
    params.push(technology);
  }

  if (contractId) {
    conditions.push("pt.contract_id = ?");
    params.push(contractId);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY pt.technology, pt.contract_id";

  const pricing = db.prepare(sql).all(...params);
  return NextResponse.json({ pricing });
}
