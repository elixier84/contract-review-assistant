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

function layoutNodes(contracts: Contract[], relationships: Relationship[]): Node[] {
  const nodeW = 180;
  const nodeH = 65;
  const padding = 60;

  // Initialize positions in a circle
  const cx = 500;
  const cy = 400;
  const radius = Math.max(250, contracts.length * 30);

  const positions: { x: number; y: number }[] = contracts.map((_, i) => ({
    x: cx + radius * Math.cos((2 * Math.PI * i) / contracts.length - Math.PI / 2),
    y: cy + radius * Math.sin((2 * Math.PI * i) / contracts.length - Math.PI / 2),
  }));

  // Build adjacency for force simulation
  const idToIdx = new Map(contracts.map((c, i) => [c.id, i]));
  const edges = relationships
    .map(r => ({ s: idToIdx.get(r.source_id), t: idToIdx.get(r.target_id) }))
    .filter(e => e.s !== undefined && e.t !== undefined) as { s: number; t: number }[];

  // Simple force-directed iterations
  for (let iter = 0; iter < 200; iter++) {
    const fx = new Float64Array(contracts.length);
    const fy = new Float64Array(contracts.length);

    // Repulsion between all pairs
    for (let i = 0; i < contracts.length; i++) {
      for (let j = i + 1; j < contracts.length; j++) {
        let dx = positions[i].x - positions[j].x;
        let dy = positions[i].y - positions[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const repulse = 80000 / (dist * dist);
        dx = (dx / dist) * repulse;
        dy = (dy / dist) * repulse;
        fx[i] += dx; fy[i] += dy;
        fx[j] -= dx; fy[j] -= dy;
      }
    }

    // Attraction along edges
    for (const e of edges) {
      let dx = positions[e.t].x - positions[e.s].x;
      let dy = positions[e.t].y - positions[e.s].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const attract = (dist - 250) * 0.02;
      dx = (dx / dist) * attract;
      dy = (dy / dist) * attract;
      fx[e.s] += dx; fy[e.s] += dy;
      fx[e.t] -= dx; fy[e.t] -= dy;
    }

    // Center gravity
    for (let i = 0; i < contracts.length; i++) {
      fx[i] += (cx - positions[i].x) * 0.005;
      fy[i] += (cy - positions[i].y) * 0.005;
    }

    // Apply forces with damping
    const damping = 1 - iter / 250;
    for (let i = 0; i < contracts.length; i++) {
      positions[i].x += fx[i] * 0.1 * damping;
      positions[i].y += fy[i] * 0.1 * damping;
    }
  }

  // Normalize: shift so min x/y = padding
  const minX = Math.min(...positions.map(p => p.x)) - nodeW / 2;
  const minY = Math.min(...positions.map(p => p.y)) - nodeH / 2;
  positions.forEach(p => {
    p.x -= minX - padding;
    p.y -= minY - padding;
  });

  return contracts.map((c, i) => ({
    id: c.id,
    name: `${c.id}: ${(c.name || "").slice(0, 28)}`,
    type: c.type,
    x: positions[i].x - nodeW / 2,
    y: positions[i].y - nodeH / 2,
    w: nodeW,
    h: nodeH,
  }));
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

export default function RelationshipDiagram({ projectId }: { projectId?: number | null }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const qs = projectId ? `?project_id=${projectId}` : "";
    fetch(`/api/contracts${qs}`).then(r => r.json()).then(async (data) => {
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

  const baseNodes = layoutNodes(contracts, relationships);
  const edges = deduplicateEdges(relationships);

  // Apply user drag offsets
  const nodes = baseNodes.map(n => {
    const pos = nodePositions[n.id];
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  });

  const maxX = nodes.reduce((m, n) => Math.max(m, n.x + n.w), 0) + 100;
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.h), 0) + 100;
  const svgW = Math.max(1200, maxX);
  const svgH = Math.max(600, maxY);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.min(3, Math.max(0.3, z + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !draggingNode) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingNode) {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom - dragOffset.x;
      const y = (e.clientY - rect.top) / zoom - dragOffset.y;
      setNodePositions(prev => ({ ...prev, [draggingNode]: { x, y } }));
    } else if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNode(null);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / zoom;
    const mouseY = (e.clientY - rect.top) / zoom;
    setDragOffset({ x: mouseX - node.x, y: mouseY - node.y });
    setDraggingNode(nodeId);
  };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); setNodePositions({}); };
  const zoomIn = () => setZoom(z => Math.min(3, z + 0.2));
  const zoomOut = () => setZoom(z => Math.max(0.3, z - 0.2));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 text-sm">Contract Relationship Map</h3>
        <div className="flex items-center gap-4">
          <div className="flex gap-4 text-[10px] font-bold text-slate-400">
            {Object.entries(EDGE_LABELS).map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded" style={{ background: EDGE_COLORS[type] }} />
                {label}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-4 border-l border-slate-200 pl-4">
            <button onClick={zoomOut} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 text-sm font-bold">−</button>
            <button onClick={resetView} className="px-2 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:bg-slate-100 text-[10px] font-bold min-w-[44px]">{Math.round(zoom * 100)}%</button>
            <button onClick={zoomIn} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 text-sm font-bold">+</button>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="overflow-hidden"
        style={{ maxHeight: 700, cursor: draggingNode ? "grabbing" : isPanning ? "grabbing" : "grab" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{
          width: svgW * zoom,
          height: svgH * zoom,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          transition: isPanning || draggingNode ? "none" : "transform 0.1s",
        }}
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
          const isDragging = draggingNode === node.id;
          return (
            <g
              key={node.id}
              filter="url(#node-shadow)"
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              style={{ cursor: isDragging ? "grabbing" : "grab" }}
            >
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

      {/* Relationship List */}
      {edges.length > 0 && (
        <div className="border-t border-slate-200">
          <div className="p-4 bg-slate-50 border-b">
            <h4 className="text-xs font-bold text-slate-600">Contract Relationships ({edges.length})</h4>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/50">
              <tr className="text-[10px] text-slate-400 uppercase font-black border-b">
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Target</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {relationships.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-bold text-slate-700">{r.source_id}</td>
                  <td className="px-4 py-2 font-bold text-slate-700">{r.target_id}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase" style={{
                      background: EDGE_COLORS[r.type] ? `${EDGE_COLORS[r.type]}20` : "#f1f5f9",
                      color: EDGE_COLORS[r.type] || "#64748b",
                    }}>
                      {EDGE_LABELS[r.type] || r.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{r.confidence ? `${(r.confidence * 100).toFixed(0)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
