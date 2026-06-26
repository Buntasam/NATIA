import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useStore } from "../store";
import { Note } from "../types";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  folder: string | null;
  linkCount: number;
  isFolder?: boolean;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  isFolder?: boolean;
  folderName?: string;
}

const PALETTE = ["#d97757", "#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#06b6d4", "#ec4899"];

function extractWikilinks(content: string): string[] {
  const plain = content.replace(/<[^>]+>/g, " ");
  const regex = /\[\[([^\]]+)\]\]/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(plain)) !== null) found.add(m[1].trim());
  return [...found];
}

function buildFolderColors(notes: { folder: string | null }[]): Map<string, string> {
  const m = new Map<string, string>();
  let i = 0;
  for (const n of notes) {
    if (n.folder && !m.has(n.folder)) m.set(n.folder, PALETTE[i++ % PALETTE.length]);
  }
  return m;
}

export default function GraphPanel({ onClose }: { onClose: () => void }) {
  const { notes, selectNote } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const tipRef = useRef<d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown> | null>(null);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkCount, setLinkCount] = useState(0);

  const folderColorMap = buildFolderColors(notes);

  useEffect(() => {
    if (!svgRef.current || notes.length === 0) return;

    let cancelled = false;
    simRef.current?.stop();
    if (tipRef.current) { tipRef.current.remove(); tipRef.current = null; }
    mouseRef.current = null;

    const run = async () => {
      const fullNotes = (
        await Promise.all(notes.map((n) => invoke<Note>("get_note", { id: n.id }).catch(() => null)))
      ).filter(Boolean) as Note[];

      if (cancelled || !svgRef.current) return;

      const titleToId = new Map<string, string>();
      for (const n of notes) titleToId.set(n.title.toLowerCase(), n.id);

      // Build wikilink edges
      const wikiLinks: GraphLink[] = [];
      const countMap = new Map<string, number>();
      for (const note of fullNotes) {
        for (const wl of extractWikilinks(note.content)) {
          const targetId = titleToId.get(wl.toLowerCase());
          if (targetId && targetId !== note.id) {
            wikiLinks.push({ source: note.id, target: targetId });
            countMap.set(note.id, (countMap.get(note.id) ?? 0) + 1);
            countMap.set(targetId, (countMap.get(targetId) ?? 0) + 1);
          }
        }
      }

      // Build note nodes
      const noteNodes: GraphNode[] = notes.map((n) => ({
        id: n.id,
        title: n.title,
        folder: n.folder,
        linkCount: countMap.get(n.id) ?? 0,
      }));

      // Build folder nodes (one per unique folder)
      const folderNames = [...folderColorMap.keys()];
      const folderNodes: GraphNode[] = folderNames.map((f) => ({
        id: `folder:${f}`,
        title: f,
        folder: null,
        linkCount: 0,
        isFolder: true,
      }));

      // Build folder → note edges (dashed)
      const folderLinks: GraphLink[] = notes
        .filter((n) => n.folder)
        .map((n) => ({
          source: `folder:${n.folder}`,
          target: n.id,
          isFolder: true,
          folderName: n.folder as string,
        }));

      const allNodes = [...folderNodes, ...noteNodes];
      const allLinks: GraphLink[] = [...folderLinks, ...wikiLinks];

      if (cancelled || !svgRef.current) return;

      setLinkCount(wikiLinks.length);
      setLoading(false);

      const el = svgRef.current;
      const width = el.clientWidth || 720;
      const height = el.clientHeight || 460;

      d3.select(el).selectAll("*").remove();
      const svg = d3.select(el).attr("width", width).attr("height", height);
      const g = svg.append("g");

      // Zoom & pan — note labels hidden when zoomed out
      let noteLabels: d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown>;
      const LABEL_THRESHOLD = 0.55;
      const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 6])
        .on("zoom", (ev) => {
          g.attr("transform", ev.transform);
          if (noteLabels) noteLabels.style("display", ev.transform.k < LABEL_THRESHOLD ? "none" : "");
        });
      svg.call(zoomBehavior);

      // Glow filter
      const defs = svg.append("defs");
      const filter = defs.append("filter").attr("id", "node-glow");
      filter.append("feGaussianBlur").attr("stdDeviation", "3.5").attr("result", "coloredBlur");
      const feMerge = filter.append("feMerge");
      feMerge.append("feMergeNode").attr("in", "coloredBlur");
      feMerge.append("feMergeNode").attr("in", "SourceGraphic");

      const noteRadius = (d: GraphNode) => Math.max(6, 6 + d.linkCount * 2.5);
      const noteColor = (d: GraphNode) => d.folder ? (folderColorMap.get(d.folder) ?? PALETTE[0]) : "#9a9088";
      const folderColor = (d: GraphNode) => folderColorMap.get(d.title) ?? PALETTE[0];

      // Mouse repulsion custom force
      const mouseForce = (alpha: number) => {
        if (!mouseRef.current) return;
        const { x: mx, y: my } = mouseRef.current;
        const RADIUS = 110;
        const STRENGTH = 3.0;
        for (const node of allNodes) {
          const dx = (node.x ?? 0) - mx;
          const dy = (node.y ?? 0) - my;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < RADIUS && d > 0.5) {
            const f = STRENGTH * alpha * (1 - d / RADIUS);
            node.vx = (node.vx ?? 0) + (dx / d) * f;
            node.vy = (node.vy ?? 0) + (dy / d) * f;
          }
        }
      };

      // Simulation
      const sim = d3.forceSimulation<GraphNode>(allNodes)
        .force("link", d3.forceLink<GraphNode, GraphLink>(allLinks)
          .id((d) => d.id)
          .distance((l) => (l as GraphLink).isFolder ? 45 : 70)
          .strength((l) => (l as GraphLink).isFolder ? 0.9 : 0.6)
        )
        .force("charge", d3.forceManyBody<GraphNode>().strength((d) => d.isFolder ? -180 : -100))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(0.8))
        .force("x", d3.forceX(width / 2).strength(0.06))
        .force("y", d3.forceY(height / 2).strength(0.06))
        .force("collision", d3.forceCollide<GraphNode>((d) => d.isFolder ? 22 : noteRadius(d) + 6))
        .force("mouseRepulsion", mouseForce)
        .velocityDecay(0.4)
        .alphaDecay(0.02);

      simRef.current = sim;

      // ── Folder links (dashed) ──────────────────────────────────────────────
      const folderLinkSel = g.append("g")
        .selectAll<SVGLineElement, GraphLink>("line")
        .data(allLinks.filter((l) => l.isFolder))
        .join("line")
        .attr("stroke", (l) => folderColorMap.get(l.folderName ?? "") ?? "var(--color-border)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "5,3")
        .attr("opacity", 0.35);

      // ── Wiki links (solid) ─────────────────────────────────────────────────
      const wikiLinkSel = g.append("g")
        .selectAll<SVGLineElement, GraphLink>("line")
        .data(allLinks.filter((l) => !l.isFolder))
        .join("line")
        .attr("stroke", "var(--color-border)")
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.55);

      // ── Drag (shared) ──────────────────────────────────────────────────────
      const drag = d3.drag<SVGGElement, GraphNode>()
        .on("start", (ev, d) => {
          if (!ev.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => {
          if (!ev.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
        });

      // ── Folder nodes ───────────────────────────────────────────────────────
      const folderSel = g.append("g")
        .selectAll<SVGGElement, GraphNode>("g")
        .data(allNodes.filter((n) => n.isFolder))
        .join("g")
        .style("cursor", "default")
        .call(drag);

      folderSel.append("circle")
        .attr("r", 16)
        .attr("fill", (d) => `${folderColor(d)}22`)
        .attr("stroke", folderColor)
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,3");

      folderSel.append("text")
        .attr("x", 21)
        .attr("dy", "0.31em")
        .attr("font-size", 11)
        .attr("font-weight", "700")
        .attr("fill", folderColor)
        .attr("pointer-events", "none")
        .text((d) => d.title.length > 18 ? d.title.slice(0, 18) + "…" : d.title);

      // ── Note nodes ─────────────────────────────────────────────────────────
      const noteSel = g.append("g")
        .selectAll<SVGGElement, GraphNode>("g")
        .data(allNodes.filter((n) => !n.isFolder))
        .join("g")
        .style("cursor", "pointer")
        .call(drag);

      const circles = noteSel.append("circle")
        .attr("r", noteRadius)
        .attr("fill", noteColor)
        .attr("stroke", "var(--color-base)")
        .attr("stroke-width", 2);

      noteLabels = noteSel.append("text")
        .attr("dy", "0.31em")
        .attr("x", (d) => noteRadius(d) + 5)
        .attr("font-size", 11)
        .attr("fill", "var(--color-primary)")
        .attr("pointer-events", "none")
        .text((d) => d.title.length > 26 ? d.title.slice(0, 26) + "…" : d.title);

      // ── Tooltip ────────────────────────────────────────────────────────────
      const tip = d3.select("body").append("div")
        .style("position", "fixed")
        .style("pointer-events", "none")
        .style("background", "var(--color-panel)")
        .style("border", "1px solid var(--color-border)")
        .style("border-radius", "8px")
        .style("padding", "6px 10px")
        .style("font-size", "11px")
        .style("color", "var(--color-primary)")
        .style("box-shadow", "0 4px 16px rgba(0,0,0,0.25)")
        .style("opacity", "0")
        .style("z-index", "99999")
        .style("transition", "opacity 0.1s")
        .style("max-width", "220px");

      tipRef.current = tip;

      noteSel
        .on("click", (_, d) => {
          tip.style("opacity", "0");
          selectNote(d.id);
          onClose();
        })
        .on("mouseover", (ev, d) => {
          circles.filter((n) => n.id === d.id)
            .attr("filter", "url(#node-glow)")
            .attr("stroke-width", 3);
          const folder = d.folder ?? "Sans dossier";
          const linksLabel = d.linkCount > 0 ? `${d.linkCount} lien(s)` : "Aucun lien";
          tip
            .html(`<strong>${d.title}</strong><br><span style="opacity:0.6">${folder} · ${linksLabel}</span>`)
            .style("opacity", "1")
            .style("left", `${ev.clientX + 14}px`)
            .style("top", `${ev.clientY - 10}px`);
        })
        .on("mousemove", (ev) => {
          tip.style("left", `${ev.clientX + 14}px`).style("top", `${ev.clientY - 10}px`);
        })
        .on("mouseout", (_, d) => {
          circles.filter((n) => n.id === d.id)
            .attr("filter", null)
            .attr("stroke-width", 2);
          tip.style("opacity", "0");
        });

      // ── Mouse repulsion on SVG ──────────────────────────────────────────────
      svg.on("mousemove.repulsion", (event: MouseEvent) => {
        const transform = d3.zoomTransform(el);
        const [px, py] = d3.pointer(event, el);
        const inverted = transform.invert([px, py]);
        mouseRef.current = { x: inverted[0], y: inverted[1] };
        if (sim.alpha() < 0.15) {
          sim.alpha(0.15).restart();
        }
      });

      svg.on("mouseleave.repulsion", () => {
        mouseRef.current = null;
      });

      // ── Tick ──────────────────────────────────────────────────────────────
      sim.on("tick", () => {
        folderLinkSel
          .attr("x1", (d) => ((d.source as GraphNode).x) ?? 0)
          .attr("y1", (d) => ((d.source as GraphNode).y) ?? 0)
          .attr("x2", (d) => ((d.target as GraphNode).x) ?? 0)
          .attr("y2", (d) => ((d.target as GraphNode).y) ?? 0);

        wikiLinkSel
          .attr("x1", (d) => ((d.source as GraphNode).x) ?? 0)
          .attr("y1", (d) => ((d.source as GraphNode).y) ?? 0)
          .attr("x2", (d) => ((d.target as GraphNode).x) ?? 0)
          .attr("y2", (d) => ((d.target as GraphNode).y) ?? 0);

        folderSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
        noteSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });
    };

    run();

    return () => {
      cancelled = true;
      simRef.current?.stop();
      if (tipRef.current) { tipRef.current.remove(); tipRef.current = null; }
      if (svgRef.current) {
        d3.select(svgRef.current)
          .on("mousemove.repulsion", null)
          .on("mouseleave.repulsion", null);
      }
    };
  }, [notes]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[800px] h-[600px] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-primary text-sm">Vue graphe</span>
            {loading ? (
              <span className="text-xs text-muted">Chargement…</span>
            ) : (
              <span className="text-xs text-muted">{notes.length} notes · {linkCount} lien(s)</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">Scroll = zoom · Survol = repousser · Clic = ouvrir</span>
            <button onClick={onClose} className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Folder legend */}
        {folderColorMap.size > 0 && (
          <div className="flex items-center gap-3 px-5 py-2 border-b border-border shrink-0 flex-wrap">
            <span className="text-[10px] text-muted uppercase tracking-wider shrink-0">Légende :</span>
            <div className="flex items-center gap-1 shrink-0">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#9a9088" }} />
              <span className="text-[10px] text-muted">Sans dossier</span>
            </div>
            {[...folderColorMap].map(([folder, color]) => (
              <div key={folder} className="flex items-center gap-1 shrink-0">
                <div className="w-2.5 h-2.5 rounded-full border border-dashed shrink-0" style={{ borderColor: color, backgroundColor: `${color}22` }} />
                <span className="text-[10px] text-muted">{folder}</span>
              </div>
            ))}
          </div>
        )}

        {/* SVG area */}
        <div className="flex-1 overflow-hidden">
          <svg ref={svgRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
