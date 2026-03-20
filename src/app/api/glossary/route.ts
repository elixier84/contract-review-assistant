import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  const db = getDb();

  let definitions;

  if (query) {
    const pattern = `%${query}%`;
    definitions = db
      .prepare(
        `SELECT * FROM definitions
         WHERE term LIKE ? OR definition LIKE ?
         ORDER BY term`
      )
      .all(pattern, pattern);
  } else {
    definitions = db
      .prepare("SELECT * FROM definitions ORDER BY term")
      .all();
  }

  return NextResponse.json({ definitions });
}
