import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { analyzeContract } from "@/lib/claude-analyzer";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const contract = db
    .prepare("SELECT id, name, raw_text, analysis_confidence FROM contracts WHERE id = ?")
    .get(id) as { id: string; name: string; raw_text: string | null; analysis_confidence: number | null } | undefined;

  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  if (!contract.raw_text) {
    return NextResponse.json(
      { error: "No extracted text available. Ingest the contract first." },
      { status: 400 },
    );
  }

  // Run analysis (this is synchronous and can take several minutes)
  try {
    await analyzeContract(id);

    // Fetch updated contract data
    const updated = db
      .prepare("SELECT id, name, analysis_confidence, needs_review FROM contracts WHERE id = ?")
      .get(id);

    return NextResponse.json({
      status: "completed",
      contractId: id,
      contract: updated,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        contractId: id,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
