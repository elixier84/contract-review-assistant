"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Copy, X, Loader2,
} from "lucide-react";

interface FileEntry {
  file: File;
  id: string; // client-side tracking ID
}

interface IngestResult {
  id: string;
  fileName: string;
  status: "new" | "updated" | "duplicate_content" | "skipped" | "error";
  message: string;
}

interface IngestResponse {
  results: IngestResult[];
  summary: { total: number; new: number; updated: number; duplicates: number; errors: number };
}

const STATUS_CONFIG = {
  new:               { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 border-green-200", label: "New" },
  updated:           { icon: CheckCircle2, color: "text-blue-600",  bg: "bg-blue-50 border-blue-200",   label: "Updated" },
  duplicate_content: { icon: Copy,         color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Duplicate" },
  skipped:           { icon: Copy,         color: "text-slate-500", bg: "bg-slate-50 border-slate-200", label: "Skipped" },
  error:             { icon: AlertCircle,  color: "text-red-600",   bg: "bg-red-50 border-red-200",     label: "Error" },
};

const ALLOWED_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "application/pdf",
  "text/plain",
];
const ALLOWED_EXTS = [".docx", ".doc", ".pdf", ".txt"];

export default function ContractUpload({ onComplete }: { onComplete: () => void }) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [results, setResults] = useState<IngestResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const valid: FileEntry[] = [];
    for (const file of Array.from(newFiles)) {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ALLOWED_EXTS.includes(ext) && !ALLOWED_TYPES.includes(file.type)) continue;
      // Deduplicate by name in the current batch
      if (files.some(f => f.file.name === file.name)) continue;
      if (valid.some(f => f.file.name === file.name)) continue;
      valid.push({ file, id: `${file.name}-${Date.now()}` });
    }
    if (valid.length > 0) {
      setFiles(prev => [...prev, ...valid]);
      setResults([]); // Clear previous results
    }
  }, [files]);

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleProcess = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setResults([]);

    const formData = new FormData();
    for (const entry of files) {
      formData.append("files", entry.file);
    }

    try {
      const res = await fetch("/api/ingest", { method: "POST", body: formData });
      const data: IngestResponse = await res.json();
      setResults(data.results);

      // Clear file list after processing
      if (data.summary.errors === 0) {
        setFiles([]);
      }

      // Notify parent to refresh contract list
      onComplete();
    } catch (err) {
      setResults([{
        id: "",
        fileName: "upload",
        status: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
          isDragOver
            ? "border-blue-400 bg-blue-50"
            : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50"
        }`}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".docx,.doc,.pdf,.txt"
          className="hidden"
          onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
        />
        <Upload size={32} className={`mx-auto mb-3 ${isDragOver ? "text-blue-500" : "text-slate-300"}`} />
        <p className="text-sm font-bold text-slate-600">
          Drop contract files here or <span className="text-blue-600 underline">browse</span>
        </p>
        <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-widest">
          DOCX, DOC, PDF, TXT
        </p>
      </div>

      {/* Staged file list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {files.length} file{files.length !== 1 ? "s" : ""} ready
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => { setFiles([]); setResults([]); }}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 border rounded-lg hover:bg-slate-50"
              >
                Clear All
              </button>
              <button
                onClick={handleProcess}
                disabled={isProcessing}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? (
                  <><Loader2 size={14} className="animate-spin" /> Processing...</>
                ) : (
                  <><FileText size={14} /> Ingest & Check Duplicates</>
                )}
              </button>
            </div>
          </div>

          {files.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 bg-white border rounded-xl px-4 py-3">
              <FileText size={16} className="text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-700 truncate">{entry.file.name}</div>
                <div className="text-[10px] text-slate-400">{formatSize(entry.file.size)}</div>
              </div>
              <button
                onClick={() => removeFile(entry.id)}
                className="p-1 text-slate-300 hover:text-red-500 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Results</span>
          {results.map((r, i) => {
            const config = STATUS_CONFIG[r.status];
            const Icon = config.icon;
            return (
              <div key={i} className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${config.bg}`}>
                <Icon size={16} className={`${config.color} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-700 truncate">{r.fileName}</span>
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${config.color} ${config.bg}`}>
                      {config.label}
                    </span>
                    {r.id && <span className="text-[10px] font-mono text-slate-400">ID: {r.id}</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{r.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
