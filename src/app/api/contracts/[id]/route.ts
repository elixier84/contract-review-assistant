import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  const contract = db.prepare("SELECT * FROM contracts WHERE id = ?").get(id);
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const clauses = db.prepare("SELECT * FROM clauses WHERE contract_id = ?").all(id);
  const definitions = db.prepare("SELECT * FROM definitions WHERE contract_id = ?").all(id);
  const pricing = db.prepare("SELECT * FROM pricing_tables WHERE contract_id = ?").all(id);
  const notes = db.prepare("SELECT * FROM review_notes WHERE contract_id = ?").all(id);
  const patents = db.prepare("SELECT * FROM patents WHERE contract_id = ?").all(id);
  const products = db.prepare("SELECT * FROM licensed_products WHERE contract_id = ?").all(id);

  const relationships = db
    .prepare("SELECT * FROM relationships WHERE source_id = ? OR target_id = ?")
    .all(id, id);

  return NextResponse.json({
    contract,
    clauses,
    definitions,
    pricing,
    notes,
    patents,
    products,
    relationships,
  });
}
