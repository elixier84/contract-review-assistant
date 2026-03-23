import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { jobManager } from "@/lib/job-manager";
import { analyzeContractsBatch } from "@/lib/claude-analyzer";
import type { AnalysisProgressEvent } from "@/lib/claude-analyzer";

export async function POST(request: Request) {
  const body = await request.json();
  const { contractIds, concurrency = 6 } = body as {
    contractIds: string[];
    concurrency?: number;
  };

  if (!contractIds || !Array.isArray(contractIds) || contractIds.length === 0) {
    return NextResponse.json({ error: "contractIds array required" }, { status: 400 });
  }

  // Validate all contracts exist and have raw_text
  const db = getDb();
  const missing: string[] = [];
  const noText: string[] = [];

  for (const id of contractIds) {
    const row = db.prepare("SELECT id, raw_text FROM contracts WHERE id = ?").get(id) as
      { id: string; raw_text: string | null } | undefined;
    if (!row) {
      missing.push(id);
    } else if (!row.raw_text) {
      noText.push(id);
    }
  }

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Contracts not found: ${missing.join(", ")}` },
      { status: 404 },
    );
  }
  if (noText.length > 0) {
    return NextResponse.json(
      { error: `Contracts have no extracted text: ${noText.join(", ")}. Ingest them first.` },
      { status: 400 },
    );
  }

  // Create job
  const job = jobManager.createJob(contractIds);
  jobManager.startJob(job.id);

  // Bridge progress events to job manager
  const progressHandler = (event: AnalysisProgressEvent) => {
    switch (event.type) {
      case "prompt_start":
        jobManager.updatePromptStatus(job.id, event.contractId!, event.promptName!, "running", event.model);
        break;
      case "prompt_complete":
        jobManager.updatePromptStatus(job.id, event.contractId!, event.promptName!, "completed", event.model);
        break;
      case "prompt_error":
        jobManager.updatePromptStatus(job.id, event.contractId!, event.promptName!, "failed", event.model);
        break;
      case "contract_start":
        jobManager.updateContractStatus(job.id, event.contractId!, "running");
        break;
      case "contract_complete":
        jobManager.updateContractStatus(job.id, event.contractId!, "completed");
        break;
      case "contract_error":
        jobManager.updateContractStatus(job.id, event.contractId!, "failed", event.error);
        break;
      case "cross_contract_start":
        jobManager.updateCrossContractStatus(job.id, "running");
        break;
      case "cross_contract_complete":
        jobManager.updateCrossContractStatus(job.id, "completed");
        break;
      case "cross_contract_error":
        jobManager.updateCrossContractStatus(job.id, "failed");
        break;
    }
  };

  // Fire-and-forget: start analysis in background
  analyzeContractsBatch(contractIds, concurrency, progressHandler, true)
    .then(() => {
      jobManager.completeJob(job.id);
    })
    .catch((err) => {
      jobManager.failJob(job.id, err instanceof Error ? err.message : String(err));
    });

  return NextResponse.json({ jobId: job.id });
}

export async function GET() {
  return NextResponse.json({ error: "Use POST to start a batch analysis" }, { status: 405 });
}
