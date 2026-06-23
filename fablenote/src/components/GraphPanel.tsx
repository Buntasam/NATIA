import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { X } from "lucide-react";
import { useStore } from "../store";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  folder: string | null;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface Props {
  onClose: () => void;
}

export default function GraphPanel({ onClose }: Props) {
  const { notes, selectNote } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || notes.length === 0) return;

    const nodes: GraphNode[] = notes.map((n) => ({ id: n.id, title: n.title, folder: n.folder }));
    const links: GraphLink[] = [];

    // Color per folder
    const folderColors = new Map<string, string>();
    const palette = ["#d97757", "#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#06b6d4", "#ec4899"];
    let ci = 0;
    for (const n of notes) {
      if (n.folder && !folderColors.has(n.folder)) {
        folderColors.set(n.folder, palette[ci++ % palette.length]);
      }
    }

    const el = svgRef.current;
    const width = el.clientWidth || 640;
    const height = el.clientHeight || 420;

    d3.select(el).selectAll("*").remove();

    const svg = d3.select(el).attr("width", width).attr("height", height);
    const g = svg.append("g");

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on("zoom", (ev) => g.attr("transform", ev.transform))
    );

    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(90))
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(30));

    const linkSel = g.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "var(--color-border)")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.5);

    const drag = d3.drag<SVGGElement, GraphNode>()
      .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; });

    const nodeSel = g.append("g")
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (_, d) => { selectNote(d.id); onClose(); })
      .call(drag);

    nodeSel.append("circle")
      .attr("r", 9)
      .attr("fill", (d) => d.folder ? (folderColors.get(d.folder) ?? "#d97757") : "#9a9088")
      .attr("stroke", "var(--color-base)")
      .attr("stroke-width", 2);

    nodeSel.append("text")
      .attr("dy", "0.31em")
      .attr("x", 13)
      .attr("font-size", 11)
      .attr("fill", "var(--color-primary)")
      .text((d) => d.title.length > 20 ? d.title.slice(0, 20) + "…" : d.title);

    sim.on("tick", () => {
      linkSel
        .attr("x1", (d) => ((d.source as GraphNode).x) ?? 0)
        .attr("y1", (d) => ((d.source as GraphNode).y) ?? 0)
        .attr("x2", (d) => ((d.target as GraphNode).x) ?? 0)
        .attr("y2", (d) => ((d.target as GraphNode).y) ?? 0);
      nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { sim.stop(); };
  }, [notes]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[700px] h-[520px] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <span className="font-semibold text-primary text-sm">Vue graphe — {notes.length} notes</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">Scroll = zoom · Glisser = déplacer · Clic = ouvrir</span>
            <button onClick={onClose} className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <svg ref={svgRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
