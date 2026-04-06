"use client";

import { useEffect, useState } from "react";
import type { Contract, Relationship } from "@/types";

const formatDate = (d: string | null) => {
  if (!d) return "";
  const date = new Date(d);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${date.getDate().toString().padStart(2, "0")}-${months[date.getMonth()]}-${date.getFullYear()}`;
};

const TYPE_COLORS: Record<string, { bar: string; bg: string; text: string }> = {
  master_tc: { bar: "#2563eb", bg: "#dbeafe", text: "#1e40af" },
  technology_license: { bar: "#059669", bg: "#d1fae5", text: "#065f46" },
  side_letter: { bar: "#d97706", bg: "#fef3c7", text: "#92400e" },
};

const TYPE_LABELS: Record<string, string> = {
  master_tc: "Master T&C",
  technology_license: "Tech License",
  side_letter: "Side Letter",
  amendment: "Amendment",
  extension: "Extension",
};

export default function TimelineView({ projectId }: { projectId?: number | null }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const qs = projectId ? `?project_id=${projectId}` : "";
    fetch(`/api/contracts${qs}`).then(r => r.json()).then(async (data) => {
      setContracts(data.contracts);
      // Fetch all relationships
      const allRels: Relationship[] = [];
      for (const c of data.contracts) {
        const res = await fetch(`/api/contracts/${c.id}`);
        const detail = await res.json();
        if (detail.relationships) allRels.push(...detail.relationships);
      }
      const seen = new Set<string>();
      setRelationships(allRels.filter(r => {
        const key = `${r.source_id}-${r.target_id}-${r.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    });
  }, []);

  if (!contracts.length) return null;

  // Build parent lookup from relationships for date fallback
  const parentLookup = new Map<string, string>();
  for (const r of relationships) {
    if (r.type === "references_tc" && !parentLookup.has(r.source_id)) {
      parentLookup.set(r.source_id, r.target_id);
    }
  }
  const contractById = new Map(contracts.map(c => [c.id, c]));

  // Resolve effective date: own date → parent's date
  const resolveEffectiveDate = (c: Contract): string | null => {
    if (c.effective_date) return c.effective_date;
    const parentId = parentLookup.get(c.id);
    if (parentId) {
      const parent = contractById.get(parentId);
      if (parent?.effective_date) return parent.effective_date;
    }
    return null;
  };

  // Determine timeline range from data
  const dates = contracts.flatMap(c => [resolveEffectiveDate(c), c.expiry_date].filter(Boolean) as string[]);
  const allTimestamps = dates.map(d => new Date(d).getTime());
  const minTime = Math.min(...allTimestamps);
  const maxTime = Math.max(...allTimestamps);

  // Add padding of 3 months on each side
  const pad = 90 * 24 * 60 * 60 * 1000;
  const startTime = minTime - pad;
  const endTime = maxTime + pad;
  const totalDuration = endTime - startTime;

  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  // Generate year markers
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear() + 1;
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);

  // "Today" marker
  const todayTime = new Date().getTime();
  const todayPct = ((todayTime - startTime) / totalDuration) * 100;
  const showToday = todayPct > 0 && todayPct < 100;

  // Position helper
  const getX = (dateStr: string) => {
    const t = new Date(dateStr).getTime();
    return ((t - startTime) / totalDuration) * 100;
  };

  // Build hierarchy from relationships: find "hub" contracts (most referenced)
  // A contract is a "parent" if others reference_tc or amend it
  const inboundCount = new Map<string, number>();
  const childToParent = new Map<string, string>();

  for (const r of relationships) {
    if (r.type === "references_tc" || r.type === "amends") {
      inboundCount.set(r.target_id, (inboundCount.get(r.target_id) || 0) + 1);
    }
    // references_tc defines the primary parent relationship
    if (r.type === "references_tc" && !childToParent.has(r.source_id)) {
      childToParent.set(r.source_id, r.target_id);
    }
  }

  // Also check DB parent_id
  for (const c of contracts) {
    if (c.parent_id && !childToParent.has(c.id)) {
      childToParent.set(c.id, c.parent_id);
    }
  }

  // Identify parents (contracts that have children pointing to them)
  const parentIds = new Set(childToParent.values());
  const grouped: { master: Contract | null; children: Contract[] }[] = [];

  // Sort parents by inbound count (most referenced first)
  const sortedParents = contracts
    .filter(c => parentIds.has(c.id))
    .sort((a, b) => (inboundCount.get(b.id) || 0) - (inboundCount.get(a.id) || 0));

  for (const parent of sortedParents) {
    const children = contracts.filter(c => childToParent.get(c.id) === parent.id && c.id !== parent.id);
    // Sort children by effective date (resolved)
    children.sort((a, b) => (resolveEffectiveDate(a) || "9999").localeCompare(resolveEffectiveDate(b) || "9999"));
    grouped.push({ master: parent, children });
  }

  // Ungrouped: contracts that are neither a parent nor a child
  const groupedIds = new Set(grouped.flatMap(g => [g.master?.id, ...g.children.map(c => c.id)].filter(Boolean)));
  const ungrouped = contracts.filter(c => !groupedIds.has(c.id));
  if (ungrouped.length) {
    // Sort ungrouped by effective date (resolved), nulls last
    ungrouped.sort((a, b) => (resolveEffectiveDate(a) || "9999").localeCompare(resolveEffectiveDate(b) || "9999"));
    grouped.push({ master: null, children: ungrouped });
  }

  const svgW = 1000;
  const rowH = 56;
  const headerH = 40;
  const leftPad = 0;
  const chartLeft = 0;
  const chartW = svgW;
  let currentY = headerH + 10;

  // Pre-calculate rows
  const rows: { contract: Contract; y: number; isChild: boolean; groupIdx: number }[] = [];
  grouped.forEach((group, gi) => {
    if (group.master) {
      rows.push({ contract: group.master, y: currentY, isChild: false, groupIdx: gi });
      currentY += rowH;
    }
    for (const child of group.children) {
      rows.push({ contract: child, y: currentY, isChild: true, groupIdx: gi });
      currentY += rowH;
    }
    currentY += 16; // group gap
  });

  const svgH = currentY + 20;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ minHeight: Math.max(300, svgH * 0.6) }}>
          <defs>
            <filter id="bar-shadow" x="-2%" y="-20%" width="104%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.1" />
            </filter>
          </defs>

          {/* Year grid lines */}
          {years.map(year => {
            const x = chartLeft + (((new Date(`${year}-01-01`).getTime()) - startTime) / totalDuration) * chartW;
            if (x < chartLeft || x > chartLeft + chartW) return null;
            return (
              <g key={year}>
                <line x1={x} y1={headerH - 5} x2={x} y2={svgH} stroke="#f1f5f9" strokeWidth={1} />
                <text x={x + 4} y={headerH - 10} fontSize={11} fontWeight={800} fill="#cbd5e1">
                  {year}
                </text>
              </g>
            );
          })}

          {/* Quarter sub-lines */}
          {years.map(year =>
            [1, 4, 7, 10].map(month => {
              const x = chartLeft + (((new Date(`${year}-${String(month).padStart(2, "0")}-01`).getTime()) - startTime) / totalDuration) * chartW;
              if (x < chartLeft || x > chartLeft + chartW) return null;
              return <line key={`${year}-${month}`} x1={x} y1={headerH} x2={x} y2={svgH} stroke="#f8fafc" strokeWidth={0.5} />;
            })
          )}

          {/* Today marker */}
          {showToday && (
            <g>
              <line
                x1={chartLeft + (todayPct / 100) * chartW}
                y1={headerH}
                x2={chartLeft + (todayPct / 100) * chartW}
                y2={svgH}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4,3"
              />
              <rect
                x={chartLeft + (todayPct / 100) * chartW - 20}
                y={headerH - 4}
                width={40}
                height={14}
                rx={4}
                fill="#ef4444"
              />
              <text
                x={chartLeft + (todayPct / 100) * chartW}
                y={headerH + 7}
                textAnchor="middle"
                fontSize={8}
                fontWeight={800}
                fill="#fff"
              >
                TODAY
              </text>
            </g>
          )}

          {/* Rows */}
          {rows.map(({ contract, y, isChild }) => {
            const colors = TYPE_COLORS[contract.type] || { bar: "#64748b", bg: "#f1f5f9", text: "#475569" };
            const resolvedStart = resolveEffectiveDate(contract);
            const hasStart = !!resolvedStart;
            const isInferred = hasStart && !contract.effective_date;
            const hasEnd = !!contract.expiry_date;

            if (!hasStart) {
              // No effective date — show as gray bar spanning full width with "Date Unknown" label
              const barH = isChild ? 20 : 26;
              const barY = y + (rowH - barH) / 2;
              return (
                <g key={contract.id} onMouseEnter={() => setHoveredId(contract.id)} onMouseLeave={() => setHoveredId(null)} style={{ cursor: "default" }}>
                  {isChild && <line x1={chartLeft + 14} y1={y - 8} x2={chartLeft + 14} y2={barY + barH / 2} stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="3,2" />}
                  <rect x={chartLeft + 20} y={barY} width={chartW - 40} height={barH} rx={barH / 2} fill="#cbd5e1" opacity={0.4} />
                  <text x={chartLeft + 34} y={barY + barH / 2 + (isChild ? 3.5 : 4)} fontSize={isChild ? 9 : 11} fontWeight={800} fill="#64748b">
                    {contract.id}: {contract.name.length > 30 ? contract.name.slice(0, 30) + "..." : contract.name}
                  </text>
                  <text x={chartLeft + chartW - 80} y={barY + barH / 2 + 3} fontSize={8} fontWeight={700} fill="#94a3b8">
                    DATE UNKNOWN
                  </text>
                </g>
              );
            }

            const barX = chartLeft + (getX(resolvedStart!) / 100) * chartW;
            const barEndX = hasEnd
              ? chartLeft + (getX(contract.expiry_date!) / 100) * chartW
              : chartLeft + chartW - 20; // extend to near end if open-ended
            const barW = Math.max(barEndX - barX, 8);
            const barH = isChild ? 20 : 26;
            const barY = y + (rowH - barH) / 2;
            const isHovered = hoveredId === contract.id;

            return (
              <g
                key={contract.id}
                onMouseEnter={() => setHoveredId(contract.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ cursor: "default" }}
              >
                {/* Row hover background */}
                {isHovered && (
                  <rect x={0} y={y} width={svgW} height={rowH} fill="#f8fafc" rx={0} />
                )}

                {/* Indent connector for children */}
                {isChild && (
                  <line x1={barX - 6} y1={y - 8} x2={barX - 6} y2={barY + barH / 2} stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="3,2" />
                )}

                {/* Bar */}
                <rect
                  x={barX}
                  y={barY}
                  width={barW}
                  height={barH}
                  rx={barH / 2}
                  fill={isInferred ? "transparent" : colors.bar}
                  stroke={isInferred ? colors.bar : "none"}
                  strokeWidth={isInferred ? 2 : 0}
                  strokeDasharray={isInferred ? "6,3" : "none"}
                  opacity={isHovered ? 1 : 0.8}
                  filter="url(#bar-shadow)"
                  style={{ transition: "opacity 0.15s" }}
                />

                {/* Open-ended indicator */}
                {!hasEnd && (
                  <text x={barX + barW + 4} y={barY + barH / 2 + 3} fontSize={10} fill="#94a3b8" fontWeight={700}>
                    &#x2192; Open
                  </text>
                )}

                {/* Label on bar */}
                <text
                  x={barX + 10}
                  y={barY + barH / 2 + (isChild ? 3.5 : 4)}
                  fontSize={isChild ? 9 : 11}
                  fontWeight={800}
                  fill={isInferred ? colors.bar : "#fff"}
                >
                  {contract.id}: {contract.name.length > 30 ? contract.name.slice(0, 30) + "..." : contract.name}
                  {isInferred ? " (date inferred)" : ""}
                </text>

                {/* Tooltip on hover */}
                {isHovered && (
                  <g>
                    <rect
                      x={barX}
                      y={barY - 38}
                      width={220}
                      height={32}
                      rx={8}
                      fill="#1e293b"
                      opacity={0.95}
                    />
                    <text x={barX + 10} y={barY - 24} fontSize={9} fontWeight={700} fill="#94a3b8">
                      {TYPE_LABELS[contract.type] || contract.type}
                    </text>
                    <text x={barX + 10} y={barY - 12} fontSize={10} fontWeight={700} fill="#fff">
                      {isInferred ? "≈ " : ""}{formatDate(resolvedStart)} — {hasEnd ? formatDate(contract.expiry_date) : "Open Ended"}
                      {isInferred ? " (from parent)" : ""}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex gap-6 text-[10px] font-bold text-slate-400">
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: TYPE_COLORS[type]?.bar }} />
            {label}
          </div>
        ))}
        {showToday && (
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-3 h-0.5 bg-red-500 rounded" /> Today
          </div>
        )}
      </div>
    </div>
  );
}
