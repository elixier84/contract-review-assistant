import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  // Check if project has contracts
  const count = db
    .prepare("SELECT COUNT(*) as cnt FROM contracts WHERE project_id = ?")
    .get(id) as { cnt: number };

  if (count.cnt > 0) {
    return NextResponse.json(
      { error: `Cannot delete project with ${count.cnt} contracts. Remove contracts first.` },
      { status: 400 },
    );
  }

  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
