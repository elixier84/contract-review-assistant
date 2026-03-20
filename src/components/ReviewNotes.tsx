"use client";

import { useEffect, useState, useMemo } from "react";
import {
  MessageSquare, AlertTriangle, Check, X, Plus, ChevronDown,
} from "lucide-react";
import type { ReviewNote } from "@/types";

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

export default function ReviewNotes() {
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [filters, setFilters] = useState({ pending: true, reviewed: true, resolved: true });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [narrativeText, setNarrativeText] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNote, setNewNote] = useState({ contract_id: "", type: "manual", issue: "", severity: "medium" });

  const fetchNotes = () => {
    fetch("/api/notes").then(r => r.json()).then(d => setNotes(d.notes));
  };

  useEffect(() => { fetchNotes(); }, []);

  const filtered = useMemo(() => {
    return notes.filter(n => {
      const isResolved = n.is_reviewed && !!n.narrative;
      const isReviewedOnly = n.is_reviewed && !n.narrative;
      if (filters.pending && !n.is_reviewed) return true;
      if (filters.reviewed && isReviewedOnly) return true;
      if (filters.resolved && isResolved) return true;
      return false;
    });
  }, [notes, filters]);

  const markReviewed = async (id: number) => {
    await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_reviewed: true }),
    });
    fetchNotes();
  };

  const saveNarrative = async (id: number) => {
    await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_reviewed: true, narrative: narrativeText }),
    });
    setEditingId(null);
    setNarrativeText("");
    fetchNotes();
  };

  const addNote = async () => {
    if (!newNote.issue.trim()) return;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newNote),
    });
    setShowAddForm(false);
    setNewNote({ contract_id: "", type: "manual", issue: "", severity: "medium" });
    fetchNotes();
  };

  const deleteNote = async (id: number) => {
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    fetchNotes();
  };

  const severityColor = (s: string) => {
    switch (s) {
      case "critical": return "bg-red-600";
      case "high": return "bg-red-500";
      case "medium": return "bg-orange-500";
      case "low": return "bg-yellow-500";
      default: return "bg-slate-500";
    }
  };

  const statusInfo = (note: ReviewNote) => {
    const isRes = note.is_reviewed && note.narrative;
    if (isRes) return { label: "RESOLVED", color: "bg-green-500", border: "border-green-500 bg-green-50/10" };
    if (note.is_reviewed) return { label: "REVIEWED", color: "bg-orange-500", border: "border-orange-500 bg-orange-50/10" };
    return { label: "PENDING", color: "bg-red-500", border: "border-red-500 bg-red-50/10" };
  };

  return (
    <div className="space-y-6 animate-in fade-in text-left">
      {/* Toolbar */}
      <div className="bg-slate-50 border p-4 rounded-2xl flex flex-wrap items-center gap-4 shadow-inner">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filters:</span>
        <div className="flex gap-3">
          {(["pending", "reviewed", "resolved"] as const).map(f => (
            <label key={f} className="flex items-center gap-2 cursor-pointer group bg-white px-3 py-1 rounded-lg hover:bg-slate-100 transition-all shadow-sm border">
              <input
                type="checkbox"
                checked={filters[f]}
                onChange={() => setFilters({ ...filters, [f]: !filters[f] })}
                className={`w-4 h-4 rounded border-slate-300 ${f === "pending" ? "text-red-600" : f === "reviewed" ? "text-orange-600" : "text-green-600"}`}
              />
              <span className="text-xs font-black text-slate-600 uppercase">{f}</span>
            </label>
          ))}
        </div>
        <span className="text-xs text-slate-400">{filtered.length} of {notes.length} notes</span>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={14} /> Add Note
        </button>
      </div>

      {/* Add Note Form */}
      {showAddForm && (
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h4 className="text-sm font-black text-slate-800">New Review Note</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Contract ID</label>
              <input
                type="text"
                placeholder="e.g. 85001"
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none"
                value={newNote.contract_id}
                onChange={e => setNewNote({ ...newNote, contract_id: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Type</label>
              <div className="relative">
                <select
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none appearance-none bg-white"
                  value={newNote.type}
                  onChange={e => setNewNote({ ...newNote, type: e.target.value })}
                >
                  <option value="manual">Manual</option>
                  <option value="discrepancy">Discrepancy</option>
                  <option value="missing_link">Missing Link</option>
                  <option value="pricing_mismatch">Pricing Mismatch</option>
                  <option value="clause_ambiguity">Clause Ambiguity</option>
                  <option value="date_conflict">Date Conflict</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Severity</label>
              <div className="relative">
                <select
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none appearance-none bg-white"
                  value={newNote.severity}
                  onChange={e => setNewNote({ ...newNote, severity: e.target.value })}
                >
                  {SEVERITY_ORDER.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Issue Description</label>
            <textarea
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none resize-none"
              rows={3}
              placeholder="Describe the issue..."
              value={newNote.issue}
              onChange={e => setNewNote({ ...newNote, issue: e.target.value })}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-1.5 text-xs font-bold text-slate-500 border rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={addNote}
              disabled={!newNote.issue.trim()}
              className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40"
            >
              Create Note
            </button>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div className="grid grid-cols-1 gap-4">
        {filtered.map(note => {
          const status = statusInfo(note);
          const isEditing = editingId === note.id;

          return (
            <div key={note.id} className={`bg-white border-2 rounded-2xl p-6 shadow-sm transition-all duration-300 ${status.border}`}>
              <div className="flex items-start gap-4">
                <AlertTriangle size={20} className={note.is_reviewed ? "text-green-500" : "text-red-500"} />
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 mb-1 uppercase text-[10px] font-black tracking-widest text-slate-400 flex-wrap">
                    <span>{note.type}</span>
                    <span className={`${severityColor(note.severity)} text-white px-2 py-0.5 rounded`}>{note.severity}</span>
                    <span className={`px-2 py-0.5 rounded text-white shadow-sm ${status.color}`}>
                      {status.label}
                    </span>
                    {note.contract_id && <span className="text-blue-500">Contract {note.contract_id}</span>}
                  </div>
                  <h4 className="text-slate-800 font-black text-base mt-1">{note.issue}</h4>

                  {/* Existing narrative */}
                  {note.narrative && !isEditing && (
                    <div className="mt-3 space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <MessageSquare size={12} /> Resolution
                      </label>
                      <p className="p-3 bg-white border rounded-xl italic font-medium text-slate-600 text-sm">{note.narrative}</p>
                    </div>
                  )}

                  {/* Edit narrative form */}
                  {isEditing && (
                    <div className="mt-3 space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Auditor Narrative / Resolution
                      </label>
                      <textarea
                        className="w-full px-3 py-2 border rounded-lg text-sm outline-none resize-none"
                        rows={3}
                        placeholder="Describe the resolution..."
                        value={narrativeText}
                        onChange={e => setNarrativeText(e.target.value)}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveNarrative(note.id)}
                          disabled={!narrativeText.trim()}
                          className="px-3 py-1 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-40 flex items-center gap-1"
                        >
                          <Check size={12} /> Save & Resolve
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setNarrativeText(""); }}
                          className="px-3 py-1 text-xs font-bold text-slate-500 border rounded-lg hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {!isEditing && (
                    <div className="mt-3 flex gap-2">
                      {!note.is_reviewed && (
                        <button
                          onClick={() => markReviewed(note.id)}
                          className="px-3 py-1 text-xs font-bold text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 flex items-center gap-1"
                        >
                          <Check size={12} /> Mark Reviewed
                        </button>
                      )}
                      {!note.narrative && (
                        <button
                          onClick={() => { setEditingId(note.id); setNarrativeText(note.narrative || ""); }}
                          className="px-3 py-1 text-xs font-bold text-green-600 border border-green-200 rounded-lg hover:bg-green-50 flex items-center gap-1"
                        >
                          <MessageSquare size={12} /> {note.is_reviewed ? "Resolve" : "Review & Resolve"}
                        </button>
                      )}
                      {note.type === "manual" && (
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="px-3 py-1 text-xs font-bold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-1 ml-auto"
                        >
                          <X size={12} /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {notes.length === 0 && (
          <div className="bg-white rounded-2xl p-12 border text-center text-slate-400 italic">
            No review notes yet. Run analysis or add manually.
          </div>
        )}
      </div>
    </div>
  );
}
