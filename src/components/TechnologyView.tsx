"use client";

import { useEffect, useState } from "react";
import { ChevronDown, FileText, Box, Layers, History, Shield, Package } from "lucide-react";

interface TechContract {
  role: string;
  id: string;
  name: string;
  type: string;
  status: string;
}

interface TechPatent {
  country: string;
  patent_number: string;
  is_application: number;
}

interface TechProduct {
  product_type: string;
  category: string;
  contract_id: string;
}

interface EnrichedTechnology {
  id: number;
  name: string;
  status: string;
  description: string | null;
  contracts: TechContract[];
  patents: TechPatent[];
  products: TechProduct[];
}

export default function TechnologyView({ projectId }: { projectId?: number | null }) {
  const [techs, setTechs] = useState<EnrichedTechnology[]>([]);
  const [expanded, setExpanded] = useState<number[]>([]);

  useEffect(() => {
    const qs = projectId ? `?project_id=${projectId}` : "";
    fetch(`/api/technologies${qs}`)
      .then(r => r.json())
      .then(data => {
        const list = data.technologies as EnrichedTechnology[];
        setTechs(list);
        setExpanded(list.map(t => t.id));
      });
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in text-left">
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
        <Layers className="text-blue-500" size={24} />
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Technology Inventory</h2>
          <p className="text-xs text-slate-400">{techs.length} technologies detected</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {techs.map(tech => (
          <div key={tech.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm">
            <div
              className="p-6 flex justify-between items-center cursor-pointer"
              onClick={() => setExpanded(prev => prev.includes(tech.id) ? prev.filter(t => t !== tech.id) : [...prev, tech.id])}
            >
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-blue-50 text-blue-500 shadow-inner"><Box size={24} /></div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">{tech.name}</h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {tech.contracts.length} governing agreement{tech.contracts.length !== 1 ? "s" : ""}
                    {tech.patents.length > 0 && ` · ${tech.patents.length} patent${tech.patents.length !== 1 ? "s" : ""}`}
                    {tech.products.length > 0 && ` · ${tech.products.length} product${tech.products.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
              </div>
              <ChevronDown className={`text-slate-300 transition-transform ${expanded.includes(tech.id) ? "rotate-180 text-blue-500" : ""}`} size={20} />
            </div>

            {expanded.includes(tech.id) && (
              <div className="bg-slate-50/50 border-t p-8 space-y-6 animate-in slide-in-from-top-2">
                {/* Governing Contracts */}
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <History size={14} /> Governing Contracts
                </h4>
                <div className="flex flex-col gap-4 pl-4 relative">
                  <div className="absolute left-[21px] top-4 bottom-4 w-0.5 bg-slate-200" />
                  {tech.contracts.map((tc, idx) => (
                    <div key={idx} className="flex items-center gap-4 relative z-10">
                      <div className="w-[14px] h-[14px] rounded-full border-2 border-slate-300 bg-white shadow-sm" />
                      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-6 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 font-mono tracking-tight">
                          <FileText size={14} className="text-slate-400" /> {tc.id}: {tc.name}
                        </div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold border-l border-slate-100 pl-3">{tc.role}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Patents */}
                {tech.patents.length > 0 && (
                  <>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mt-4">
                      <Shield size={14} /> Patents
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {tech.patents.map((p, idx) => (
                        <div key={idx} className="bg-white border rounded-lg px-3 py-2 text-xs">
                          <span className="font-bold text-slate-700">{p.country}</span>
                          <span className="text-slate-400 ml-2">{p.patent_number}</span>
                          {p.is_application === 1 && <span className="text-[9px] text-amber-600 ml-1">(App)</span>}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Products */}
                {tech.products.length > 0 && (
                  <>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mt-4">
                      <Package size={14} /> Licensed Products
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {tech.products.map((p, idx) => (
                        <div key={idx} className="bg-white border rounded-lg px-3 py-2 text-xs">
                          <span className="font-bold text-slate-700">{p.product_type}</span>
                          {p.category && <span className="text-slate-400 ml-2">({p.category})</span>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}

        {techs.length === 0 && (
          <div className="bg-white rounded-2xl p-12 border text-center text-slate-400 italic">
            Run analysis to detect technologies
          </div>
        )}
      </div>
    </div>
  );
}
