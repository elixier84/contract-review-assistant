"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FolderOpen, Plus, Trash2, FileText, Calendar, ArrowRight, FileSearch, Loader2,
} from "lucide-react";

interface Project {
  id: number;
  name: string;
  licensor: string;
  licensee: string;
  notification_date: string | null;
  audit_scope_start: string | null;
  audit_scope_end: string | null;
  created_at: string;
  contractCount?: number;
}

const formatDate = (d: string | null) => {
  if (!d) return "—";
  const date = new Date(d);
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${date.getDate().toString().padStart(2, "0")}-${months[date.getMonth()]}-${date.getFullYear()}`;
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "", licensor: "", licensee: "",
    notification_date: "", audit_scope_start: "", audit_scope_end: "",
  });

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    const projectList: Project[] = data.projects || [];

    // Get contract counts per project
    for (const p of projectList) {
      const cRes = await fetch(`/api/contracts?project_id=${p.id}`);
      const cData = await cRes.json();
      p.contractCount = cData.contracts?.length ?? 0;
    }
    setProjects(projectList);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleCreate = async () => {
    if (!form.name || !form.licensor || !form.licensee) return;
    setCreating(true);
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", licensor: "", licensee: "", notification_date: "", audit_scope_start: "", audit_scope_end: "" });
    setShowCreate(false);
    setCreating(false);
    fetchProjects();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    fetchProjects();
  };

  const handleEnter = (id: number) => {
    // Store active project in localStorage and navigate to dashboard
    localStorage.setItem("activeProjectId", String(id));
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg"><FileSearch size={24} /></div>
            <h1 className="text-xl font-black text-slate-800 tracking-tighter">Contract Review Assistant</h1>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg"
          >
            <Plus size={16} /> New Project
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <FolderOpen size={14} /> Audit Projects
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Create New Project</h3>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full text-lg font-bold bg-slate-50 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Project Name (e.g. Dolby - Samsung Electronics)"
            />
            <div className="flex gap-3">
              <input
                type="text"
                value={form.licensor}
                onChange={e => setForm(prev => ({ ...prev, licensor: e.target.value }))}
                className="flex-1 text-sm bg-slate-50 border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Licensor"
              />
              <input
                type="text"
                value={form.licensee}
                onChange={e => setForm(prev => ({ ...prev, licensee: e.target.value }))}
                className="flex-1 text-sm bg-slate-50 border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Licensee"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notification Date</label>
                <input type="date" value={form.notification_date} onChange={e => setForm(prev => ({ ...prev, notification_date: e.target.value }))}
                  className="w-full text-sm bg-slate-50 border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audit Period Start</label>
                <input type="date" value={form.audit_scope_start} onChange={e => setForm(prev => ({ ...prev, audit_scope_start: e.target.value }))}
                  className="w-full text-sm bg-slate-50 border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audit Period End</label>
                <input type="date" value={form.audit_scope_end} onChange={e => setForm(prev => ({ ...prev, audit_scope_end: e.target.value }))}
                  className="w-full text-sm bg-slate-50 border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={creating || !form.name || !form.licensor || !form.licensee}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create Project
              </button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border text-xs font-bold text-slate-500 rounded-lg hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        )}

        {/* Project list */}
        {loading ? (
          <div className="text-center py-20 text-slate-400 italic">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <FolderOpen size={48} className="mx-auto text-slate-300" />
            <p className="text-slate-400 text-sm font-bold">No projects yet</p>
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm">
              <Plus size={14} className="inline mr-1" /> Create your first project
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map(p => (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
                <div className="p-6 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-black text-slate-900 truncate">{p.name}</h3>
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-slate-500">
                      <span>Licensor: <span className="font-bold text-slate-700">{p.licensor}</span></span>
                      <span className="text-slate-300">|</span>
                      <span>Licensee: <span className="font-bold text-slate-700">{p.licensee}</span></span>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-slate-400">
                      {p.audit_scope_start && (
                        <span className="flex items-center gap-1">
                          <Calendar size={10} /> Audit Period: {formatDate(p.audit_scope_start)} — {formatDate(p.audit_scope_end)}
                        </span>
                      )}
                      {p.notification_date && (
                        <span className="flex items-center gap-1">
                          Notification: {formatDate(p.notification_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 ml-6">
                    <div className="text-center bg-slate-50 rounded-xl px-4 py-2 border">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Contracts</div>
                      <div className="text-lg font-black text-slate-700 flex items-center gap-1">
                        <FileText size={14} className="text-slate-400" /> {p.contractCount ?? 0}
                      </div>
                    </div>

                    <button
                      onClick={() => handleEnter(p.id)}
                      className="px-5 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg"
                    >
                      Enter <ArrowRight size={16} />
                    </button>

                    {confirmDelete === p.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleDelete(p.id)} className="px-2 py-1 bg-red-600 text-white text-[10px] font-bold rounded">Yes, delete</button>
                        <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 border text-[10px] font-bold rounded">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(p.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
