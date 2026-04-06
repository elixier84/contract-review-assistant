"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2, Scale,
  Briefcase, Bell,
  Pencil, Link, Save, Edit3,
} from "lucide-react";
import type { Contract, Clause, ReviewNote } from "@/types";

interface Project {
  id: number;
  name: string;
  licensor: string;
  licensee: string;
  notification_date: string | null;
  audit_scope_start: string | null;
  audit_scope_end: string | null;
}

const formatDate = (d: string | null) => {
  if (!d) return "";
  const date = new Date(d);
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${date.getDate().toString().padStart(2, "0")}-${months[date.getMonth()]}-${date.getFullYear()}`;
};

export default function AuditOverview({ projectId }: { projectId?: number | null }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [auditClauses, setAuditClauses] = useState<Clause[]>([]);
  const [retentionClauses, setRetentionClauses] = useState<Clause[]>([]);
  const [interestClauses, setInterestClauses] = useState<Clause[]>([]);
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", licensor: "", licensee: "",
    notification_date: "", audit_scope_start: "", audit_scope_end: "",
  });

  const fetchAll = useCallback(() => {
    const qs = projectId ? `?project_id=${projectId}` : "";
    const pqs = projectId ? `&project_id=${projectId}` : "";
    fetch(`/api/contracts${qs}`).then(r => r.json()).then(d => setContracts(d.contracts));
    fetch(`/api/clauses?type=audit_right${pqs}`).then(r => r.json()).then(d => setAuditClauses(d.clauses));
    fetch(`/api/clauses?type=data_retention${pqs}`).then(r => r.json()).then(d => setRetentionClauses(d.clauses));
    fetch(`/api/clauses?type=interest${pqs}`).then(r => r.json()).then(d => setInterestClauses(d.clauses));
    fetch(`/api/notes${qs}`).then(r => r.json()).then(d => setNotes(d.notes));
    if (projectId) {
      fetch(`/api/projects/${projectId}`).then(r => r.json()).then(d => {
        if (d.project) setProject(d.project);
      });
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(() => {
      if (!document.hidden) fetchAll();
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const pendingCount = notes.filter(n => !n.is_reviewed).length;
  const reviewedOnlyCount = notes.filter(n => n.is_reviewed && !n.narrative).length;
  const resolvedCount = notes.filter(n => n.is_reviewed && !!n.narrative).length;

  const parseKeyTerms = (json: string | null) => {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  };

  const handleEditStart = useCallback(() => {
    setEditForm({
      name: project?.name || "",
      licensor: project?.licensor || "",
      licensee: project?.licensee || "",
      notification_date: project?.notification_date || "",
      audit_scope_start: project?.audit_scope_start || "",
      audit_scope_end: project?.audit_scope_end || "",
    });
    setIsEditing(true);
  }, [project]);

  const handleSaveProject = useCallback(async () => {
    if (project) {
      // Update existing
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id, ...editForm }),
      });
      const data = await res.json();
      setProject(data.project);
    } else {
      // Create new
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      setProject(data.project);
    }
    setIsEditing(false);
  }, [project, editForm]);

  const projectName = project?.name || "Orion Audio License Compliance Audit";
  const projectLicensor = project?.licensor || "Orion Audio Licensing Corporation";
  const projectLicensee = project?.licensee || "Sakura Electronics Co., Ltd.";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative text-left">
      {/* Project Header */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 text-left">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest">
            <Briefcase size={12} /> Project Header
          </div>
          {isEditing ? (
            <div className="space-y-3 mt-2">
              <input
                type="text"
                value={editForm.name}
                onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full text-xl font-black text-slate-900 bg-slate-50 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Project Name"
              />
              <div className="flex gap-3">
                <input
                  type="text"
                  value={editForm.licensor}
                  onChange={e => setEditForm(prev => ({ ...prev, licensor: e.target.value }))}
                  className="flex-1 text-sm bg-slate-50 border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Licensor"
                />
                <input
                  type="text"
                  value={editForm.licensee}
                  onChange={e => setEditForm(prev => ({ ...prev, licensee: e.target.value }))}
                  className="flex-1 text-sm bg-slate-50 border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Licensee"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notification Date</label>
                  <input
                    type="date"
                    value={editForm.notification_date}
                    onChange={e => setEditForm(prev => ({ ...prev, notification_date: e.target.value }))}
                    className="w-full text-sm bg-slate-50 border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audit Period Start</label>
                  <input
                    type="date"
                    value={editForm.audit_scope_start}
                    onChange={e => setEditForm(prev => ({ ...prev, audit_scope_start: e.target.value }))}
                    className="w-full text-sm bg-slate-50 border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audit Period End</label>
                  <input
                    type="date"
                    value={editForm.audit_scope_end}
                    onChange={e => setEditForm(prev => ({ ...prev, audit_scope_end: e.target.value }))}
                    className="w-full text-sm bg-slate-50 border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveProject} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 hover:bg-blue-700">
                  <Save size={12} /> Save
                </button>
                <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 border text-xs font-bold text-slate-500 rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-900">{projectName}</h2>
                <button onClick={handleEditStart} className="p-1.5 text-slate-300 hover:text-blue-500 transition-colors rounded-lg hover:bg-blue-50">
                  <Edit3 size={14} />
                </button>
              </div>
              <div className="flex gap-4 text-sm text-slate-500 italic font-medium">
                <span>Licensor: {projectLicensor}</span>
                <span className="text-slate-300">|</span>
                <span>Licensee: {projectLicensee}</span>
              </div>
            </>
          )}
        </div>
        <div className="flex bg-blue-50 border border-blue-100 rounded-2xl p-4 gap-6 shrink-0 items-center">
          {project?.notification_date && (
            <>
              <div className="text-center">
                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Notification</div>
                <div className="text-blue-900 font-mono text-sm font-bold">{formatDate(project.notification_date)}</div>
              </div>
              <div className="w-px bg-blue-200 h-8 self-center" />
            </>
          )}
          {(project?.audit_scope_start || project?.audit_scope_end) && (
            <>
              <div className="text-center">
                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Audit Period</div>
                <div className="text-blue-900 font-mono text-sm font-bold">
                  {formatDate(project.audit_scope_start)} — {formatDate(project.audit_scope_end)}
                </div>
              </div>
              <div className="w-px bg-blue-200 h-8 self-center" />
            </>
          )}
          <div className="text-center">
            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Contracts</div>
            <div className="text-blue-900 font-mono text-sm font-bold">{contracts.length}</div>
          </div>
          <div className="w-px bg-blue-200 h-8 self-center" />
          <div className="text-center">
            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Review Notes</div>
            <div className="text-blue-900 font-mono text-sm font-bold">{notes.length}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column */}
        <div className="lg:col-span-1 space-y-8">
          {/* Contracts in Scope */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-4"><Bell size={18} className="text-amber-500" /> Contracts in Scope</h3>
            <div className="space-y-3">
              {contracts.map(contract => (
                <div key={contract.id} className="flex items-center justify-between p-3 rounded-xl border bg-green-50 border-green-100">
                  <div className="flex items-center gap-3 overflow-hidden text-left">
                    <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                    <div className="truncate text-xs font-bold text-slate-700">{contract.id}: {contract.name}</div>
                  </div>
                  <span className="text-[8px] px-2 py-0.5 rounded font-black uppercase bg-green-500 text-white">{contract.type}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Review Notes Summary — by category */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-4"><Pencil size={18} className="text-blue-500" /> Review Notes Summary</h3>
            <div className="space-y-3">
              {[
                { label: "Audit Findings", category: "audit_finding", bgOuter: "bg-red-50/50 border-red-100", bgDot: "bg-red-500", bgBadge: "bg-red-500" },
                { label: "Document Gaps", category: "document_gap", bgOuter: "bg-amber-50/50 border-amber-100", bgDot: "bg-amber-500", bgBadge: "bg-amber-500" },
                { label: "System Notes", category: "system", bgOuter: "bg-slate-50/50 border-slate-200", bgDot: "bg-slate-400", bgBadge: "bg-slate-400" },
              ].map(item => {
                const count = notes.filter(n => (n as Record<string, unknown>).category === item.category).length;
                return (
                  <div key={item.label} className={`flex justify-between items-center p-3 border rounded-xl ${item.bgOuter}`}>
                    <div className="flex items-center gap-3 text-left">
                      <div className={`w-2.5 h-2.5 rounded-full ${item.bgDot}`} />
                      <span className="text-xs font-bold text-slate-700">{item.label}</span>
                    </div>
                    <span className={`${item.bgBadge} text-white text-[10px] font-black px-2.5 py-0.5 rounded-full`}>{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="pt-2 border-t text-[10px] text-slate-400 flex justify-between">
              <span>Pending: {pendingCount}</span>
              <span>Reviewed: {reviewedOnlyCount}</span>
              <span>Resolved: {resolvedCount}</span>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-8 text-left">
          {/* Audit Right Clauses */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Scale size={18} className="text-blue-500" /> Audit Right Clauses</h3>
            </div>
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50/50">
                <tr className="text-[10px] text-slate-400 uppercase font-black border-b">
                  <th className="px-6 py-3">Contract</th>
                  <th className="px-6 py-3">Section</th>
                  <th className="px-6 py-3">Key Terms</th>
                </tr>
              </thead>
              <tbody className="divide-y text-xs text-left">
                {auditClauses.map(clause => {
                  const terms = parseKeyTerms(clause.key_terms_json);
                  return (
                    <tr key={clause.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-bold">{clause.contract_id}</td>
                      <td className="px-6 py-4 font-mono text-slate-500">{clause.section}</td>
                      <td className="px-6 py-4 text-slate-500">
                        {terms.notice_period_days && <span className="mr-3">{terms.notice_period_days}d notice</span>}
                        {terms.frequency && <span className="mr-3">{terms.frequency}</span>}
                        {terms.retention_years && <span>{terms.retention_years}yr retention</span>}
                      </td>
                    </tr>
                  );
                })}
                {auditClauses.length === 0 && (
                  <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400 italic">
                    {contracts.some(c => c.analysis_confidence !== null)
                      ? "No audit right clauses found in this project's contracts"
                      : "Run analysis to populate clauses"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
            {/* Data Retention */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b"><h3 className="text-sm font-bold text-slate-800">Data Retention</h3></div>
              <table className="w-full text-left text-xs">
                <tbody className="divide-y">
                  {retentionClauses.map(c => {
                    const terms = parseKeyTerms(c.key_terms_json);
                    return (
                      <tr key={c.id}>
                        <td className="px-4 py-3 font-bold text-slate-700">{c.contract_id}</td>
                        <td className="px-4 py-3 text-slate-500">{terms.retention_years ? `${terms.retention_years} Years` : c.section}</td>
                        <td className="px-4 py-3 text-right"><button className="text-slate-400 hover:text-blue-600"><Link size={14}/></button></td>
                      </tr>
                    );
                  })}
                  {retentionClauses.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 italic text-[11px]">{contracts.some(c => c.analysis_confidence !== null) ? "No matching clauses found" : "Pending analysis"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Interest Clause */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b"><h3 className="text-sm font-bold text-slate-800">Interest Clause</h3></div>
              <table className="w-full text-left text-xs">
                <tbody className="divide-y">
                  {interestClauses.map(c => {
                    const terms = parseKeyTerms(c.key_terms_json);
                    return (
                      <tr key={c.id}>
                        <td className="px-4 py-3 font-bold text-slate-700">{c.contract_id}</td>
                        <td className="px-4 py-3 text-slate-500">{terms.rate || terms.interest_rate || c.section}</td>
                        <td className="px-4 py-3 text-right"><button className="text-slate-400 hover:text-blue-600"><Link size={14}/></button></td>
                      </tr>
                    );
                  })}
                  {interestClauses.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 italic text-[11px]">{contracts.some(c => c.analysis_confidence !== null) ? "No matching clauses found" : "Pending analysis"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
