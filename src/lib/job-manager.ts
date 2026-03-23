import crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = "pending" | "running" | "completed" | "failed";
export type PromptStatus = "pending" | "running" | "completed" | "failed";

const PROMPT_NAMES = [
  "01-metadata", "02-clauses", "03-glossary",
  "04-relationships", "05-pricing", "06-patents-products",
] as const;

export interface ContractProgress {
  contractId: string;
  status: JobStatus;
  prompts: Record<string, PromptStatus>;
  promptModels: Record<string, string>;
  error?: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  contractIds: string[];
  contracts: Map<string, ContractProgress>;
  crossContractStatus: PromptStatus;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export type SSEListener = (event: string, data: string) => void;

// ---------------------------------------------------------------------------
// Job Manager (singleton)
// ---------------------------------------------------------------------------

class JobManager {
  private jobs = new Map<string, Job>();
  private listeners = new Map<string, Set<SSEListener>>();

  createJob(contractIds: string[]): Job {
    const id = crypto.randomUUID();

    const contracts = new Map<string, ContractProgress>();
    for (const cid of contractIds) {
      const prompts: Record<string, PromptStatus> = {};
      for (const name of PROMPT_NAMES) {
        prompts[name] = "pending";
      }
      contracts.set(cid, { contractId: cid, status: "pending", prompts, promptModels: {} });
    }

    const job: Job = {
      id,
      status: "pending",
      contractIds,
      contracts,
      crossContractStatus: "pending",
      createdAt: new Date(),
    };

    this.jobs.set(id, job);
    this.listeners.set(id, new Set());

    // Clean up old jobs
    this.cleanup();

    return job;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  subscribe(jobId: string, listener: SSEListener): () => void {
    const listeners = this.listeners.get(jobId);
    if (!listeners) return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  private emit(jobId: string, event: string, data: unknown): void {
    const listeners = this.listeners.get(jobId);
    if (!listeners) return;
    const json = JSON.stringify(data);
    for (const listener of listeners) {
      try {
        listener(event, json);
      } catch {
        listeners.delete(listener);
      }
    }
  }

  startJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = "running";
    this.emit(jobId, "job_status", { status: "running" });
  }

  updatePromptStatus(jobId: string, contractId: string, promptName: string, status: PromptStatus, model?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const contract = job.contracts.get(contractId);
    if (!contract) return;

    contract.prompts[promptName] = status;
    if (model) contract.promptModels[promptName] = model;

    // If prompt started, mark contract as running
    if (status === "running" && contract.status === "pending") {
      contract.status = "running";
    }

    this.emit(jobId, "prompt_update", { contractId, promptName, status, model: contract.promptModels[promptName] });
  }

  updateContractStatus(jobId: string, contractId: string, status: JobStatus, error?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const contract = job.contracts.get(contractId);
    if (!contract) return;

    contract.status = status;
    if (error) contract.error = error;

    this.emit(jobId, "contract_update", { contractId, status, error });
  }

  updateCrossContractStatus(jobId: string, status: PromptStatus): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.crossContractStatus = status;
    this.emit(jobId, "cross_contract_update", { status });
  }

  completeJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = "completed";
    job.completedAt = new Date();
    this.emit(jobId, "job_complete", {
      status: "completed",
      completedAt: job.completedAt.toISOString(),
    });
  }

  failJob(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = "failed";
    job.error = error;
    job.completedAt = new Date();
    this.emit(jobId, "job_error", { status: "failed", error });
  }

  /** Serialize job state for SSE snapshot */
  getJobSnapshot(jobId: string): Record<string, unknown> | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    const contracts: Record<string, { status: string; prompts: Record<string, string>; promptModels: Record<string, string>; error?: string }> = {};
    for (const [cid, cp] of job.contracts) {
      contracts[cid] = { status: cp.status, prompts: cp.prompts, promptModels: cp.promptModels };
      if (cp.error) contracts[cid].error = cp.error;
    }

    return {
      jobId: job.id,
      status: job.status,
      contractIds: job.contractIds,
      contracts,
      crossContractStatus: job.crossContractStatus,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      error: job.error ?? null,
    };
  }

  /** Remove jobs older than 1 hour */
  private cleanup(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, job] of this.jobs) {
      if (job.createdAt.getTime() < oneHourAgo) {
        this.jobs.delete(id);
        this.listeners.delete(id);
      }
    }
  }
}

export const jobManager = new JobManager();
