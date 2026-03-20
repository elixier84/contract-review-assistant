"use client";

import { Fragment, useEffect, useState, useMemo, useCallback } from "react";
import {
  Search, ChevronDown, ExternalLink, Link, List, GitGraph, Network, Upload,
} from "lucide-react";
import type { Contract } from "@/types";
import TimelineView from "@/components/TimelineView";
import RelationshipDiagram from "@/components/RelationshipDiagram";
import ContractDetail from "@/components/ContractDetail";
import ContractUpload from "@/components/ContractUpload";

const formatDate = (d: string | null) => {
  if (!d) return "";
  const date = new Date(d);
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${date.getDate().toString().padStart(2, "0")}-${months[date.getMonth()]}-${date.getFullYear()}`;
};

type ViewMode = "list" | "timeline" | "relationship";

function ContractRow({ contract, isChild, isExpandable, isExpanded, onToggle, onView }: {
  contract: Contract; isChild?: boolean; isExpandable?: boolean; isExpanded?: boolean; onToggle?: () => void; onView?: (id: string) => void;
}) {
  return (
    <tr className={`group transition-all ${isChild ? "bg-slate-50/40" : ""} hover:bg-slate-50`}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3 text-left">
          {isChild && <div className="w-6 border-b border-slate-200 ml-1 mb-2" />}
          {isExpandable && (
            <button onClick={onToggle} className="p-1 hover:bg-slate-200 rounded transition-colors shadow-sm bg-white border border-slate-100">
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
            </button>
          )}
          <div>
            <div className="font-bold text-sm text-slate-900">{contract.id}: {contract.name}</div>
            <div className="text-[10px] text-slate-400 font-mono tracking-tight mt-0.5 flex items-center gap-1.5">
              <Link size={10} /> {contract.type}
              {contract.analysis_confidence !== null && (
                <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-black ${
                  contract.analysis_confidence >= 0.8 ? "bg-green-100 text-green-700" :
                  contract.analysis_confidence >= 0.5 ? "bg-yellow-100 text-yellow-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {(contract.analysis_confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm bg-slate-100 text-slate-500">
          {contract.type}
        </span>
      </td>
      <td className="px-6 py-4 text-xs font-mono text-slate-500">{contract.status}</td>
      <td className="px-6 py-4 text-xs font-mono text-slate-500">{formatDate(contract.effective_date)}</td>
      <td className="px-6 py-4 text-xs font-mono text-slate-500">{formatDate(contract.expiry_date) || "Open Ended"}</td>
      <td className="px-6 py-4 text-right">
        <button onClick={() => onView?.(contract.id)} className="p-2 rounded-lg transition-all text-slate-400 hover:text-blue-600"><ExternalLink size={16} /></button>
      </td>
    </tr>
  );
}

export default function ContractListing() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedMasters, setExpandedMasters] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const fetchContracts = useCallback(() => {
    fetch("/api/contracts").then(r => r.json()).then(d => {
      setContracts(d.contracts);
      const masters = d.contracts.filter((c: Contract) => !c.parent_id).map((c: Contract) => c.id);
      setExpandedMasters(masters);
    });
  }, []);

  useEffect(() => {
    fetchContracts();
    const timer = setInterval(() => {
      if (!document.hidden) fetchContracts();
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchContracts]);

  const filtered = useMemo(() => {
    return contracts.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [contracts, searchQuery]);

  const masters = filtered.filter(c => !c.parent_id);
  const getChildren = (parentId: string) => filtered.filter(c => c.parent_id === parentId);

  const views: { id: ViewMode; label: string; icon: typeof List }[] = [
    { id: "list", label: "List", icon: List },
    { id: "timeline", label: "Timeline", icon: GitGraph },
    { id: "relationship", label: "Relationships", icon: Network },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-left">
      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner">
            {views.map(v => (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id)}
                className={`px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${
                  viewMode === v.id ? "bg-white shadow-sm text-blue-600" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <v.icon size={14} /> {v.label}
              </button>
            ))}
          </div>
        </div>
        {viewMode === "list" && (
          <div className="flex flex-1 items-center gap-3 max-w-2xl w-full">
            <div className="flex flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search contracts..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm outline-none shadow-inner"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowUpload(!showUpload)}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 ${
                showUpload
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Upload size={14} /> Upload
            </button>
          </div>
        )}
      </div>

      {/* Upload Panel */}
      {showUpload && viewMode === "list" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <ContractUpload onComplete={() => { fetchContracts(); }} />
        </div>
      )}

      {/* Views */}
      {viewMode === "list" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-[10px] text-slate-400 uppercase font-black">
                <th className="px-6 py-4 font-black tracking-wider">Contract</th>
                <th className="px-6 py-4 font-black tracking-wider">Type</th>
                <th className="px-6 py-4 font-black tracking-wider">Status</th>
                <th className="px-6 py-4 font-black tracking-wider">Effective</th>
                <th className="px-6 py-4 font-black tracking-wider">Expiry</th>
                <th className="px-6 py-4 text-right font-black tracking-wider">View</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm font-medium">
              {masters.map(master => {
                const children = getChildren(master.id);
                const hasChildren = children.length > 0;
                return (
                  <Fragment key={master.id}>
                    <ContractRow
                      contract={master}
                      isExpandable={hasChildren}
                      isExpanded={expandedMasters.includes(master.id)}
                      onToggle={() => setExpandedMasters(prev =>
                        prev.includes(master.id) ? prev.filter(m => m !== master.id) : [...prev, master.id]
                      )}
                      onView={setSelectedId}
                    />
                    {expandedMasters.includes(master.id) && children.map(child => (
                      <ContractRow key={child.id} contract={child} isChild onView={setSelectedId} />
                    ))}
                  </Fragment>
                );
              })}
              {contracts.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">Loading contracts...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === "timeline" && <TimelineView />}
      {viewMode === "relationship" && <RelationshipDiagram />}

      {/* Contract Detail Modal */}
      {selectedId && (
        <ContractDetail contractId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
