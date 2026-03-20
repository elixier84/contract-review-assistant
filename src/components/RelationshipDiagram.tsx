"use client";

import { useEffect, useState, useRef } from "react";
import type { Contract, Relationship } from "@/types";

interface Node {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Edge {
  source: string;
  target: string;
  type: string;
  confidence: number;
}

const TYPE_COLORS: Record<string, string> = {
  master_tc: "#2563eb",
  technology_license: "#059669",
  side_letter: "#d97706",
};

const TYPE_LABELS: Record<string, string> = {
  master_tc: "Master T&C",
  technology_license: "Tech License",
  side_letter: "Side Letter",
};

const EDGE_COLORS: Record<string, string> = {
  references_tc: "#6366f1",
  amends: "#ef4444",
  pricing_for: "#f59e0b",
  related_technology: "#8b5cf6",
};

const EDGE_LABELS: Record<string, string> = {
  references_tc: "references T&C",
  amends: "amends",
  pricing_for: "pricing for",
  related_technology: "related tech",
};

// Deduplicate edges: keep only highest-confidence per source→target pair
function deduplicateEdges(relationships: Relationship[]): Edge[] {
  const map = new Map<string, Edge>();
  for (const r of relationships) {
    const key = `${r.source_id}→${r.target_id}`;
    const existing = map.get(key);
    if (!existing || (r.confidence ?? 0) > existing.confidence) {
      map.set(key, {
        source: r.source_id,
        target: r.target_id,
        type: r.type,
        confidence: r.confidence ?? 0,
      });
    }
  }
  return Array.from(map.values());
}

function layoutNodes(contracts: Contract[]): Node[] {
  const nodeW = 220;
  const nodeH = 70;
  const svgW = 800;

  // Find master (no parent), then group children
  const master = contracts.find(c => c.type === "master_tc" || !c.parent_id);
  const children = contracts.filter(c => c.parent_id);
  const sideLetter = contracts.find(c => c.type === "side_letter");

  const nodes: Node[] = [];

  // Master at top center
  if (master) {
    nodes.push({ id: master.id, name: `${master.id}: ${master.name}`, type: master.type, x: svgW / 2 - nodeW / 2, y: 30, w: nodeW, h: nodeH });
  }

  // Tech licenses in the middle row
  const techLicenses = children.filter(c => c.type === "technology_license");
  const midY = 180;
  const spacing = 280;
  const startX = svgW / 2 - ((techLicenses.length - 1) * spacing) / 2 - nodeW / 2;
  techLicenses.forEach((c, i) => {
    nodes.push({ id: c.id, name: `${c.id}: ${c.name}`, type: c.type, x: startX + i * spacing, y: midY, w: nodeW, h: nodeH });
  });

  // Side letter at bottom center
  if (sideLetter && !nodes.find(n => n.id === sideLetter.id)) {
    nodes.push({ id: sideLetter.id, name: `${sideLetter.id}: ${sideLetter.name}`, type: sideLetter.type, x: svgW / 2 - nodeW / 2, y: 340, w: nodeW, h: nodeH });
  }

  return nodes;
}

function computeEdgePath(from: Node, to: Node): { path: string; labelX: number; labelY: number; angle: number } {
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;

  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  const angle = Math.atan2(dy, dx);

  // Intersection with rectangles
  const fromExit = rectEdgePoint(from, angle);
  const toEntry = rectEdgePoint(to, angle + Math.PI);

  // Slight curve
  const midX = (fromExit.x + toEntry.x) / 2;
  const midY = (fromExit.y + toEntry.y) / 2;
  const perpX = -(toEntry.y - fromExit.y) * 0.1;
  const perpY = (toEntry.x - fromExit.x) * 0.1;

  const path = `M ${fromExit.x} ${fromExit.y} Q ${midX + perpX} ${midY + perpY}, ${toEntry.x} ${toEntry.y}`;
  return { path, labelX: midX + perpX, labelY: midY + perpY, angle };
}

function rectEdgePoint(node: Node, angle: number): { x: number; y: number } {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const hw = node.w / 2 + 2;
  const hh = node.h / 2 + 2;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const scaleX = cos !== 0 ? hw / Math.abs(cos) : Infinity;
  const scaleY = sin !== 0 ? hh / Math.abs(sin) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return { x: cx + cos * scale, y: cy + sin * scale };
}

export default function RelationshipDiagram() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch("/api/contracts").then(r => r.json()).then(async (data) => {
      setContracts(data.contracts);
      const allRels: Relationship[] = [];
      for (const c of data.contracts) {
        const res = await fetch(`/api/contracts/${c.id}`);
        const detail = await res.json();
        allRels.push(...detail.relationships);
      }
      // Deduplicate (each relationship appears twice from both sides)
      const seen = new Set<string>();
      const unique = allRels.filter(r => {
        const key = `${r.source_id}-${r.target_id}-${r.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setRelationships(unique);
    });
  }, []);

  if (!contracts.length) return null;

  const nodes = layoutNodes(contracts);
  const edges = deduplicateEdges(relationships);
  const svgW = 800;
  const svgH = 460;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 text-sm">Contract Relationship Map</h3>
        <div className="flex gap-4 text-[10px] font-bold text-slate-400">
          {Object.entries(EDGE_LABELS).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded" style={{ background: EDGE_COLORS[type] }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="w-full"
        style={{ minHeight: 380 }}
      >
        <defs>
          {Object.entries(EDGE_COLORS).map(([type, color]) => (
            <marker
              key={type}
              id={`arrow-${type}`}
              viewBox="0 0 10 6"
              refX="9"
              refY="3"
              markerWidth="8"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 3 L 0 6 z" fill={color} />
            </marker>
          ))}
          <filter id="node-shadow" x="-4%" y="-4%" width="108%" height="116%">
            <feDropShadow dx="0" dy="1" stdDeviation="3" floodOpacity="0.08" />
          </filter>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const from = nodes.find(n => n.id === edge.source);
          const to = nodes.find(n => n.id === edge.target);
          if (!from || !to) return null;

          const { path, labelX, labelY } = computeEdgePath(from, to);
          const edgeKey = `${edge.source}-${edge.target}-${edge.type}`;
          const isHovered = hoveredEdge === edgeKey;
          const color = EDGE_COLORS[edge.type] || "#94a3b8";

          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredEdge(edgeKey)}
              onMouseLeave={() => setHoveredEdge(null)}
              style={{ cursor: "pointer" }}
            >
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={isHovered ? 2.5 : 1.5}
                strokeDasharray={edge.type === "related_technology" ? "6,3" : undefined}
                markerEnd={`url(#arrow-${edge.type})`}
                opacity={isHovered ? 1 : 0.6}
                style={{ transition: "all 0.15s" }}
              />
              {/* Invisible wider path for easier hover */}
              <path d={path} fill="none" stroke="transparent" strokeWidth={12} />
              {/* Edge label */}
              <rect
                x={labelX - 36}
                y={labelY - 8}
                width={72}
                height={16}
                rx={4}
                fill={isHovered ? color : "#f8fafc"}
                stroke={color}
                strokeWidth={0.5}
                opacity={isHovered ? 1 : 0.8}
              />
              <text
                x={labelX}
                y={labelY + 3.5}
                textAnchor="middle"
                fontSize={8}
                fontWeight={700}
                fill={isHovered ? "#fff" : color}
                style={{ textTransform: "uppercase", letterSpacing: "0.03em" }}
              >
                {EDGE_LABELS[edge.type] || edge.type}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const color = TYPE_COLORS[node.type] || "#64748b";
          return (
            <g key={node.id} filter="url(#node-shadow)">
              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                rx={12}
                fill="#fff"
                stroke={color}
                strokeWidth={2}
              />
              {/* Color accent bar */}
              <rect
                x={node.x}
                y={node.y}
                width={6}
                height={node.h}
                rx={3}
                fill={color}
              />
              {/* Contract ID */}
              <text
                x={node.x + 16}
                y={node.y + 24}
                fontSize={13}
                fontWeight={900}
                fill="#1e293b"
              >
                {node.id}
              </text>
              {/* Contract name (truncated) */}
              <text
                x={node.x + 16}
                y={node.y + 42}
                fontSize={10}
                fill="#64748b"
              >
                {node.name.length > 35 ? node.name.slice(0, 35) + "..." : node.name}
              </text>
              {/* Type badge */}
              <rect
                x={node.x + node.w - 75}
                y={node.y + 48}
                width={65}
                height={16}
                rx={4}
                fill={color}
                opacity={0.12}
              />
              <text
                x={node.x + node.w - 42}
                y={node.y + 59}
                textAnchor="middle"
                fontSize={8}
                fontWeight={800}
                fill={color}
                style={{ textTransform: "uppercase" }}
              >
                {TYPE_LABELS[node.type] || node.type}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
