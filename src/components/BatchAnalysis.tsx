"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Zap, Loader2, CheckCircle2, AlertCircle, XCircle,
  ChevronDown, RotateCcw, GitCompareArrows, Trash2,
} from "lucide-react";
import { useAnalysisJob, type PromptStatusType } from "@/hooks/useAnalysisJob";
import type { Contract } from "@/types";

const PROMPT_LABELS: Record<string, string> = {
  "01-metadata": "Metadata",
  "02-clauses": "Clauses",
  "03-glossary": "Glossary",
  "04-relationships": "Relations",
  "05-pricing": "Pricing",
  "06-patents-products": "Patents",
};

function PromptDot({ status }: { status: PromptStatusType }) {
  if (status === "running") {
    return <Loader2 size={12} className="animate-spin text-blue-500" />;
  }
  if (status === "completed") {
    return <div className="w-3 h-3 rounded-full bg-green-500" />;
  }
  if (status === "failed") {
    return <div className="w-3 h-3 rounded-full bg-red-500" />;
  }
  return <div className="w-3 h-3 rounded-full bg-slate-200" />;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: "bg-slate-100", text: "text-slate-500", label: "Queued" },
    running: { bg: "bg-blue-100", text: "text-blue-700", label: "Analyzing" },
    completed: { bg: "bg-green-100", text: "text-green-700", label: "Complete" },
    failed: { bg: "bg-red-100", text: "text-red-700", label: "Failed" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

export default function BatchAnalysis({ onComplete }: { onComplete?: () => void }) {
  const {
    status, contracts, crossContractStatus, error,
    startBatch, reset,
  } = useAnalysisJob();

  const [availableContracts, setAvailableContracts] = useState<Contract[]>([]);
  const [expandedContracts, setExpandedContracts] = useState<string[]>([]);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Fetch contracts list
  const fetchContracts = useCallback(() => {
    fetch("/api/contracts")
      .then((r) => r.json())
      .then((d) => setAvailableContracts(d.contracts || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  // Notify parent on completion
  useEffect(() => {
    if (status === "completed") {
      onComplete?.();
    }
  }, [status, onComplete]);

  const analyzed = availableContracts.filter((c) => c.analysis_confidence !== null);
  const unanalyzed = availableContracts.filter((c) => c.analysis_confidence === null);
  const allIds = availableContracts.map((c) => c.id);
  const unanalyzedIds = unanalyzed.map((c) => c.id);

  const handleReset = async (ids?: string[]) => {
    setResetting(true);
    try {
      await fetch("/api/analyze/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { contractIds: ids } : {}),
      });
      fetchContracts();
      onComplete?.();
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  };

  const isRunning = status === "running" || status === "starting";

  // Progress calculation
  const contractEntries = Object.entries(contracts);
  const totalContracts = contractEntries.length;
  const completedContracts = contractEntries.filter(([, c]) => c.status === "completed").length;
  const failedContracts = contractEntries.filter(([, c]) => c.status === "failed").length;

  const totalPrompts = totalContracts * 6 + (crossContractStatus !== "pending" ? 1 : 0);
  const completedPrompts = contractEntries.reduce((sum, [, c]) => {
    return sum + Object.values(c.prompts).filter((s) => s === "completed").length;
  }, 0) + (crossContractStatus === "completed" ? 1 : 0);

  const progressPercent = totalPrompts > 0 ? Math.round((completedPrompts / totalPrompts) * 100) : 0;

  const toggleExpand = (id: string) => {
    setExpandedContracts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      {status === "idle" && (
        <div className="space-y-3">
          {/* Status summary */}
          <div className="text-xs text-slate-500">
            <span className="font-bold text-slate-700">{allIds.length}</span> contracts total
            {analyzed.length > 0 && (
              <> &middot; <span className="font-bold text-green-600">{analyzed.length}</span> analyzed</>
            )}
            {unanalyzedIds.length > 0 && (
              <> &middot; <span className="font-bold text-amber-600">{unanalyzedIds.length}</span> pending</>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* New contracts only */}
            {unanalyzedIds.length > 0 && (
              <button
                onClick={() => startBatch(unanalyzedIds)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
              >
                <Zap size={14} /> Analyze New ({unanalyzedIds.length})
              </button>
            )}

            {/* Re-analyze all */}
            <button
              onClick={() => startBatch(allIds)}
              disabled={allIds.length === 0}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap size={14} /> {analyzed.length > 0 ? "Re-analyze All" : "Analyze All"} ({allIds.length})
            </button>

            {/* Reset */}
            {analyzed.length > 0 && !confirmReset && (
              <button
                onClick={() => setConfirmReset(true)}
                className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-red-50 transition-all"
              >
                <Trash2 size={14} /> Reset
              </button>
            )}
          </div>

          {/* Reset confirmation */}
          {confirmReset && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold text-red-800">
                Reset analysis data? Contract files and extracted text will be preserved.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReset()}
                  disabled={resetting}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {resetting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Reset All ({allIds.length})
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {status === "failed" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle size={18} className="text-red-500" />
            <div>
              <div className="text-sm font-bold text-red-800">Analysis Failed</div>
              <div className="text-xs text-red-600">{error}</div>
            </div>
          </div>
          <button
            onClick={reset}
            className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-red-200 transition-colors"
          >
            <RotateCcw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Progress Panel */}
      {(isRunning || status === "completed") && (
        <div className="space-y-3">
          {/* Overall Progress Bar */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {status === "completed" ? "Analysis Complete" : "Analyzing Contracts..."}
                </div>
                <div className="text-xs font-bold text-slate-600">
                  {progressPercent}%
                </div>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    status === "completed" ? "bg-green-500" : "bg-blue-600"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            {isRunning && <Loader2 size={18} className="animate-spin text-blue-500 shrink-0" />}
            {status === "completed" && <CheckCircle2 size={18} className="text-green-500 shrink-0" />}
          </div>

          {/* Summary Stats */}
          <div className="flex gap-4 text-xs">
            <span className="text-slate-500">
              Contracts: <span className="font-bold text-slate-700">{completedContracts}/{totalContracts}</span>
            </span>
            {failedContracts > 0 && (
              <span className="text-red-500">
                Failed: <span className="font-bold">{failedContracts}</span>
              </span>
            )}
            <span className="text-slate-500">
              Prompts: <span className="font-bold text-slate-700">{completedPrompts}/{totalPrompts}</span>
            </span>
          </div>

          {/* Per-Contract Cards */}
          <div className="space-y-2">
            {contractEntries.map(([contractId, contractState]) => {
              const contractMeta = availableContracts.find((c) => c.id === contractId);
              const isExpanded = expandedContracts.includes(contractId);

              return (
                <div
                  key={contractId}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    contractState.status === "completed"
                      ? "border-green-200 bg-green-50/30"
                      : contractState.status === "failed"
                        ? "border-red-200 bg-red-50/30"
                        : contractState.status === "running"
                          ? "border-blue-200 bg-blue-50/30"
                          : "border-slate-200 bg-white"
                  }`}
                >
                  <button
                    onClick={() => toggleExpand(contractId)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-800">
                        {contractId}: {contractMeta?.name || "Unknown"}
                      </span>
                      <StatusBadge status={contractState.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Prompt dots summary */}
                      <div className="flex items-center gap-1">
                        {Object.values(contractState.prompts).map((pStatus, i) => (
                          <PromptDot key={i} status={pStatus} />
                        ))}
                      </div>
                      <ChevronDown
                        size={14}
                        className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 border-t border-slate-100">
                      <div className="grid grid-cols-3 gap-2 pt-3">
                        {Object.entries(contractState.prompts).map(([promptName, pStatus]) => {
                          const model = contractState.promptModels?.[promptName];
                          return (
                            <div
                              key={promptName}
                              className="flex items-center gap-2 text-xs"
                            >
                              <PromptDot status={pStatus} />
                              <span className={`font-medium ${
                                pStatus === "completed" ? "text-green-700" :
                                pStatus === "running" ? "text-blue-700" :
                                pStatus === "failed" ? "text-red-700" :
                                "text-slate-400"
                              }`}>
                                {PROMPT_LABELS[promptName] || promptName}
                              </span>
                              {model && (
                                <span className={`text-[9px] font-mono ${
                                  model === "haiku" ? "text-violet-400" : "text-blue-400"
                                }`}>
                                  {model}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {contractState.error && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                          {contractState.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cross-Contract Analysis */}
          {crossContractStatus !== "pending" && (
            <div
              className={`border rounded-xl px-4 py-3 flex items-center gap-3 ${
                crossContractStatus === "completed"
                  ? "border-green-200 bg-green-50/30"
                  : crossContractStatus === "failed"
                    ? "border-red-200 bg-red-50/30"
                    : "border-blue-200 bg-blue-50/30"
              }`}
            >
              <GitCompareArrows size={16} className={
                crossContractStatus === "completed" ? "text-green-600" :
                crossContractStatus === "running" ? "text-blue-600" :
                "text-red-600"
              } />
              <span className="text-xs font-bold text-slate-700">Cross-Contract Analysis</span>
              <StatusBadge status={crossContractStatus} />
              {crossContractStatus === "running" && (
                <Loader2 size={12} className="animate-spin text-blue-500" />
              )}
            </div>
          )}

          {/* Done / Reset */}
          {status === "completed" && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-green-600 font-bold flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                All analyses complete. Dashboard data refreshed.
              </div>
              <button
                onClick={reset}
                className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
