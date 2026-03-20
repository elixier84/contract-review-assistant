"use client";

import { useEffect, useState, useMemo } from "react";
import { ChevronDown, Box, Banknote, Clock, Activity } from "lucide-react";

interface PricingRow {
  id: number;
  contract_id: string;
  contract_name: string;
  technology: string | null;
  name: string | null;
  section: string | null;
  royalty_basis: string | null;
  tiers_json: string | null;
  discounts_json: string | null;
  cpi_adjustment: string | null;
  aggregation_rules: string | null;
  is_used_in_reports: number;
  confidence: number | null;
  needs_review: number;
}

export default function PricingView() {
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/pricing")
      .then(r => r.json())
      .then(data => {
        setPricing(data.pricing as PricingRow[]);
        // Expand all contracts by default
        const contractIds = [...new Set((data.pricing as PricingRow[]).map(p => p.contract_id))];
        setExpanded(contractIds);
      });
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { contractId: string; contractName: string; tables: PricingRow[] }>();
    for (const row of pricing) {
      if (!map.has(row.contract_id)) {
        map.set(row.contract_id, { contractId: row.contract_id, contractName: row.contract_name, tables: [] });
      }
      map.get(row.contract_id)!.tables.push(row);
    }
    return Array.from(map.values());
  }, [pricing]);

  const parseTiers = (json: string | null) => {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  };

  const parseDiscounts = (json: string | null) => {
    if (!json) return [];
    try { return JSON.parse(json); } catch { return []; }
  };

  return (
    <div className="space-y-6 animate-in fade-in text-left">
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shadow-sm"><Banknote size={24} /></div>
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tighter">Pricing Tables</h2>
          <p className="text-xs text-slate-400 font-mono uppercase tracking-widest">
            {pricing.length} tables across {grouped.length} contracts
          </p>
        </div>
      </div>

      {grouped.map(group => (
        <div key={group.contractId} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <button
            onClick={() => setExpanded(prev => prev.includes(group.contractId) ? prev.filter(id => id !== group.contractId) : [...prev, group.contractId])}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <Box size={18} className="text-blue-500" />
              <span className="font-black text-slate-800 tracking-tight">
                {group.contractId}: {group.contractName}
              </span>
              <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold">
                {group.tables.length} table{group.tables.length !== 1 ? "s" : ""}
              </span>
            </div>
            <ChevronDown className={`text-slate-300 transition-transform ${expanded.includes(group.contractId) ? "rotate-180" : ""}`} size={20} />
          </button>

          {expanded.includes(group.contractId) && (
            <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-4">
              {group.tables.map(table => {
                const tiers = parseTiers(table.tiers_json);
                const discounts = parseDiscounts(table.discounts_json);
                return (
                  <div key={table.id} className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-slate-800">{table.name || table.technology}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                          {table.section} {table.technology && `| ${table.technology}`}
                        </div>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-sm border ${
                        table.is_used_in_reports ? "bg-green-50 text-green-700 border-green-100" : "bg-slate-50 text-slate-400 border-slate-100"
                      }`}>
                        {table.is_used_in_reports ? <Activity size={10} /> : <Clock size={10} />}
                        {table.is_used_in_reports ? "Used" : "Not Reported"}
                      </div>
                    </div>

                    {/* Tier table */}
                    {tiers.length > 0 && (
                      <table className="w-full text-xs border rounded-lg overflow-hidden">
                        <thead className="bg-slate-50">
                          <tr className="text-[10px] text-slate-400 uppercase font-black">
                            <th className="px-3 py-2 text-left">From</th>
                            <th className="px-3 py-2 text-left">To</th>
                            <th className="px-3 py-2 text-right">Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {tiers.map((tier: { from: number; to: number | null; rate: number; currency?: string }, i: number) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-mono">{tier.from?.toLocaleString()}</td>
                              <td className="px-3 py-2 font-mono">{tier.to ? tier.to.toLocaleString() : "+"}</td>
                              <td className="px-3 py-2 text-right font-bold text-green-700">${tier.rate?.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* Discounts */}
                    {discounts.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Discounts</div>
                        {discounts.map((d: { type: string; amount?: number; condition?: string; description?: string }, i: number) => (
                          <div key={i} className="text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded border">
                            <span className="font-bold">{d.type}</span>
                            {d.amount && <span className="text-green-600 ml-2">-${d.amount}</span>}
                            {(d.condition || d.description) && <span className="text-slate-400 ml-2">| {d.condition || d.description}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {pricing.length === 0 && (
        <div className="bg-white rounded-2xl p-12 border text-center text-slate-400 italic">
          Run analysis to populate pricing tables
        </div>
      )}
    </div>
  );
}
