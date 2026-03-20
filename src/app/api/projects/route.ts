import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const projects = db.prepare("SELECT * FROM projects ORDER BY id DESC").all();

  // If no project exists, return a default one derived from contract data
  if (projects.length === 0) {
    return NextResponse.json({
      projects: [],
      active: null,
    });
  }

  return NextResponse.json({
    projects,
    active: projects[0],
  });
}

export async function POST(request: Request) {
  const db = getDb();
  const body = await request.json();

  const { name, licensor, licensee, notification_date, audit_scope_start, audit_scope_end } = body;

  if (!name || !licensor || !licensee) {
    return NextResponse.json(
      { error: "name, licensor, and licensee are required" },
      { status: 400 },
    );
  }

  const result = db
    .prepare(
      `INSERT INTO projects (name, licensor, licensee, notification_date, audit_scope_start, audit_scope_end)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, licensor, licensee, notification_date || null, audit_scope_start || null, audit_scope_end || null);

  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(result.lastInsertRowid);

  return NextResponse.json({ project }, { status: 201 });
}

export async function PATCH(request: Request) {
  const db = getDb();
  const body = await request.json();
  const { id, ...fields } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const allowed = ["name", "licensor", "licensee", "notification_date", "audit_scope_start", "audit_scope_end"];
  const updates: string[] = [];
  const params: (string | null)[] = [];

  for (const key of allowed) {
    if (key in fields) {
      updates.push(`${key} = ?`);
      params.push(fields[key] ?? null);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);

  return NextResponse.json({ project });
}
