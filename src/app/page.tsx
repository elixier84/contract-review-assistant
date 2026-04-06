"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, LayoutDashboard, Tag, DollarSign, Book, Pencil, FileSearch, Download, FolderOpen,
} from "lucide-react";
import { useActiveProject } from "@/hooks/useActiveProject";
import AuditOverview from "@/components/AuditOverview";
import ContractListing from "@/components/ContractListing";
import TechnologyView from "@/components/TechnologyView";
import PricingView from "@/components/PricingView";
import GlossaryView from "@/components/GlossaryView";
import ReviewNotes from "@/components/ReviewNotes";

const tabs = [
  { id: "overview", label: "Audit Overview", icon: FileText },
  { id: "listing", label: "Contract Listing", icon: LayoutDashboard },
  { id: "technology", label: "Technology", icon: Tag },
  { id: "pricing", label: "Pricing", icon: DollarSign },
  { id: "glossary", label: "Glossary", icon: Book },
  { id: "notes", label: "Review Notes", icon: Pencil },
];

export default function Home() {
  const router = useRouter();
  const { projectId, project } = useActiveProject();
  const [activeTab, setActiveTab] = useState("overview");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Wait for localStorage to be read
    const stored = localStorage.getItem("activeProjectId");
    if (!stored) {
      router.push("/projects");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        {/* Top bar: logo + project info + action buttons */}
        <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg"><FileSearch size={24} /></div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tighter">Contract Review Assistant</h1>
              {project && (
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span className="font-bold text-slate-600">{project.name}</span>
                  <span>({project.licensor} / {project.licensee})</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/projects")}
              className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all border border-slate-200 whitespace-nowrap"
            >
              <FolderOpen size={16} /> Projects
            </button>
            <a
              href={`/api/export-html?project_id=${projectId}`}
              className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all border border-slate-200 whitespace-nowrap"
            >
              <Download size={16} /> Export HTML
            </a>
          </div>
        </div>
        {/* Tab navigation */}
        <div className="max-w-7xl mx-auto px-6 pb-2">
          <div className="flex bg-slate-100 p-1 rounded-lg overflow-x-auto shadow-inner border border-slate-200 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id ? "bg-white shadow-sm text-blue-600 font-black" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-6">
        {activeTab === "overview" && <AuditOverview projectId={projectId} />}
        {activeTab === "listing" && <ContractListing projectId={projectId} />}
        {activeTab === "technology" && <TechnologyView projectId={projectId} />}
        {activeTab === "pricing" && <PricingView projectId={projectId} />}
        {activeTab === "glossary" && <GlossaryView projectId={projectId} />}
        {activeTab === "notes" && <ReviewNotes projectId={projectId} />}
      </main>
    </div>
  );
}
