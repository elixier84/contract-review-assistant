"use client";

import { useEffect, useState } from "react";
import { Search, Plus, Book } from "lucide-react";
import type { Definition } from "@/types";

export default function GlossaryView({ projectId }: { projectId?: number | null }) {
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("q", searchTerm);
    if (projectId) params.set("project_id", String(projectId));
    const qs = params.toString() ? `?${params}` : "";
    fetch(`/api/glossary${qs}`).then(r => r.json()).then(d => setDefinitions(d.definitions));
  }, [searchTerm, projectId]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-left">
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-3">
          <Book size={24} className="text-blue-500" />
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tighter">Contract Glossary</h2>
            <p className="text-xs text-slate-400">{definitions.length} definitions found</p>
          </div>
        </div>
        <div className="relative flex-1 max-w-lg w-full rounded-xl overflow-hidden bg-slate-50 shadow-inner border">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search definitions..."
            className="w-full pl-12 pr-4 py-3 bg-transparent text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold tracking-tight"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 text-left">
        {definitions.map(item => (
          <div key={item.id} className="bg-white border-2 rounded-2xl p-6 shadow-sm group hover:border-blue-300 transition-colors border-transparent">
            <h3 className="text-lg font-black text-slate-900 group-hover:text-blue-600 transition-colors tracking-tight">{item.term}</h3>
            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 font-medium italic mt-2 shadow-inner">{item.definition}</p>
            <div className="flex justify-end mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {item.contract_id} {item.section}
            </div>
          </div>
        ))}
        {definitions.length === 0 && (
          <div className="bg-white rounded-2xl p-12 border text-center text-slate-400 italic">
            {searchTerm ? "No matching definitions" : "Run analysis to populate glossary"}
          </div>
        )}
      </div>
    </div>
  );
}
