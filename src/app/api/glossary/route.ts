import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const projectId = searchParams.get("project_id");

  const db = getDb();

  const projectFilter = projectId
    ? " AND contract_id IN (SELECT id FROM contracts WHERE project_id = ?)"
    : "";
  const projectParams = projectId ? [projectId] : [];

  let definitions;

  if (query) {
    const pattern = `%${query}%`;
    definitions = db
      .prepare(
        `SELECT * FROM definitions
         WHERE (term LIKE ? OR definition LIKE ?)${projectFilter}
         ORDER BY term`
      )
      .all(pattern, pattern, ...projectParams);
  } else {
    definitions = projectId
      ? db.prepare(
          `SELECT * FROM definitions
           WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)
           ORDER BY term`
        ).all(projectId)
      : db.prepare("SELECT * FROM definitions ORDER BY term").all();
  }

  return NextResponse.json({ definitions });
}
