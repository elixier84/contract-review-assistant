import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { ingestFile, type IngestResult } from "@/lib/ingestion";

const CONTRACTS_DIR = path.join(process.cwd(), "contracts");

export async function POST(request: Request) {
  // Ensure contracts/ directory exists
  if (!fs.existsSync(CONTRACTS_DIR)) {
    fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  }

  const formData = await request.formData();
  const files = formData.getAll("files") as File[];
  const projectId = formData.get("project_id") as string | null;

  if (files.length === 0) {
    return NextResponse.json(
      { error: "No files provided" },
      { status: 400 },
    );
  }

  // Validate file types
  const ALLOWED_EXTENSIONS = [".docx", ".doc", ".pdf", ".txt"];
  const results: IngestResult[] = [];

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      results.push({
        id: "",
        fileName: file.name,
        status: "error",
        message: `Unsupported file type: ${ext}. Supported: ${ALLOWED_EXTENSIONS.join(", ")}`,
      });
      continue;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await ingestFile(buffer, file.name, CONTRACTS_DIR, projectId ? Number(projectId) : undefined);
      results.push(result);
    } catch (err) {
      results.push({
        id: "",
        fileName: file.name,
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = {
    total: results.length,
    new: results.filter(r => r.status === "new").length,
    updated: results.filter(r => r.status === "updated").length,
    duplicates: results.filter(r => r.status === "duplicate_content").length,
    errors: results.filter(r => r.status === "error").length,
  };

  return NextResponse.json({ results, summary });
}
