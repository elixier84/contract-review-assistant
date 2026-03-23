"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export type PromptStatusType = "pending" | "running" | "completed" | "failed";

export interface ContractJobState {
  status: string;
  prompts: Record<string, PromptStatusType>;
  promptModels: Record<string, string>;
  error?: string;
}

export interface AnalysisJobState {
  jobId: string | null;
  status: "idle" | "starting" | "running" | "completed" | "failed";
  contracts: Record<string, ContractJobState>;
  crossContractStatus: PromptStatusType;
  error: string | null;
}

const INITIAL_STATE: AnalysisJobState = {
  jobId: null,
  status: "idle",
  contracts: {},
  crossContractStatus: "pending",
  error: null,
};

export function useAnalysisJob() {
  const [state, setState] = useState<AnalysisJobState>(INITIAL_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startBatch = useCallback(async (contractIds: string[], concurrency?: number) => {
    // Close any existing connection
    eventSourceRef.current?.close();

    setState({ ...INITIAL_STATE, status: "starting" });

    try {
      const res = await fetch("/api/analyze/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractIds, concurrency }),
      });

      if (!res.ok) {
        const err = await res.json();
        setState((prev) => ({ ...prev, status: "failed", error: err.error || "Failed to start" }));
        return;
      }

      const { jobId } = await res.json();

      // Connect SSE
      const es = new EventSource(`/api/analyze/batch/${jobId}/stream`);
      eventSourceRef.current = es;

      es.addEventListener("snapshot", (e) => {
        const data = JSON.parse(e.data);
        setState({
          jobId,
          status: "running",
          contracts: data.contracts || {},
          crossContractStatus: data.crossContractStatus || "pending",
          error: null,
        });
      });

      es.addEventListener("prompt_update", (e) => {
        const data = JSON.parse(e.data);
        setState((prev) => {
          const contracts = { ...prev.contracts };
          if (contracts[data.contractId]) {
            contracts[data.contractId] = {
              ...contracts[data.contractId],
              prompts: {
                ...contracts[data.contractId].prompts,
                [data.promptName]: data.status,
              },
              promptModels: {
                ...contracts[data.contractId].promptModels,
                ...(data.model ? { [data.promptName]: data.model } : {}),
              },
            };
          }
          return { ...prev, contracts };
        });
      });

      es.addEventListener("contract_update", (e) => {
        const data = JSON.parse(e.data);
        setState((prev) => {
          const contracts = { ...prev.contracts };
          if (contracts[data.contractId]) {
            contracts[data.contractId] = {
              ...contracts[data.contractId],
              status: data.status,
              ...(data.error ? { error: data.error } : {}),
            };
          }
          return { ...prev, contracts };
        });
      });

      es.addEventListener("cross_contract_update", (e) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({ ...prev, crossContractStatus: data.status }));
      });

      es.addEventListener("job_complete", () => {
        setState((prev) => ({ ...prev, status: "completed" }));
        es.close();
      });

      es.addEventListener("job_error", (e) => {
        const data = JSON.parse(e.data);
        setState((prev) => ({ ...prev, status: "failed", error: data.error }));
        es.close();
      });

      es.onerror = () => {
        // EventSource will auto-reconnect, but if the job is done this is expected
        if (es.readyState === EventSource.CLOSED) {
          setState((prev) => {
            if (prev.status === "running") {
              return { ...prev, status: "failed", error: "Connection lost" };
            }
            return prev;
          });
        }
      };
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "failed",
        error: err instanceof Error ? err.message : "Network error",
      }));
    }
  }, []);

  const reset = useCallback(() => {
    eventSourceRef.current?.close();
    setState(INITIAL_STATE);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => eventSourceRef.current?.close();
  }, []);

  return { ...state, startBatch, reset };
}
