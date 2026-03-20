"use client";

import { useState } from "react";
import {
  FileText, LayoutDashboard, Tag, DollarSign, Book, Pencil, FileSearch, Download,
} from "lucide-react";
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
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg"><FileSearch size={24} /></div>
            <h1 className="text-xl font-black text-slate-800 tracking-tighter">Contract Review Assistant</h1>
          </div>
          <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg overflow-x-auto shadow-inner border border-slate-200">
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
          <a
            href="/api/export"
            className="px-3 py-2 bg-green-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 hover:bg-green-700 transition-colors shadow-sm whitespace-nowrap"
          >
            <Download size={14} /> Export XLSX
          </a>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-6">
        {activeTab === "overview" && <AuditOverview />}
        {activeTab === "listing" && <ContractListing />}
        {activeTab === "technology" && <TechnologyView />}
        {activeTab === "pricing" && <PricingView />}
        {activeTab === "glossary" && <GlossaryView />}
        {activeTab === "notes" && <ReviewNotes />}
      </main>
    </div>
  );
}
