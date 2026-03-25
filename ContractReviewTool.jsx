import React, { useState, useMemo } from 'react';
import { 
  FileText, Search, Database, Info, ChevronRight, CheckCircle2, 
  AlertCircle, Tag, DollarSign, LayoutDashboard, ShieldAlert, 
  ExternalLink, Calendar, Link, AlertTriangle, FileSearch, 
  Clock, Edit3, Save, FileWarning, List, GitGraph, ChevronDown, Copy,
  Maximize2, Minimize2, ZoomIn, ZoomOut, Book,
  X, Bell, Briefcase, Scale, History, Box, Layers, Pencil, MessageSquare, Plus,
  Target, Filter, Banknote, Activity, Files, MousePointer, FileUp, Settings
} from 'lucide-react';
const NotebookPen = Pencil;
const BadgeDollarSign = Banknote;
const FileStack = Files;
const MousePointer2 = MousePointer;
const Settings2 = Settings;

// --- SHARED DATA REGISTRY (Source of Truth) ---
const SHAREPOINT_REGISTRY = [
  { id: 'M1', name: 'Master Agreement: TechCore Global', ref: 'MA-2020-TC', type: 'master', status: 'Active', effective: '2020-01-01', expiry: '2025-12-31', extensions: [{ to: '2026-12-31', by: 'Addendum 5' }] },
  { id: 'A1', name: 'Addendum 1: IoT Sensors', ref: 'ADD-2021-01', type: 'addendum', parentId: 'M1', status: 'Active', effective: '2021-06-01', expiry: '2023-06-01', extensions: [{ to: '2025-12-31', by: 'Addendum 4' }, { to: '2026-12-31', by: 'Addendum 5' }] },
  { id: 'A2', name: 'Addendum 2: Cloud Computing', ref: 'ADD-2022-04', type: 'addendum', parentId: 'M1', status: 'Active', effective: '2022-04-15', expiry: '2024-04-15', extensions: [{ to: '2025-12-31', by: 'Addendum 4' }, { to: '2026-12-31', by: 'Addendum 5' }] },
  { id: 'A3', name: 'Addendum 3: NextGen AI Engine', ref: 'ADD-2023-09', type: 'addendum', parentId: 'M1', status: 'Active', effective: '2023-09-01', expiry: '2025-12-31' },
  { id: 'A4', name: 'Addendum 4: Expiry Extension v1', ref: 'ADD-2023-EXT', type: 'addendum', parentId: 'M1', status: 'Active', effective: '2023-06-01', expiry: '2025-01-01', isExtensionDoc: true },
  { id: 'A5', name: 'Addendum 5: Expiry Extension v2', ref: 'ADD-2025-EXT', type: 'addendum', parentId: 'M1', status: 'Active', effective: '2025-01-01', expiry: '2026-12-31', isExtensionDoc: true },
  { id: 'M2', name: 'Standard Technology License', ref: 'SL-2021-GR', type: 'master', status: 'Active', effective: '2021-09-01', expiry: '2024-09-01' },
  { id: 'M3', name: 'Legacy Distribution Agreement', ref: 'LDA-2018-OLD', type: 'master', status: 'Terminated', effective: '2018-01-01', expiry: '2020-01-01' },
  { id: 'A_OLD', name: 'Old Marketing Addendum', ref: 'ADD-MKT-OLD', type: 'addendum', parentId: 'M3', status: 'Terminated', effective: '2019-01-01', expiry: '2020-01-01' },
  { id: 'U1', name: 'Unlinked Marketing Agreement', ref: 'ADD-MKT-2019', type: 'addendum', status: 'Unlinked', effective: '2019-05-01', expiry: '2021-05-01' },
  { id: 'D1', name: 'Duplicate_TechCore_Scan.pdf', ref: 'MA-2020-TC', type: 'master', isDuplicate: true },
];

const INITIAL_TECH_LIST = [
  { id: 'T1', name: 'ARM-v8 Architecture', status: 'Active', description: 'Primary compute architecture for mobile chipset manufacturing.', governingChain: ['MA-2020-TC', 'ADD-2021-01', 'ADD-2025-EXT'], totalAgreements: 3 },
  { id: 'T2', name: 'IoT Sensor Core (Gen 1)', status: 'Active', description: 'Low-power sensor technology for smart home devices.', governingChain: ['MA-2020-TC', 'ADD-2021-01', 'ADD-2023-EXT'], totalAgreements: 3 },
  { id: 'T3', name: 'GPU-X Graphics Engine', status: 'Terminated', description: 'Legacy graphics core superseded by GPU-Next architecture.', governingChain: ['MA-2020-TC'], totalAgreements: 1 },
  { id: 'T4', name: 'Cloud Computing API', status: 'Active', description: 'Protocol for real-time data sync with TechCore Cloud nodes.', governingChain: ['MA-2020-TC', 'ADD-2022-04'], totalAgreements: 2 },
  { id: 'T5', name: 'NextGen AI Engine', status: 'Active', description: 'Neural processing unit designs for edge computing applications.', governingChain: ['MA-2020-TC', 'ADD-2023-09'], totalAgreements: 2 },
];

// --- HELPERS ---
const formatIntlDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${d.getDate().toString().padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
};

// --- SUB-COMPONENTS ---

function ContractListRow({ contract, isChild, isExpandable, isExpanded, onToggle, isSelected, onSelect }) {
  const latestExt = contract.extensions?.length > 0 ? contract.extensions[contract.extensions.length - 1] : null;
  const displayExpiry = latestExt ? latestExt.to : contract.expiry;
  const isTerminated = contract.status === 'Terminated';

  return (
    <tr className={`group transition-all ${isChild ? 'bg-slate-50/40' : ''} ${isSelected ? 'bg-blue-50/50 ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50'}`}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3 text-left">
          <input 
            type="checkbox" 
            checked={isSelected}
            onChange={onSelect}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
          />
          {isChild && <div className="w-6 border-b border-slate-200 ml-1 mb-2" />}
          {isExpandable && (
            <button onClick={onToggle} className="p-1 hover:bg-slate-200 rounded transition-colors shadow-sm bg-white border border-slate-100">
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
            </button>
          )}
          <div>
            <div className={`font-bold text-sm ${isTerminated ? 'text-red-700' : 'text-slate-900'}`}>{contract.name}</div>
            <div className="text-[10px] text-slate-400 font-mono tracking-tight mt-0.5 flex items-center gap-1.5"><Link size={10} /> {contract.ref}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-sm ${isTerminated ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-500'}`}>
          {contract.type} {isTerminated && '— TERMINATED'}
        </span>
      </td>
      <td className={`px-6 py-4 text-xs font-mono ${isTerminated ? 'text-red-600' : 'text-slate-500'}`}>{formatIntlDate(contract.effective)}</td>
      <td className={`px-6 py-4 text-xs font-mono relative ${isTerminated ? 'text-red-600' : 'text-slate-500'}`}>
        <div className="flex items-center gap-2">
            {formatIntlDate(displayExpiry) || 'Open Ended'}
            {latestExt && <span className="text-[10px] italic text-blue-600 cursor-help font-sans underline decoration-dotted">Extended</span>}
        </div>
      </td>
      <td className="px-6 py-4 text-right">
        <button className={`p-2 rounded-lg transition-all ${isTerminated ? 'text-red-300 hover:text-red-600' : 'text-slate-400 hover:text-blue-600'}`}>
          <ExternalLink size={16} />
        </button>
      </td>
    </tr>
  );
}

function TimelineTreeView({ data, scale }) {
  const [hoveredItem, setHoveredItem] = useState(null);
  const [hoveredExtMarker, setHoveredExtMarker] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [collapsed, setCollapsed] = useState({});

  const startYear = 2020; const endYear = 2027; const totalYears = endYear - startYear;
  
  const getX = (dateStr) => {
    const date = new Date(dateStr); const start = new Date(`${startYear}-01-01`);
    const diffTime = date - start; const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    return (diffYears / totalYears) * 100;
  };

  const handleMouseMove = (e) => setMousePos({ x: e.clientX, y: e.clientY });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col h-[650px]" onMouseMove={handleMouseMove}>
      {/* Dynamic Tooltip */}
      {(hoveredItem || hoveredExtMarker) && (
        <div className="fixed z-[100] bg-slate-900 text-white p-3 rounded-xl shadow-2xl pointer-events-none text-xs w-64 border border-slate-700" style={{ left: mousePos.x + 20, top: mousePos.y - 20 }}>
          {hoveredExtMarker ? (
            <div>
              <div className="font-bold flex items-center gap-2 mb-1 text-yellow-400">
                <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full shadow-[0_0_8px_rgba(250,204,21,0.5)]" /> Extension Event
              </div>
              <p className="text-slate-400 leading-relaxed text-[10px]">
                Extended by <span className="text-blue-400 font-bold">{hoveredExtMarker.by}</span> to <span className="text-white font-bold">{formatIntlDate(hoveredExtMarker.to)}</span>
              </p>
            </div>
          ) : (
            <div>
              <div className="font-bold border-b border-slate-700 pb-1 mb-1">{hoveredItem.name}</div>
              <div className="text-slate-400 font-mono text-[10px] mb-2">{hoveredItem.ref}</div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div><div className="text-slate-500 uppercase font-bold text-[8px]">Effective</div>{formatIntlDate(hoveredItem.effective)}</div>
                <div><div className="text-slate-500 uppercase font-bold text-[8px]">Expiry</div>{formatIntlDate(hoveredItem.extensions?.length > 0 ? hoveredItem.extensions[hoveredItem.extensions.length - 1].to : hoveredItem.expiry) || 'Open Ended'}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto p-12 bg-white flex-grow">
        <div className="relative" style={{ width: `${100 * scale}%`, minWidth: '100%' }}>
          <div className="absolute inset-0 flex justify-between pointer-events-none border-b border-slate-100 h-full">
            {Array.from({ length: totalYears + 1 }).map((_, i) => (
              <div key={i} className="border-l border-slate-50 h-full relative text-left">
                <div className="absolute -top-8 -left-3 text-[10px] font-bold text-slate-300 uppercase tracking-widest">{startYear + i}</div>
              </div>
            ))}
          </div>
          <div className="relative pt-10 space-y-40">
            {data.filter(c => c.type === 'master').map(master => {
              const children = data.filter(c => c.parentId === master.id).sort((a,b) => a.name.localeCompare(b.name));
              const mStart = getX(master.effective); const mEndOrig = getX(master.expiry);
              const lastExt = master.extensions?.[master.extensions.length - 1]; const mEndFinal = lastExt ? getX(lastExt.to) : mEndOrig;
              return (
                <div key={master.id} className="relative text-left">
                  <div className="relative mb-12 text-left">
                    <div className="absolute -top-7 left-0 whitespace-nowrap text-[10px] font-bold text-slate-800 z-10">{master.name}</div>
                    <div className="h-3.5 bg-green-600 rounded-full relative cursor-pointer hover:brightness-110 shadow-sm transition-all" style={{ left: `${mStart}%`, width: `${mEndFinal - mStart}%` }} onMouseEnter={() => setHoveredItem(master)} onMouseLeave={() => setHoveredItem(null)}>
                      <button onClick={(e) => { e.stopPropagation(); setCollapsed(prev => ({...prev, [master.id]: !prev[master.id]})); }} className="absolute -left-10 w-7 h-7 bg-white border border-slate-200 rounded-full shadow flex items-center justify-center text-slate-400 hover:text-blue-600 transition-all z-20">
                        {collapsed[master.id] ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}
                      </button>
                      {master.extensions?.map((ext, idx) => {
                        const basePos = idx === 0 ? getX(master.expiry) : getX(master.extensions[idx-1].to);
                        const xPosInBar = ((basePos - mStart) / (mEndFinal - mStart)) * 100;
                        return (<div key={idx} className="absolute w-4 h-4 bg-yellow-400 border-2 border-white rounded-full shadow-lg z-30 transform -translate-x-1/2 -translate-y-1/4" style={{ left: `${xPosInBar}%`, top: '50%' }} onMouseEnter={() => setHoveredExtMarker(ext)} onMouseLeave={() => setHoveredExtMarker(null)} />);
                      })}
                    </div>
                  </div>
                  {!collapsed[master.id] && (
                    <div className="space-y-16 mt-16 text-left">
                      {children.map((child, ci) => {
                        const sP = getX(child.effective); const ePO = getX(child.expiry); const lCE = child.extensions?.[child.extensions.length - 1]; const ePF = lCE ? getX(lCE.to) : ePO;
                        return (
                          <div key={child.id} className="relative">
                            <div className="absolute w-px border-l-2 border-dotted border-slate-200 pointer-events-none" style={{ left: `${sP}%`, top: `-${(ci + 1) * 48 + 20}px`, height: `${(ci + 1) * 48 + 20}px` }} />
                            <div className={`h-2.5 rounded-full relative cursor-pointer shadow-sm hover:ring-4 transition-all ${child.isExtensionDoc ? 'bg-blue-500' : 'bg-green-500'}`} style={{ left: `${sP}%`, width: `${ePF - sP}%` }} onMouseEnter={() => setHoveredItem(child)} onMouseLeave={() => setHoveredItem(null)}>
                              <div className="absolute -top-6 left-2 text-[10px] font-bold text-slate-500 whitespace-nowrap">{child.name}</div>
                              {child.extensions?.map((ext, idx) => {
                                const basePos = idx === 0 ? getX(child.expiry) : getX(child.extensions[idx-1].to);
                                const xInChild = ((basePos - sP) / (ePF - sP)) * 100;
                                return (<div key={idx} className="absolute w-3.5 h-3.5 bg-yellow-400 border-2 border-white rounded-full shadow-md z-30 transform -translate-x-1/2 -translate-y-1/4" style={{ left: `${xInChild}%`, top: '50%' }} onMouseEnter={() => setHoveredExtMarker(ext)} onMouseLeave={() => setHoveredExtMarker(null)} />);
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="bg-slate-50 border-t border-slate-200 p-4">
        <div className="relative h-10" style={{ width: `${100 * scale}%`, minWidth: '100%' }}>
          {Array.from({ length: totalYears + 1 }).map((_, i) => (
            <div key={i} className="absolute flex flex-col items-center" style={{ left: `${(i / totalYears) * 100}%` }}>
              <div className="h-3 w-px bg-slate-400" />
              <div className="text-[10px] font-black text-slate-500 mt-1">{startYear + i}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- TAB MODULES ---

const AuditOverviewView = ({ notes }) => {
  const pendingCount = notes.filter(n => !n.isReviewed).length;
  const reviewedOnlyCount = notes.filter(n => n.isReviewed && !n.narrative).length;
  const resolvedCount = notes.filter(n => n.isReviewed && n.narrative).length;

  const auditData = {
    projectName: "FY20-23 Global Manufacturing Compliance Audit",
    licensor: "TechCore Global IP", licensee: "Global Manufacturing Corp",
    notificationDate: "15-OCT-2023", startDate: "01-JAN-2020", endDate: "31-DEC-2023",
    contractsInScope: [
      { id: 'M1', name: 'Master Agreement: TechCore Global', ref: 'MA-2020-TC', status: 'Found' },
      { id: 'M2', name: 'Standard Technology License', ref: 'SL-2021-GR', status: 'Found' },
      { id: 'M3', name: 'Joint Venture IP Grant', ref: 'JV-2019-X', status: 'Missing' },
    ],
    auditClauses: [
      { id: 1, source: 'MA-2020-TC', snippet: '“Licensor or its designated auditor shall have the right, upon 30 days written notice...”', section: 'Section 8.4' },
      { id: 2, source: 'SL-2021-GR', snippet: '“Audit rights may be exercised once per calendar year to verify royalty reports...”', section: 'Article 12' },
    ],
    retention: [{ source: 'MA-2020-TC', years: 5 }, { source: 'SL-2021-GR', years: 7 }],
    interest: [{ source: 'MA-2020-TC', rate: '1.5% Monthly' }]
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative text-left">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 text-left">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest"><Briefcase size={12} /> Project Header</div>
          <h2 className="text-2xl font-black text-slate-900">{auditData.projectName}</h2>
          <div className="flex gap-4 text-sm text-slate-500 italic font-medium"><span>Licensor: {auditData.licensor}</span><span className="text-slate-300">|</span><span>Customer: {auditData.licensee}</span></div>
        </div>
        <div className="flex bg-blue-50 border border-blue-100 rounded-2xl p-4 gap-6 shrink-0">
          <div className="text-center">
            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Notification</div>
            <button className="text-blue-700 font-bold flex items-center gap-1 hover:underline">{auditData.notificationDate} <ExternalLink size={12} /></button>
          </div>
          <div className="w-px bg-blue-200 h-8 self-center" />
          <div className="text-center">
            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter">Audit Scope</div>
            <div className="text-blue-900 font-mono text-xs font-bold">{auditData.startDate} — {auditData.endDate}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-4"><Bell size={18} className="text-amber-500" /> Audit Notification</h3>
            <div className="space-y-3">
              {auditData.contractsInScope.map(contract => (
                <div key={contract.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${contract.status === 'Missing' ? 'bg-slate-50 grayscale opacity-60' : 'bg-green-50 border-green-100'}`}>
                  <div className="flex items-center gap-3 overflow-hidden text-left">
                    {contract.status === 'Missing' ? <FileWarning size={14} className="text-slate-400" /> : <CheckCircle2 size={14} className="text-green-500 shrink-0" />}
                    <div className="truncate text-xs font-bold text-slate-700">{contract.name}</div>
                  </div>
                  <span className={`text-[8px] px-2 py-0.5 rounded font-black uppercase ${contract.status === 'Missing' ? 'bg-slate-200 text-slate-500' : 'bg-green-500 text-white'}`}>{contract.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-4"><NotebookPen size={18} className="text-blue-500" /> Review Notes Summary</h3>
            <div className="space-y-3">
              {[
                { label: 'Pending Issues', count: pendingCount, bgOuter: 'bg-red-50/50 border-red-100', bgDot: 'bg-red-500', bgBadge: 'bg-red-500' },
                { label: 'Reviewed Only', count: reviewedOnlyCount, bgOuter: 'bg-orange-50/50 border-orange-100', bgDot: 'bg-orange-500', bgBadge: 'bg-orange-500' },
                { label: 'Resolved Items', count: resolvedCount, bgOuter: 'bg-green-50/50 border-green-100', bgDot: 'bg-green-500', bgBadge: 'bg-green-500' }
              ].map(item => (
                <div key={item.label} className={`flex justify-between items-center p-3 border rounded-xl ${item.bgOuter}`}>
                  <div className="flex items-center gap-3 text-left">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.bgDot}`} />
                    <span className="text-xs font-bold text-slate-700">{item.label}</span>
                  </div>
                  <span className={`${item.bgBadge} text-white text-[10px] font-black px-2.5 py-0.5 rounded-full`}>{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-8 text-left">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Scale size={18} className="text-blue-500" /> Audit Right Clauses</h3>
            </div>
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50/50"><tr className="text-[10px] text-slate-400 uppercase font-black border-b"><th className="px-6 py-3">Contract Source</th><th className="px-6 py-3">Snippet</th><th className="px-6 py-3 text-right">View</th></tr></thead>
              <tbody className="divide-y text-xs text-left">
                {auditData.auditClauses.map(clause => (
                  <tr key={clause.id} className="hover:bg-slate-50 group">
                    <td className="px-6 py-4 font-bold">{clause.source}</td>
                    <td className="px-6 py-4 italic text-slate-500 truncate max-w-sm">{clause.snippet}</td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><ExternalLink size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="p-4 bg-slate-50 border-b"><h3 className="text-sm font-bold text-slate-800">Data Retention</h3></div>
               <table className="w-full text-left text-xs">
                 <tbody className="divide-y text-left text-left">
                   {auditData.retention.map((c, i) => (
                     <tr key={i}><td className="px-4 py-3 font-bold text-slate-700">{c.source}</td><td className="px-4 py-3 text-slate-500">{c.years} Years</td><td className="px-4 py-3 text-right"><button className="text-slate-400 hover:text-blue-600"><Link size={14}/></button></td></tr>
                   ))}
                 </tbody>
               </table>
             </div>
             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="p-4 bg-slate-50 border-b"><h3 className="text-sm font-bold text-slate-800">Interest Clause</h3></div>
               <table className="w-full text-left text-xs">
                 <tbody className="divide-y text-left text-left">
                   {auditData.interest.map((c, i) => (
                     <tr key={i}><td className="px-4 py-3 font-bold text-slate-700">{c.source}</td><td className="px-4 py-3 text-slate-500">{c.rate}</td><td className="px-4 py-3 text-right"><button className="text-slate-400 hover:text-blue-600"><Link size={14}/></button></td></tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ContractListingTab = () => {
  const [viewMode, setViewMode] = useState('list'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [timeScale, setTimeScale] = useState(1.2); 
  const [expandedMasters, setExpandedMasters] = useState(['M1']);
  const [selectedContractId, setSelectedContractId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalForm, setModalForm] = useState({ sharepointId: '', type: 'master', effectiveDate: '', expiryDate: '', extendingAgreementId: '' });

  const filteredData = useMemo(() => {
    return SHAREPOINT_REGISTRY.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.ref.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery]);

  const handleAddOrEdit = () => {
    if (selectedContractId) {
      const contract = SHAREPOINT_REGISTRY.find(c => c.id === selectedContractId);
      if (contract) setModalForm({ sharepointId: contract.id, type: contract.type || 'master', effectiveDate: contract.effective || '', expiryDate: contract.expiry || '', extendingAgreementId: contract.extensions?.[0]?.by || '' });
    } else setModalForm({ sharepointId: '', type: 'master', effectiveDate: '', expiryDate: '', extendingAgreementId: '' });
    setIsModalOpen(true);
  };

  const handleCheckboxChange = (id) => { setSelectedContractId(prev => (prev === id ? null : id)); };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative text-left">
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left">
             <div className="bg-slate-50 px-8 py-6 border-b flex justify-between items-center text-left">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-blue-600 text-white rounded-lg">{selectedContractId ? <Settings2 size={20}/> : <Plus size={20}/>}</div>
                 <h3 className="text-xl font-bold text-slate-800">{selectedContractId ? 'Edit Contract Metadata' : 'Add Contract to Scope'}</h3>
               </div>
               <button onClick={() => setIsModalOpen(false)}><X size={24} className="text-slate-400" /></button>
             </div>
             <div className="p-8 space-y-6 text-left">
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SharePoint Registry Document</label>
                  <select className="w-full bg-slate-50 border rounded-xl px-4 py-3 font-bold text-slate-700 shadow-inner outline-none focus:ring-2 focus:ring-blue-500" value={modalForm.sharepointId} onChange={(e) => setModalForm({...modalForm, sharepointId: e.target.value})}>
                    <option value="">Search uploads...</option>
                    {SHAREPOINT_REGISTRY.map(c => <option key={c.id} value={c.id}>{c.name} ({c.ref}) — {c.status}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</label>
                    <select className="w-full bg-slate-50 border rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" value={modalForm.type} onChange={(e) => setModalForm({...modalForm, type: e.target.value})}>
                      <option value="master">Master Agreement</option><option value="addendum">Addendum</option>
                    </select>
                  </div>
                  <div className="space-y-2 text-left text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Effective Date</label>
                    <input type="date" className="w-full bg-slate-50 border rounded-xl px-4 py-3 font-bold text-slate-700 shadow-inner" value={modalForm.effectiveDate} onChange={(e) => setModalForm({...modalForm, effectiveDate: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 text-left text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expiry Date</label>
                    <input type="date" className="w-full bg-slate-50 border rounded-xl px-4 py-3 font-bold text-slate-700 shadow-inner" value={modalForm.expiryDate} onChange={(e) => setModalForm({...modalForm, expiryDate: e.target.value})} />
                  </div>
                  <div className="space-y-2 text-left text-left text-left text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extension Source</label>
                    <select className="w-full bg-slate-50 border rounded-xl px-4 py-3 font-bold text-slate-700 shadow-inner outline-none focus:ring-2 focus:ring-blue-500" value={modalForm.extendingAgreementId} onChange={(e) => setModalForm({...modalForm, extendingAgreementId: e.target.value})}>
                      <option value="">None</option>
                      {SHAREPOINT_REGISTRY.map(c => <option key={c.id} value={c.id}>{c.ref} ({c.name})</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 border rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm text-left text-center">Cancel</button>
                  <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all">{selectedContractId ? 'Update Record' : 'Add to Scoped Analysis'}</button>
                </div>
             </div>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4 text-left">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 w-full text-left">
          <div className="flex items-center gap-4 shrink-0 text-left text-left">
            <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner">
              <button onClick={() => setViewMode('list')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-slate-500'}`}><List size={14} /> List View</button>
              <button onClick={() => setViewMode('tree')} className={`px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${viewMode === 'tree' ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-slate-500'}`}><GitGraph size={14} /> Timeline View</button>
            </div>
            <button onClick={handleAddOrEdit} className={`px-6 py-2 text-sm font-bold rounded-lg flex items-center gap-2 shadow-lg transition-all active:scale-95 ${selectedContractId ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
              {selectedContractId ? <Edit3 size={16}/> : <Plus size={16}/>} Add/Edit Contract
            </button>
          </div>
          <div className="flex flex-1 max-w-xl relative w-full text-left">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search scoped inventory..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm outline-none shadow-inner" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          {viewMode === 'tree' && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Zoom:</span>
              <input type="range" min="0.5" max="3" step="0.1" value={timeScale} onChange={(e) => setTimeScale(parseFloat(e.target.value))} className="w-24 accent-blue-600" />
            </div>
          )}
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-left">
          <table className="w-full text-left text-sm text-slate-700 text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-left"><tr className="text-[10px] text-slate-400 uppercase font-black"><th className="px-6 py-4 font-black tracking-wider">Contract Name & Ref</th><th className="px-6 py-4 font-black tracking-wider">Type</th><th className="px-6 py-4 font-black tracking-wider">Effective</th><th className="px-6 py-4 font-black tracking-wider">Expiry</th><th className="px-6 py-4 text-right font-black tracking-wider">Action</th></tr></thead>
            <tbody className="divide-y text-sm font-medium text-left">
              {filteredData.filter(c => !c.parentId && !c.isDuplicate).map(master => (
                <React.Fragment key={master.id}>
                  <ContractListRow contract={master} isExpandable isExpanded={expandedMasters.includes(master.id)} onToggle={() => setExpandedMasters(prev => prev.includes(master.id) ? prev.filter(m => m !== master.id) : [...prev, master.id])} isSelected={selectedContractId === master.id} onSelect={() => setSelectedContractId(prev => prev === master.id ? null : master.id)} />
                  {expandedMasters.includes(master.id) && filteredData.filter(c => c.parentId === master.id).map(child => (
                    <ContractListRow key={child.id} contract={child} isChild isSelected={selectedContractId === child.id} onSelect={() => setSelectedContractId(prev => prev === child.id ? null : child.id)} />
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <TimelineTreeView data={filteredData.filter(c => !c.isDuplicate && c.status !== 'Terminated' && c.status !== 'Unlinked')} scale={timeScale} />
      )}
    </div>
  );
};

const TechnologyView = ({ techs, setTechs }) => {
  const [expandedTech, setExpandedTech] = useState(['T1']);
  const [selectedTechId, setSelectedTechId] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTech, setNewTech] = useState({ name: '', contractRef: '' });
  const [activeDeepLink, setActiveDeepLink] = useState(null);

  const handleAddOrEditTech = () => {
    if (selectedTechId) {
      const tech = techs.find(t => t.id === selectedTechId);
      if (tech) setNewTech({ name: tech.name, contractRef: tech.governingChain?.[tech.governingChain.length - 1] || '' });
    } else setNewTech({ name: '', contractRef: '' });
    setIsAddModalOpen(true);
  };

  const handleSaveTech = () => {
    if (!newTech.name || !newTech.contractRef) return;
    if (selectedTechId) {
      setTechs(techs.map(t => t.id === selectedTechId ? { ...t, name: newTech.name, governingChain: Array.from(new Set([...t.governingChain, newTech.contractRef])) } : t));
    } else {
      setTechs([{ id: 'T' + (techs.length + 1), name: newTech.name, status: 'Active', description: 'Manually added technology.', governingChain: [newTech.contractRef], totalAgreements: 1 }, ...techs]);
    }
    setIsAddModalOpen(false); setSelectedTechId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in relative text-left">
      {activeDeepLink && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl z-[100] flex items-center gap-4 border border-slate-700 animate-in slide-in-from-bottom-4">
          <FileSearch className="text-blue-400" />
          <div className="text-sm font-medium tracking-tight">Jumping to <span className="font-bold">{activeDeepLink.source}</span> {activeDeepLink.type === 'pricing' ? 'Pricing Table' : 'Agreement'}...</div>
          <button onClick={() => setActiveDeepLink(null)} className="ml-4 p-1 hover:bg-slate-800 rounded-full"><X size={16} /></button>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 text-left">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left">
             <div className="bg-slate-50 px-8 py-6 border-b flex justify-between items-center text-left">
               <div className="flex items-center gap-3 text-left">
                 <div className="p-2 bg-blue-600 text-white rounded-lg">{selectedTechId ? <Settings2 size={20}/> : <Plus size={20}/>}</div>
                 <h3 className="text-xl font-bold text-slate-800 text-left">{selectedTechId ? 'Edit Technology' : 'Add Technology'}</h3>
               </div>
               <button onClick={() => setIsAddModalOpen(false)}><X size={24} className="text-slate-400 hover:text-slate-600 transition-colors" /></button>
             </div>
             <div className="p-8 space-y-6 text-left">
                <div className="space-y-2 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Technology Name</label>
                  <input type="text" className="w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 font-bold" value={newTech.name} onChange={(e) => setNewTech({...newTech, name: e.target.value})} />
                </div>
                <div className="space-y-2 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Governing Agreement</label>
                  <select className="w-full bg-slate-50 border rounded-xl px-4 py-3 font-bold" value={newTech.contractRef} onChange={(e) => setNewTech({...newTech, contractRef: e.target.value})}>
                    <option value="">Select registry doc...</option>
                    {SHAREPOINT_REGISTRY.map(c => <option key={c.id} value={c.ref}>{c.name} ({c.ref})</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-2 text-left">
                  <button onClick={() => setIsAddModalOpen(false)} className="flex-1 py-3 border rounded-xl font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-colors text-center">Cancel</button>
                  <button onClick={handleSaveTech} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg transition-all text-center">{selectedTechId ? 'Update Tech' : 'Add Tech'}</button>
                </div>
             </div>
          </div>
        </div>
      )}
      
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 text-left">
        <button onClick={handleAddOrEditTech} className={`px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg transition-all active:scale-95 ${selectedTechId ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
          {selectedTechId ? <Edit3 size={18} /> : <Plus size={18} />} Add/Edit Technology
        </button>
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 tracking-tight"><Layers className="text-blue-500" /> Technology Inventory</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 text-left">
        {techs.map(tech => (
          <div key={tech.id} className={`bg-white rounded-3xl border transition-all text-left ${selectedTechId === tech.id ? 'border-blue-500 ring-2 ring-blue-50' : 'border-slate-200 shadow-sm'}`}>
            <div className="p-6 flex justify-between items-center text-left">
              <div className="flex items-center gap-6 flex-1 text-left">
                <input type="checkbox" checked={selectedTechId === tech.id} onChange={() => setSelectedTechId(prev => (prev === tech.id ? null : tech.id))} className="w-5 h-5 rounded border-slate-300 text-blue-600 cursor-pointer shadow-sm" />
                <div onClick={() => setExpandedTech(prev => prev.includes(tech.id) ? prev.filter(t => t !== tech.id) : [...prev, tech.id])} className="flex items-center gap-4 flex-1 cursor-pointer text-left">
                  <div className={`p-3 rounded-2xl ${tech.status === 'Terminated' ? 'bg-red-50 text-red-400' : 'bg-blue-50 text-blue-500 shadow-inner'}`}><Box size={24} /></div>
                  <div className="text-left">
                    <h3 className={`text-lg font-black ${tech.status === 'Terminated' ? 'text-red-600' : 'text-slate-900'}`}>{tech.name}</h3>
                    <p className="text-xs text-slate-400 font-medium">{tech.description}</p>
                  </div>
                </div>
              </div>
              <ChevronDown className={`text-slate-300 transition-transform ${expandedTech.includes(tech.id) ? 'rotate-180 text-blue-500' : ''}`} size={20} />
            </div>
            {expandedTech.includes(tech.id) && (
              <div className="bg-slate-50/50 border-t p-8 space-y-6 animate-in slide-in-from-top-2 text-left">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><History size={14} /> Governing History</h4>
                <div className="flex flex-col gap-4 pl-4 relative text-left">
                  <div className="absolute left-[21px] top-4 bottom-4 w-0.5 bg-slate-200" />
                  {tech.governingChain.map((ref, idx) => {
                    const isAddendum = ref.startsWith('ADD-');
                    const hasPricing = isAddendum && !ref.includes('EXT');
                    return (
                      <div key={idx} className="flex items-center gap-4 relative z-10 group text-left">
                        <div className="w-[14px] h-[14px] rounded-full border-2 border-slate-300 bg-white shadow-sm" />
                        <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-6 shadow-sm hover:shadow-md transition-all text-left">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-700 font-mono tracking-tight"><FileText size={14} className="text-slate-400"/> {ref}</div>
                          <div className="flex items-center gap-2 border-l border-slate-100 pl-4">
                            <button onClick={(e) => { e.stopPropagation(); setActiveDeepLink({source:ref, type:'contract'}); }} className="text-[10px] text-slate-400 uppercase font-black hover:text-blue-600 transition-colors text-left">Document <ExternalLink size={12}/></button>
                            {hasPricing && (<button onClick={(e) => { e.stopPropagation(); setActiveDeepLink({source:ref, type:'pricing'}); }} className="text-[10px] text-blue-600 uppercase font-black hover:text-blue-800 border-l border-slate-100 pl-2 transition-colors text-left">Pricing <DollarSign size={12}/></button>)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const PricingView = ({ techs }) => {
  const [expandedTech, setExpandedTech] = useState(['T1']);
  const [selectedTableKey, setSelectedTableKey] = useState(null);
  const [isAddPriceModalOpen, setIsAddPriceModalOpen] = useState(false);
  const [addPriceStep, setAddPriceStep] = useState('form'); 
  const [newPriceTable, setNewPriceTable] = useState({ techId: '', tableName: '', agreementRef: '' });

  const pricingData = [
    { techId: 'T1', techName: 'ARM-v8 Architecture', tables: [{ name: 'Table 1.1: Standard Royalty per Core', agreement: 'ADD-2021-01', section: 'Annex A', used: true }, { name: 'Table 2.1: Multi-Core Scaling Discount', agreement: 'ADD-2021-01', section: 'Annex B', used: true }, { name: 'Table 3.4: Extension Maintenance Fee', agreement: 'ADD-2025-EXT', section: 'Clause 2', used: false }] },
    { techId: 'T2', techName: 'IoT Sensor Core (Gen 1)', tables: [{ name: 'Table 1.2: Sensor Unit Flat Rate', agreement: 'ADD-2021-01', section: 'Section 4.1', used: true }, { name: 'Table 4.5: Volume Threshold pricing', agreement: 'ADD-2023-EXT', section: 'Appendix I', used: false }] },
    { techId: 'T4', techName: 'Cloud Computing API', tables: [{ name: 'Table 4.1: API Call Batch Pricing', agreement: 'ADD-2022-04', section: 'Article II', used: false }] },
    { techId: 'T5', techName: 'NextGen AI Engine', tables: [{ name: 'Table 5.1: Inference Engine License', agreement: 'ADD-2023-09', section: 'Exhibit B', used: false }] }
  ];

  const handleAddOrEdit = () => {
    if (selectedTableKey) {
      const [tId, tIdx] = selectedTableKey.split('-');
      const table = pricingData.find(g => g.techId === tId)?.tables[parseInt(tIdx)];
      if (table) setNewPriceTable({ techId: tId, tableName: table.name, agreementRef: table.agreement });
    } else setNewPriceTable({ techId: '', tableName: '', agreementRef: '' });
    setIsAddPriceModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in relative text-left">
      {isAddPriceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 text-left">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
             {addPriceStep === 'form' ? (
               <div className="text-left text-left">
                 <div className="bg-slate-50 px-8 py-6 border-b flex justify-between items-center text-left text-left">
                   <div className="flex items-center gap-3 text-left">
                     <div className="p-2 bg-blue-600 text-white rounded-lg">{selectedTableKey ? <Settings2 size={20}/> : <Plus size={20}/>}</div>
                     <h3 className="text-xl font-bold text-slate-800 text-left">{selectedTableKey ? 'Edit Price Table' : 'Add Price Table'}</h3>
                   </div>
                   <button onClick={() => setIsAddPriceModalOpen(false)}><X size={24} className="text-slate-400" /></button>
                 </div>
                 <div className="p-8 space-y-6 text-left">
                    <div className="space-y-2 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Select Technology</label>
                      <select className="w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 shadow-inner" value={newPriceTable.techId} onChange={(e) => setNewPriceTable({...newPriceTable, techId: e.target.value})}>
                        <option value="">Choose tech...</option>
                        {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Price Table Name</label>
                      <input type="text" className="w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 font-medium shadow-inner" value={newPriceTable.tableName} onChange={(e) => setNewPriceTable({...newPriceTable, tableName: e.target.value})} />
                    </div>
                    <div className="space-y-2 text-left text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Source Agreement (Full Registry)</label>
                      <select className="w-full bg-slate-50 border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 shadow-inner" value={newPriceTable.agreementRef} onChange={(e) => setNewPriceTable({...newPriceTable, agreementRef: e.target.value})}>
                        {SHAREPOINT_REGISTRY.map(c => <option key={c.id} value={c.ref}>{c.name} ({c.ref}) — {c.status}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-3 pt-2 text-left">
                      <button onClick={() => setIsAddPriceModalOpen(false)} className="flex-1 py-3 border rounded-xl font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-colors text-center">Cancel</button>
                      <button onClick={() => setAddPriceStep('tagging')} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 text-center">Select & Tag Section</button>
                    </div>
                 </div>
               </div>
             ) : (
               <div className="flex flex-col h-[600px] text-left text-left">
                 <div className="bg-slate-900 px-8 py-4 flex justify-between items-center text-white">
                   <div className="flex items-center gap-3">
                     <div className="p-1.5 bg-blue-500 rounded text-white shadow-sm"><FileStack size={18}/></div>
                     <div><div className="text-[10px] font-black uppercase opacity-60">Tagging Workspace</div><div className="text-sm font-bold">{newPriceTable.agreementRef}</div></div>
                   </div>
                   <button onClick={() => setAddPriceStep('form')} className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1"><ChevronRight className="rotate-180" size={14}/> Back to Form</button>
                 </div>
                 <div className="flex-grow bg-slate-200 relative overflow-hidden flex items-center justify-center group text-left">
                    <div className="bg-white w-3/4 h-[90%] shadow-2xl rounded p-12 relative text-left">
                       <div className="h-4 bg-slate-100 rounded w-1/2 mb-4"></div>
                       <div className="border-2 border-dashed border-blue-400 p-8 rounded bg-blue-50/30 flex flex-col items-center justify-center relative shadow-sm text-left">
                          <MousePointer2 className="text-blue-500 absolute -top-4 -left-4 animate-bounce" />
                          <div className="font-mono text-[10px] font-bold text-blue-400 mb-2 uppercase text-center text-left">Highlight Area for Pricing Table</div>
                          <div className="w-full space-y-2 opacity-20 text-left text-left"><div className="h-3 bg-blue-200 rounded"></div><div className="h-3 bg-blue-200 rounded"></div><div className="h-3 bg-blue-200 rounded"></div></div>
                       </div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-blue-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 font-bold animate-pulse"><Target size={18}/> Highlight Section Now</div>
                    </div>
                 </div>
                 <div className="p-6 bg-white border-t flex justify-between items-center text-left text-left">
                    <div className="text-xs text-slate-400 font-medium">Drag mouse over the pricing table area in the scan to link.</div>
                    <button onClick={() => { setIsAddPriceModalOpen(false); setAddPriceStep('form'); setSelectedTableKey(null); }} className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 transition-all active:scale-95">Complete Mapping</button>
                 </div>
               </div>
             )}
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 text-left text-left">
        <div className="flex items-center gap-4 text-left">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shadow-sm"><BadgeDollarSign size={24} /></div>
          <div><h2 className="text-xl font-black text-slate-900 tracking-tighter text-left">Identified Pricing Tables</h2><p className="text-xs text-slate-400 font-medium italic font-mono uppercase tracking-widest text-slate-300 text-left">Registry Analytics</p></div>
        </div>
        <button onClick={handleAddOrEdit} className={`px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg transition-all active:scale-95 shrink-0 ${selectedTableKey ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
          {selectedTableKey ? <Edit3 size={18}/> : <Plus size={18} />} Add/Edit Price Table
        </button>
      </div>

      <div className="space-y-4 text-left">
        {pricingData.map(group => (
          <div key={group.techId} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm transition-all text-left">
            <button onClick={() => setExpandedTech(prev => prev.includes(group.techId) ? prev.filter(id => id !== group.techId) : [...prev, group.techId])} className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left">
              <div className="flex items-center gap-3 text-left"><Box size={18} className="text-blue-500" /><span className="font-black text-slate-800 tracking-tight text-left">{group.techName}</span></div>
              <ChevronDown className={`text-slate-300 transition-transform ${expandedTech.includes(group.techId) ? 'rotate-180' : ''}`} size={20} />
            </button>
            {expandedTech.includes(group.techId) && (
              <div className="border-t border-slate-100 bg-slate-50/50 p-2 space-y-2 text-left">
                {group.tables.map((table, idx) => {
                  const key = `${group.techId}-${idx}`;
                  const isSelected = selectedTableKey === key;
                  return (
                    <div key={idx} className={`bg-white border rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 transition-all shadow-sm ${isSelected ? 'border-blue-500 ring-2 ring-blue-50' : 'border-slate-200 hover:border-slate-300'} text-left`}>
                      <div className="flex items-center gap-4 flex-1 text-left text-left">
                        <input type="checkbox" checked={isSelected} onChange={() => setSelectedTableKey(prev => (prev === key ? null : key))} className="w-5 h-5 rounded border-slate-300 text-blue-600 cursor-pointer shadow-sm" />
                        <div className="flex-1 text-left text-left"><div className="text-sm font-bold text-slate-800 text-left">{table.name} <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400 font-mono tracking-tight text-left">{table.agreement}</span></div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 text-left">Source Tag: {table.section}</div></div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0 text-left">
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-sm border ${table.used ? 'bg-green-50 text-green-700 border-green-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                          {table.used ? <Activity size={10} className="animate-pulse" /> : <Clock size={10} />}
                          {table.used ? 'Used' : 'Not Reported'}
                        </div>
                        <button className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition-all shadow-sm border border-slate-100 group-hover:shadow-md text-left"><ExternalLink size={18} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const GlossaryView = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTagging, setIsTagging] = useState(false);
  const [newEntry, setNewEntry] = useState({ contractRef: '', sectionRef: '', definition: '', term: '' });

  const definitions = [
    { id: 1, term: 'Affiliate', definition: 'Any entity that directly or indirectly controls, is controlled by, or is under common control with a Party.', source: 'MA-2020-TC', section: 'Section 1.1' },
    { id: 2, term: 'Gross Sales', definition: 'The total amount invoiced by Licensee or its Affiliates for the sale of Licensed Products to third parties, less applicable taxes and shipping.', source: 'MA-2020-TC', section: 'Section 1.8' },
    { id: 3, term: 'Licensed Products', definition: 'Any product or component manufactured, sold, or otherwise distributed by Licensee that incorporates the Licensed Technology.', source: 'MA-2020-TC', section: 'Section 1.12' },
    { id: 4, term: 'Licensed Technology', definition: 'The intellectual property rights, patents, and technical specifications described in the relevant Addendum.', source: 'MA-2020-TC', section: 'Section 1.14' },
    { id: 5, term: 'Net Sales', definition: 'Gross Sales minus returns, prompt-payment discounts, and volume rebates as explicitly permitted under Section 4.2.', source: 'ADD-2021-01', section: 'Definitions Clause' },
    { id: 6, term: 'Quarterly Period', definition: 'The three-month periods ending March 31, June 30, September 30, and December 31 of each calendar year.', source: 'MA-2020-TC', section: 'Section 1.20' },
    { id: 7, term: 'Royalty Bearing Unit', definition: 'Each individual unit of a Licensed Product sold, leased, or otherwise transferred for value.', source: 'ADD-2022-04', section: 'Article II' }
  ];
  const filtered = definitions.filter(d => d.term.toLowerCase().includes(searchTerm.toLowerCase()) || d.definition.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 relative animate-in fade-in duration-500 text-left text-left text-left">
      {isTagging && (
        <div className="fixed inset-0 bg-slate-900/80 z-[250] flex flex-col items-center justify-center text-white text-left">
          <FileSearch size={64} className="animate-bounce text-blue-400 mb-4" /><p className="text-xl font-black font-mono uppercase tracking-widest text-center px-4 text-left">Scanning SharePoint Registry Document...</p>
        </div>
      )}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4 text-left">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left">
             <div className="bg-slate-50 px-8 py-6 border-b flex justify-between items-center text-left text-left">
               <h3 className="text-xl font-bold text-slate-800 tracking-tight text-left">Add Glossary Entry</h3>
               <button onClick={() => setIsAddModalOpen(false)}><X size={24} className="text-slate-400" /></button>
             </div>
             <div className="p-8 space-y-6 text-left">
                <div className="space-y-2 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Registry Agreement</label>
                  <select className="w-full bg-slate-50 border rounded-xl px-4 py-3 font-bold text-slate-700 shadow-inner text-left" value={newEntry.contractRef} onChange={(e) => setNewEntry({...newEntry, contractRef: e.target.value})}>
                    <option value="">Full SharePoint Access...</option>
                    {SHAREPOINT_REGISTRY.map(c => <option key={c.id} value={c.ref}>{c.name} ({c.ref})</option>)}
                  </select>
                </div>
                <div className="space-y-2 text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Section Ref</label>
                  <div className="flex gap-2 text-left">
                    <input type="text" className="flex-1 bg-slate-50 border rounded-xl px-4 py-3 text-left" placeholder="e.g. Section 14.2" value={newEntry.sectionRef} onChange={(e) => setNewEntry({...newEntry, sectionRef: e.target.value})} />
                    <button onClick={() => { if(!newEntry.contractRef) return; setIsTagging(true); setTimeout(() => { setNewEntry(prev => ({...prev, definition: "RESTORED TEXT: 'The total amount invoiced...'", term: "TaggedTerm"})); setIsTagging(false); }, 1500); }} className="bg-slate-900 text-white px-6 rounded-xl font-bold text-xs flex items-center gap-2 active:scale-95 transition-all shadow-lg text-left text-left"><Target size={14}/> Tag</button>
                  </div>
                </div>
                <div className="space-y-2 text-left text-left"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Definition</label>
                  <textarea className="w-full h-32 bg-slate-50 border rounded-xl px-4 py-3 outline-none text-sm font-medium resize-none shadow-inner text-left" placeholder="Definition text..." value={newEntry.definition} onChange={(e) => setNewEntry({...newEntry, definition: e.target.value})} />
                </div>
                <div className="flex gap-3 pt-2 text-left">
                  <button onClick={() => setIsAddModalOpen(false)} className="flex-1 py-3 border rounded-xl font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-colors text-center">Cancel</button>
                  <button onClick={() => setIsAddModalOpen(false)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg text-center">Save Definition</button>
                </div>
             </div>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 text-left text-left">
        <button onClick={() => setIsAddModalOpen(true)} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow-lg text-left text-center"><Plus size={18} /> Add Glossary</button>
        <div className="relative flex-1 max-w-lg w-full rounded-xl overflow-hidden bg-slate-50 shadow-inner border text-left">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search IP definitions..." className="w-full pl-12 pr-4 py-3 bg-transparent text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold tracking-tight text-left" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 text-left text-left">
        {filtered.map(item => (
          <div key={item.id} className="bg-white border-2 rounded-2xl p-6 shadow-sm group hover:border-blue-300 transition-colors border-transparent text-left text-left">
            <h3 className="text-lg font-black text-slate-900 group-hover:text-blue-600 transition-colors tracking-tight text-left">{item.term}</h3>
            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 font-medium italic mt-2 shadow-inner text-left">{item.definition}</p>
            <div className="flex justify-end mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">{item.source} {item.section}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ReviewNotesView = ({ notes, setNotes }) => {
  const [filters, setFilters] = useState({ pending: true, reviewed: true, resolved: true });

  const filtered = useMemo(() => {
    return notes.filter(n => {
      const isResolved = n.isReviewed && n.narrative.trim().length > 0;
      const isReviewedOnly = n.isReviewed && n.narrative.trim().length === 0;
      if (filters.pending && !n.isReviewed) return true;
      if (filters.reviewed && isReviewedOnly) return true;
      if (filters.resolved && isResolved) return true;
      return false;
    });
  }, [notes, filters]);

  return (
    <div className="space-y-6 animate-in fade-in relative text-sm font-bold tracking-tight text-left text-left text-left">
      <div className="bg-slate-50 border p-4 rounded-2xl flex flex-wrap gap-6 shadow-inner text-left text-left text-left">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest w-full mb-1 text-left">State Resolution Filters:</span>
        {['pending', 'reviewed', 'resolved'].map(f => (
          <label key={f} className="flex items-center gap-2 cursor-pointer group bg-white px-3 py-1 rounded-lg hover:bg-slate-100 transition-all shadow-sm border text-left">
            <input type="checkbox" checked={filters[f]} onChange={() => setFilters({...filters, [f]: !filters[f]})} className={`w-4 h-4 rounded border-slate-300 ${f === 'pending' ? 'text-red-600' : f === 'reviewed' ? 'text-orange-600' : 'text-green-600'}`} />
            <span className="text-xs font-black text-slate-600 uppercase transition-colors text-left">{f}</span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 text-left text-left">
        {filtered.map(note => {
          const isRes = note.isReviewed && note.narrative;
          return (
            <div key={note.id} className={`bg-white border-2 rounded-2xl p-6 shadow-sm transition-all duration-300 text-left text-left ${note.isReviewed ? isRes ? 'border-green-500 bg-green-50/10' : 'border-orange-500 bg-orange-50/10' : 'border-red-500 bg-red-50/10'}`}>
              <div className="flex items-start gap-4 text-left text-left text-left">
                <input type="checkbox" checked={note.isReviewed} onChange={(e) => setNotes(notes.map(n => n.id === note.id ? {...n, isReviewed: e.target.checked} : n))} className="w-6 h-6 rounded mt-1 border-slate-300 cursor-pointer shadow-sm text-left" />
                <div className="flex-1 text-left text-left text-left">
                  <div className="flex gap-2 mb-1 uppercase text-[10px] font-black tracking-widest text-slate-400 text-left text-left text-left text-left text-left text-left text-left"><span>{note.type}</span> <span className={`px-2 py-0.5 rounded text-white shadow-sm ${note.isReviewed ? isRes ? 'bg-green-500' : 'bg-orange-500' : 'bg-red-500'}`}>{note.isReviewed ? isRes ? 'RESOLVED' : 'REVIEWED' : 'PENDING'}</span></div>
                  <h4 className="text-slate-800 font-black text-lg text-left">{note.issue}</h4>
                  
                  {note.isReviewed && (
                    <div className="mt-4 space-y-2 animate-in slide-in-from-top-1 text-left text-left text-left">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 text-left"><MessageSquare size={12}/> Auditor Resolution Narrative</label>
                      <textarea value={note.narrative} onChange={(e) => setNotes(notes.map(n => n.id === note.id ? {...n, narrative: e.target.value} : n))} className="w-full p-4 bg-white border rounded-xl italic font-medium text-slate-600 shadow-inner outline-none focus:ring-1 focus:ring-blue-500 text-left" placeholder="Enter resolution details..." />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [techs, setTechs] = useState(INITIAL_TECH_LIST);
  const [notes, setNotes] = useState([
    { id: 1, type: 'ADD-MKT-2019', issue: 'Agreement found in SharePoint has not been linked to a Master Agreement.', isReviewed: false, narrative: '' },
    { id: 2, type: 'ADD-2022-04', issue: 'Pricing tiers for Region B are unreadable due to blur in original scan.', isReviewed: true, narrative: '' },
    { id: 3, type: 'ADD-2021-01', issue: 'Pricing rate $1.20 identified in contract was not used in reports.', isReviewed: true, narrative: 'Verified with licensee; technology was licensed but not manufactured in audit period.' }
  ]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm text-left">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-left">
          <div className="flex items-center gap-3 text-left"><div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg text-left"><FileSearch size={24} /></div><h1 className="text-xl font-black text-slate-800 tracking-tighter text-left">Contract Review Assistant</h1></div>
          <div className="flex bg-slate-100 p-1 rounded-lg overflow-x-auto shadow-inner border border-slate-200 text-left">
            {[
              { id: 'overview', label: 'Audit Overview', icon: FileText }, { id: 'listing', label: 'Contract Listing', icon: LayoutDashboard }, { id: 'technology', label: 'Technology', icon: Tag }, { id: 'pricing', label: 'Pricing', icon: DollarSign }, { id: 'glossary', label: 'Glossary', icon: Book }, { id: 'notes', label: 'Review Notes', icon: NotebookPen },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'bg-white shadow-sm text-blue-600 font-black' : 'text-slate-600 hover:text-slate-900'} text-left text-center`}><tab.icon size={16} />{tab.label}</button>
            ))}
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-6 text-left text-left">
        {activeTab === 'overview' && <AuditOverviewView notes={notes} />}
        {activeTab === 'listing' && <ContractListingTab />}
        {activeTab === 'technology' && <TechnologyView techs={techs} setTechs={setTechs} />}
        {activeTab === 'pricing' && <PricingView techs={techs} />}
        {activeTab === 'glossary' && <GlossaryView />}
        {activeTab === 'notes' && <ReviewNotesView notes={notes} setNotes={setNotes} />}
      </main>
    </div>
  );
}