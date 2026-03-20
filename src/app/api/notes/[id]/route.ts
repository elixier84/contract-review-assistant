import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();

  const existing = db.prepare("SELECT * FROM review_notes WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (body.is_reviewed !== undefined) {
    updates.push("is_reviewed = ?");
    values.push(body.is_reviewed ? 1 : 0);
  }

  if (body.narrative !== undefined) {
    updates.push("narrative = ?");
    values.push(body.narrative);
  }

  if (body.severity !== undefined) {
    updates.push("severity = ?");
    values.push(body.severity);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  updates.push("updated_at = datetime('now')");
  values.push(Number(id));

  db.prepare(
    `UPDATE review_notes SET ${updates.join(", ")} WHERE id = ?`
  ).run(...values);

  const note = db.prepare("SELECT * FROM review_notes WHERE id = ?").get(id);
  return NextResponse.json({ note });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const existing = db.prepare("SELECT * FROM review_notes WHERE id = ?").get(id);
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  db.prepare("DELETE FROM review_notes WHERE id = ?").run(id);
  return NextResponse.json({ deleted: true });
}
