"use client";

import { useEffect, useState } from "react";
import {
  X, FileText, Scale, BookOpen, Link2, DollarSign, ShieldCheck, Package, Download,
} from "lucide-react";
import type { Contract, Clause, Definition, Relationship, PricingTable, Patent, LicensedProduct, ReviewNote } from "@/types";

const formatDate = (d: string | null) => {
  if (!d) return "";
  const date = new Date(d);
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${date.getDate().toString().padStart(2, "0")}-${months[date.getMonth()]}-${date.getFullYear()}`;
};

interface ContractDetailData {
  contract: Contract & { raw_text?: string };
  clauses: Clause[];
  definitions: Definition[];
  relationships: Relationship[];
  pricing: PricingTable[];
  patents: Patent[];
  products: LicensedProduct[];
  notes: ReviewNote[];
}

type DetailTab = "overview" | "clauses" | "definitions" | "relationships" | "pricing" | "patents";

export default function ContractDetail({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const [data, setData] = useState<ContractDetailData | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  useEffect(() => {
    fetch(`/api/contracts/${contractId}`).then(r => r.json()).then(setData);
  }, [contractId]);

  if (!data) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="bg-white rounded-2xl p-12 text-slate-400 italic">Loading...</div>
      </div>
    );
  }

  const c = data.contract;
  const tabs: { id: DetailTab; label: string; icon: typeof FileText; count: number }[] = [
    { id: "overview", label: "Overview", icon: FileText, count: 0 },
    { id: "clauses", label: "Clauses", icon: Scale, count: data.clauses.length },
    { id: "definitions", label: "Definitions", icon: BookOpen, count: data.definitions.length },
    { id: "relationships", label: "Relations", icon: Link2, count: data.relationships.length },
    { id: "pricing", label: "Pricing", icon: DollarSign, count: data.pricing.length },
    { id: "patents", label: "Patents & Products", icon: ShieldCheck, count: data.patents.length + data.products.length },
  ];

  const parseJson = (json: string | null) => {
    if (!json) return null;
    try { return JSON.parse(json); } catch { return null; }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-start justify-between shrink-0">
          <div>
            <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">{c.type}</div>
            <h2 className="text-xl font-black text-slate-900">{c.id}: {c.name}</h2>
            <div className="flex gap-4 mt-2 text-xs text-slate-500">
              <span>Status: <strong className="text-slate-700">{c.status}</strong></span>
              <span>Effective: <strong className="text-slate-700">{formatDate(c.effective_date)}</strong></span>
              <span>Expiry: <strong className="text-slate-700">{formatDate(c.expiry_date) || "Open Ended"}</strong></span>
              {c.analysis_confidence !== null && (
                <span>Confidence: <strong className={c.analysis_confidence >= 0.8 ? "text-green-600" : c.analysis_confidence >= 0.5 ? "text-yellow-600" : "text-red-600"}>
                  {(c.analysis_confidence * 100).toFixed(0)}%
                </strong></span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/api/contracts/${c.id}/file`}
              className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Download source file"
            >
              <Download size={18} />
            </a>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 px-6 shrink-0 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-slate-100 text-slate-500">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 text-left">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Licensed Technology", value: c.licensed_technology },
                  { label: "Territory", value: c.territory },
                  { label: "Initial Fee", value: c.initial_fee ? `$${c.initial_fee.toLocaleString()}` : null },
                  { label: "Parent Contract", value: c.parent_id },
                ].map(item => item.value && (
                  <div key={item.label} className="bg-slate-50 rounded-xl p-4">
                    <div className="text-[10px] font-black text-slate-400 uppercase">{item.label}</div>
                    <div className="text-sm font-bold text-slate-700 mt-1">{item.value}</div>
                  </div>
                ))}
              </div>
              {data.notes.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-slate-800 mb-3">Review Notes ({data.notes.length})</h3>
                  <div className="space-y-2">
                    {data.notes.map(note => (
                      <div key={note.id} className={`p-3 rounded-xl border text-xs ${
                        note.is_reviewed ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"
                      }`}>
                        <span className={`font-black uppercase text-[9px] ${
                          note.is_reviewed ? "text-green-600" : "text-red-600"
                        }`}>
                          {note.severity} - {note.type}
                        </span>
                        <p className="text-slate-700 font-medium mt-1">{note.issue}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "clauses" && (
            <div className="space-y-3">
              {data.clauses.map(clause => {
                const terms = parseJson(clause.key_terms_json);
                return (
                  <div key={clause.id} className="bg-slate-50 rounded-xl p-4 border">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-blue-100 text-blue-700">{clause.type}</span>
                      {clause.section && <span className="text-xs text-slate-400 font-mono">{clause.section}</span>}
                      {clause.confidence !== null && (
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                          clause.confidence >= 0.8 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {(clause.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{clause.snippet}</p>
                    {terms && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(terms).map(([k, v]) => (
                          <span key={k} className="px-2 py-0.5 bg-white border rounded text-[10px] text-slate-500">
                            <strong>{k}:</strong> {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {data.clauses.length === 0 && <p className="text-slate-400 italic text-sm">No clauses extracted</p>}
            </div>
          )}

          {activeTab === "definitions" && (
            <div className="space-y-2">
              {data.definitions.map(def => (
                <div key={def.id} className="flex gap-4 py-3 border-b border-slate-100">
                  <div className="w-48 shrink-0">
                    <span className="font-black text-sm text-slate-800">{def.term}</span>
                    {def.section && <span className="text-[10px] text-slate-400 block font-mono">{def.section}</span>}
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{def.definition}</p>
                </div>
              ))}
              {data.definitions.length === 0 && <p className="text-slate-400 italic text-sm">No definitions extracted</p>}
            </div>
          )}

          {activeTab === "relationships" && (
            <div className="space-y-3">
              {data.relationships.map(rel => (
                <div key={rel.id} className="bg-slate-50 rounded-xl p-4 border">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-sm text-blue-700">{rel.source_id}</span>
                    <span className="text-slate-400">→</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-indigo-100 text-indigo-700">{rel.type}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-bold text-sm text-blue-700">{rel.target_id}</span>
                    {rel.confidence !== null && (
                      <span className={`ml-auto text-[9px] font-black px-1.5 py-0.5 rounded ${
                        rel.confidence >= 0.8 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {(rel.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {rel.evidence_text && (
                    <p className="text-xs text-slate-500 italic mt-1 leading-relaxed">&ldquo;{rel.evidence_text}&rdquo;</p>
                  )}
                  {rel.evidence_section && (
                    <span className="text-[10px] text-slate-400 font-mono">{rel.evidence_section}</span>
                  )}
                </div>
              ))}
              {data.relationships.length === 0 && <p className="text-slate-400 italic text-sm">No relationships detected</p>}
            </div>
          )}

          {activeTab === "pricing" && (
            <div className="space-y-4">
              {data.pricing.map(pt => {
                const tiers = parseJson(pt.tiers_json);
                const discounts = parseJson(pt.discounts_json);
                return (
                  <div key={pt.id} className="bg-slate-50 rounded-xl p-4 border">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign size={14} className="text-amber-500" />
                      <span className="font-black text-sm text-slate-800">{pt.name || pt.technology}</span>
                      {pt.section && <span className="text-xs text-slate-400 font-mono">{pt.section}</span>}
                      <span className={`ml-auto text-[9px] font-black px-1.5 py-0.5 rounded ${
                        pt.is_used_in_reports ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"
                      }`}>
                        {pt.is_used_in_reports ? "Used in Reports" : "Not Reported"}
                      </span>
                    </div>
                    {pt.royalty_basis && <div className="text-xs text-slate-500 mb-2">Basis: <strong>{pt.royalty_basis}</strong></div>}
                    {tiers && Array.isArray(tiers) && tiers.length > 0 && (
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr className="text-[10px] text-slate-400 uppercase">
                            {Object.keys(tiers[0]).map(k => <th key={k} className="text-left py-1 pr-4">{k}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {tiers.map((tier: Record<string, unknown>, i: number) => (
                            <tr key={i} className="border-t border-slate-200">
                              {Object.values(tier).map((v, j) => <td key={j} className="py-1 pr-4 text-slate-600">{String(v)}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {discounts && (
                      <div className="mt-2 text-xs text-slate-500">
                        Discounts: {typeof discounts === "string" ? discounts : JSON.stringify(discounts)}
                      </div>
                    )}
                  </div>
                );
              })}
              {data.pricing.length === 0 && <p className="text-slate-400 italic text-sm">No pricing tables found</p>}
            </div>
          )}

          {activeTab === "patents" && (
            <div className="space-y-6">
              {data.patents.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                    <ShieldCheck size={14} /> Patents ({data.patents.length})
                  </h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-slate-400 uppercase border-b">
                        <th className="text-left py-2">Country</th>
                        <th className="text-left py-2">Number</th>
                        <th className="text-left py-2">Technology</th>
                        <th className="text-left py-2">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.patents.map(p => (
                        <tr key={p.id} className="border-b border-slate-100">
                          <td className="py-2 font-bold text-slate-700">{p.country}</td>
                          <td className="py-2 font-mono text-slate-600">{p.patent_number}</td>
                          <td className="py-2 text-slate-500">{p.technology}</td>
                          <td className="py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                              p.is_application ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                            }`}>
                              {p.is_application ? "Application" : "Granted"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.products.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                    <Package size={14} /> Licensed Products ({data.products.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {data.products.map(p => (
                      <div key={p.id} className="bg-slate-50 border rounded-lg px-3 py-2 text-xs">
                        <div className="font-bold text-slate-700">{p.product_type}</div>
                        <div className="text-slate-400">{p.category} - {p.technology}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.patents.length === 0 && data.products.length === 0 && (
                <p className="text-slate-400 italic text-sm">No patents or products found</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
