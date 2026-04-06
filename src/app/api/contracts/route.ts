import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");

  const contracts = projectId
    ? db.prepare("SELECT * FROM contracts WHERE project_id = ? ORDER BY id").all(projectId)
    : db.prepare("SELECT * FROM contracts ORDER BY id").all();

  return NextResponse.json({ contracts });
}
