import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Check, ChevronRight, GitBranch, List, Pencil, Plus, Search, Trash2, Brain, X } from "lucide-react";
import { useStore, MemoryNode, MemoryNodeType } from "../store";

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<MemoryNodeType, string> = {
  projet:      "#3b82f6",
  utilisateur: "#d97757",
  contexte:    "#22c55e",
  sujet:       "#a855f7",
};

const TYPE_LABEL: Record<MemoryNodeType, string> = {
  projet:      "Projet",
  utilisateur: "Utilisateur",
  contexte:    "Contexte",
  sujet:       "Sujet",
};

const TYPE_DESC: Record<MemoryNodeType, string> = {
  projet:      "Dossier / projet de travail",
  utilisateur: "Contexte utilisateur, IA active",
  contexte:    "Information contextuelle libre",
  sujet:       "Sujet ou tag transversal",
};

// Zones de clustering par type (fraction de W/H)
const TYPE_ZONE: Record<MemoryNodeType, { x: number; y: number }> = {
  utilisateur: { x: 0.5,  y: 0.22 },
  projet:      { x: 0.28, y: 0.60 },
  sujet:       { x: 0.72, y: 0.60 },
  contexte:    { x: 0.5,  y: 0.82 },
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  content: string;
  type: MemoryNodeType;
  strength: number;
  auto: boolean;
  connections: string[];
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

// ── Build graph data ───────────────────────────────────────────────────────────

function buildNodes(
  manualNodes: MemoryNode[],
  notes: { folder: string | null; tags: string[] }[],
  folders: string[],
  aiProvider: string,
  memoryEnabled: boolean,
): { nodes: SimNode[]; links: SimLink[] } {
  const nodes: SimNode[] = [];
  const links: SimLink[] = [];
  const seen = new Set<string>();
  const add = (n: SimNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };

  if (memoryEnabled) {
    // Auto — one node per top-level folder
    for (const f of folders) {
      const root = f.split("/")[0];
      const folderId = `auto:folder:${root}`;
      if (!seen.has(folderId)) {
        const count = notes.filter(n => n.folder?.startsWith(root)).length;
        add({
          id: folderId, label: root,
          content: `${count} note${count !== 1 ? "s" : ""}`,
          type: "projet", strength: Math.min(1, 0.3 + count * 0.07),
          auto: true, connections: [],
        });
      }
    }

    // Auto — tags in 2+ notes
    const tagCount = new Map<string, number>();
    for (const n of notes) for (const t of n.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    for (const [tag, count] of tagCount) {
      if (count < 2) continue;
      const id = `auto:tag:${tag}`;
      add({ id, label: tag, content: `${count} note${count !== 1 ? "s" : ""}`, type: "sujet", strength: Math.min(1, count * 0.15), auto: true, connections: [] });
      for (const n of nodes.filter(nd => nd.type === "projet" && nd.auto)) {
        const hasTag = notes.some(nt => nt.folder?.startsWith(n.label) && (nt.tags ?? []).includes(tag));
        if (hasTag) links.push({ source: id, target: n.id });
      }
    }

    // Auto — IA provider node
    add({
      id: "auto:ai", label: "IA active", content: aiProvider,
      type: "utilisateur", strength: 0.6, auto: true, connections: [],
    });
  }

  // Manual nodes
  for (const mn of manualNodes) {
    add({ id: mn.id, label: mn.label, content: mn.content, type: mn.type, strength: mn.strength, auto: false, connections: mn.connections });
  }

  // Links from manual connections
  for (const mn of manualNodes) {
    for (const cid of mn.connections) {
      if (seen.has(cid)) links.push({ source: mn.id, target: cid });
    }
  }

  return { nodes, links };
}

// ── Component ──────────────────────────────────────────────────────────────────

type PanelTab = "graph" | "list";

export default function GraphPanel({ onClose }: { onClose: () => void }) {
  const { notes, folders, settings, memoryEnabled, setMemoryEnabled, memoryGraphEnabled, memoryNodes, addMemoryNode, updateMemoryNode, deleteMemoryNode } = useStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const tickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tipRef = useRef<d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown> | null>(null);

  const [tab, setTab] = useState<PanelTab>(memoryGraphEnabled ? "graph" : "list");
  const [selected, setSelected] = useState<SimNode | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newType, setNewType] = useState<MemoryNodeType>("contexte");
  const [newLabel, setNewLabel] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newStrength, setNewStrength] = useState(0.5);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const allData = buildNodes(
    memoryNodes,
    notes.map(n => ({ folder: n.folder, tags: (n as { tags?: string[] }).tags ?? [] })),
    folders,
    settings.ai_provider,
    memoryEnabled,
  );

  // ── D3 Graph ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (tab !== "graph" || !svgRef.current) return;
    simRef.current?.stop();
    if (tickleRef.current) clearInterval(tickleRef.current);
    if (tipRef.current) { tipRef.current.remove(); tipRef.current = null; }

    const el = svgRef.current;
    const W = el.clientWidth || 780;
    const H = el.clientHeight || 480;
    const { nodes, links } = allData;

    d3.select(el).selectAll("*").remove();
    const svg = d3.select(el).attr("width", W).attr("height", H);

    // Defs
    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    filter.append("feGaussianBlur").attr("stdDeviation", "3.5").attr("result", "blur");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    const rg = defs.append("radialGradient").attr("id", "bg-grad").attr("cx", "50%").attr("cy", "50%").attr("r", "70%");
    rg.append("stop").attr("offset", "0%").attr("stop-color", "var(--color-panel)").attr("stop-opacity", "1");
    rg.append("stop").attr("offset", "100%").attr("stop-color", "var(--color-base)").attr("stop-opacity", "1");

    svg.append("rect").attr("width", W).attr("height", H).attr("fill", "url(#bg-grad)");

    // Zone labels (faint background hints)
    const zoneG = svg.append("g").attr("pointer-events", "none");
    (Object.entries(TYPE_ZONE) as [MemoryNodeType, { x: number; y: number }][]).forEach(([type, zone]) => {
      const hasNodes = nodes.some(n => n.type === type);
      if (!hasNodes) return;
      zoneG.append("text")
        .attr("x", zone.x * W).attr("y", zone.y * H - 28)
        .attr("text-anchor", "middle").attr("font-size", "9").attr("font-weight", "700")
        .attr("letter-spacing", "0.1em").attr("text-transform", "uppercase")
        .attr("fill", TYPE_COLOR[type]).attr("opacity", 0.18)
        .text(TYPE_LABEL[type].toUpperCase());
    });

    const g = svg.append("g");

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4])
      .on("zoom", ev => g.attr("transform", ev.transform));
    svg.call(zoom);

    // Tooltip
    const tip = d3.select("body").append("div")
      .style("position", "fixed").style("pointer-events", "none")
      .style("background", "var(--color-panel)").style("border", "1px solid var(--color-border)")
      .style("border-radius", "10px").style("padding", "8px 12px").style("font-size", "11px")
      .style("color", "var(--color-primary)").style("box-shadow", "0 6px 24px rgba(0,0,0,0.35)")
      .style("opacity", "0").style("z-index", "99999").style("max-width", "220px")
      .style("transition", "opacity 0.1s");
    tipRef.current = tip;

    // Simulation with type clustering
    const sim = d3.forceSimulation<SimNode>(nodes)
      .force("link", d3.forceLink<SimNode, SimLink>(links).id(d => d.id).distance(100).strength(0.4))
      .force("charge", d3.forceManyBody<SimNode>().strength(d => -160 - d.strength * 180))
      .force("center", d3.forceCenter(W / 2, H / 2).strength(0.02))
      .force("cluster-x", d3.forceX<SimNode>(d => TYPE_ZONE[d.type].x * W).strength(0.12))
      .force("cluster-y", d3.forceY<SimNode>(d => TYPE_ZONE[d.type].y * H).strength(0.12))
      .force("collide", d3.forceCollide<SimNode>(d => 16 + d.strength * 14))
      .velocityDecay(0.6)
      .alphaDecay(0.01);

    simRef.current = sim;
    tickleRef.current = setInterval(() => { if (sim.alpha() < 0.04) sim.alpha(0.06).restart(); }, 5000);

    // Links
    const linkSel = g.append("g")
      .selectAll<SVGLineElement, SimLink>("line").data(links).join("line")
      .attr("stroke", l => {
        const src = typeof l.source === "object" ? (l.source as SimNode) : nodes.find(n => n.id === l.source);
        return src ? TYPE_COLOR[src.type] : "var(--color-border)";
      })
      .attr("stroke-width", 1.2).attr("opacity", 0.25);

    // Drag
    const drag = d3.drag<SVGGElement, SimNode>()
      .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; });

    // Nodes
    const nodeG = g.append("g")
      .selectAll<SVGGElement, SimNode>("g").data(nodes).join("g")
      .style("cursor", "pointer").call(drag);

    nodeG.append("circle")
      .attr("r", d => 13 + d.strength * 16).attr("fill", d => TYPE_COLOR[d.type]).attr("opacity", 0.07);

    nodeG.append("circle")
      .attr("r", d => 9 + d.strength * 10).attr("fill", d => TYPE_COLOR[d.type]).attr("opacity", 0.13)
      .attr("filter", "url(#glow)");

    const cores = nodeG.append("circle")
      .attr("r", d => 6 + d.strength * 7).attr("fill", d => TYPE_COLOR[d.type]).attr("opacity", 0.9)
      .attr("filter", "url(#glow)").attr("stroke", "var(--color-base)").attr("stroke-width", 1.5);

    nodeG.filter(d => !d.auto).append("circle")
      .attr("r", d => 8 + d.strength * 9).attr("fill", "none")
      .attr("stroke", d => TYPE_COLOR[d.type]).attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3").attr("opacity", 0.45);

    nodeG.append("text")
      .attr("text-anchor", "middle").attr("y", d => 10 + d.strength * 9).attr("dy", "1.2em")
      .attr("font-size", d => 8 + d.strength * 2).attr("font-weight", "600")
      .attr("fill", "var(--color-primary)").attr("pointer-events", "none").attr("opacity", 0.8)
      .text(d => d.label.length > 14 ? d.label.slice(0, 14) + "…" : d.label);

    nodeG
      .on("click", (ev, d) => { ev.stopPropagation(); setSelected(sel => sel?.id === d.id ? null : d); tip.style("opacity", "0"); })
      .on("mouseover", (ev, d) => {
        cores.filter(n => n.id === d.id).attr("opacity", "1").attr("r", n => (6 + n.strength * 7) * 1.2);
        tip.html(`<span style="color:${TYPE_COLOR[d.type]};font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">${TYPE_LABEL[d.type]}</span><br><strong>${d.label}</strong>${d.content ? `<br><span style="opacity:0.65;font-size:10px">${d.content}</span>` : ""}${d.auto ? '<br><span style="opacity:0.45;font-size:9px">auto-généré</span>' : ""}`)
          .style("opacity", "1").style("left", `${(ev as MouseEvent).clientX + 14}px`).style("top", `${(ev as MouseEvent).clientY - 10}px`);
      })
      .on("mousemove", ev => tip.style("left", `${(ev as MouseEvent).clientX + 14}px`).style("top", `${(ev as MouseEvent).clientY - 10}px`))
      .on("mouseout", (_, d) => {
        cores.filter(n => n.id === d.id).attr("opacity", "0.9").attr("r", n => 6 + n.strength * 7);
        tip.style("opacity", "0");
      });

    svg.on("click.deselect", () => setSelected(null));

    sim.on("tick", () => {
      linkSel
        .attr("x1", d => ((d.source as SimNode).x) ?? 0).attr("y1", d => ((d.source as SimNode).y) ?? 0)
        .attr("x2", d => ((d.target as SimNode).x) ?? 0).attr("y2", d => ((d.target as SimNode).y) ?? 0);
      nodeG.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      sim.stop();
      if (tickleRef.current) clearInterval(tickleRef.current);
      if (tipRef.current) { tipRef.current.remove(); tipRef.current = null; }
    };
  }, [tab, memoryNodes, notes, folders, settings.ai_provider, memoryEnabled]);

  // ── Add / edit node handlers ─────────────────────────────────────────────────

  const resetForm = () => { setNewType("contexte"); setNewLabel(""); setNewContent(""); setNewStrength(0.5); };

  const openCreateForm = () => {
    setEditingId(null); resetForm(); setAddOpen(true); setSelected(null);
  };

  const openEditForm = (node: { id: string; type: MemoryNodeType; label: string; content: string; strength: number }) => {
    setEditingId(node.id);
    setNewType(node.type); setNewLabel(node.label); setNewContent(node.content); setNewStrength(node.strength);
    setAddOpen(true); setSelected(null);
  };

  const closeForm = () => { setAddOpen(false); setEditingId(null); resetForm(); };

  const handleSubmit = () => {
    if (!newLabel.trim()) return;
    if (editingId) {
      updateMemoryNode(editingId, { type: newType, label: newLabel.trim(), content: newContent.trim(), strength: newStrength });
    } else {
      addMemoryNode({ type: newType, label: newLabel.trim(), content: newContent.trim(), strength: newStrength, connections: [], auto: false });
    }
    closeForm();
  };

  // ── Grouped list data (recherche + tri par importance) ──────────────────────

  const grouped = (Object.keys(TYPE_LABEL) as MemoryNodeType[]).map(type => ({
    type,
    nodes: allData.nodes.filter(n => n.type === type),
  })).filter(g => g.nodes.length > 0);

  const q = query.trim().toLowerCase();
  const filteredGrouped = grouped.map(({ type, nodes }) => ({
    type,
    nodes: [...nodes]
      .filter(n => !q || n.label.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
      .sort((a, b) => b.strength - a.strength),
  })).filter(g => g.nodes.length > 0);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-panel border border-border rounded-xl shadow-2xl w-[860px] h-[600px] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Brain size={15} className="text-accent" />
            <span className="font-semibold text-primary text-sm">Mémoire IA</span>
            {memoryEnabled && (
              <>
                <span className="text-[11px] text-muted">{allData.nodes.length} nœud{allData.nodes.length !== 1 ? "s" : ""}</span>

                {/* Tabs */}
                <div className="flex items-center gap-0.5 ml-2 bg-hover rounded-lg p-0.5">
                  {memoryGraphEnabled && (
                    <button
                      onClick={() => setTab("graph")}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${tab === "graph" ? "bg-panel text-primary shadow-sm" : "text-muted hover:text-secondary"}`}
                    >
                      <GitBranch size={11} />
                      Graphe
                    </button>
                  )}
                  <button
                    onClick={() => setTab("list")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${tab === "list" ? "bg-panel text-primary shadow-sm" : "text-muted hover:text-secondary"}`}
                  >
                    <List size={11} />
                    Nœuds
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Legend (graph tab only) */}
            {memoryEnabled && tab === "graph" && (
              <div className="flex items-center gap-3 mr-2">
                {(Object.entries(TYPE_COLOR) as [MemoryNodeType, string][]).map(([t, c]) => (
                  <div key={t} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c }} />
                    <span className="text-[9px] text-muted">{TYPE_LABEL[t]}</span>
                  </div>
                ))}
              </div>
            )}
            {memoryEnabled && (
              <button
                onClick={() => { if (addOpen && !editingId) closeForm(); else openCreateForm(); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/10 border border-accent/25 text-xs text-accent hover:bg-accent/20 transition-colors"
              >
                <Plus size={12} />
                Ajouter
              </button>
            )}
            <button onClick={onClose} aria-label="Fermer" className="p-1 rounded text-muted hover:text-primary hover:bg-hover transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden relative">

          {/* ── Écran d'activation ── */}
          {!memoryEnabled && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-10">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
                <Brain size={26} className="text-accent" />
              </div>
              <div className="max-w-sm">
                <p className="text-sm font-semibold text-primary">Mémoire IA désactivée</p>
                <p className="text-xs text-muted mt-1.5 leading-relaxed">
                  Ajoute des informations que tu juges importantes — un projet en cours, tes préférences, du contexte récurrent — et NATIA les rappellera automatiquement à l'IA pendant vos conversations.
                </p>
              </div>
              <button
                onClick={() => setMemoryEnabled(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
              >
                <Brain size={13} />
                Activer la mémoire IA
              </button>
            </div>
          )}

          {/* ── GRAPH TAB ── */}
          {memoryEnabled && tab === "graph" && memoryGraphEnabled && (
            <>
              <svg ref={svgRef} className="w-full h-full" />

              {/* Add / edit node panel */}
              {addOpen && <NodeForm
                variant="floating" mode={editingId ? "edit" : "create"}
                type={newType} label={newLabel} content={newContent} strength={newStrength}
                onType={setNewType} onLabel={setNewLabel} onContent={setNewContent} onStrength={setNewStrength}
                onSubmit={handleSubmit} onClose={closeForm}
              />}

              {/* Selected node detail */}
              {selected && (
                <div className="absolute bottom-3 left-3 bg-panel border rounded-xl shadow-xl p-4 w-60 z-20"
                  style={{ borderColor: TYPE_COLOR[selected.type] + "55" }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: TYPE_COLOR[selected.type] }}>
                        {TYPE_LABEL[selected.type]}{selected.auto && <span className="ml-1 opacity-50">· auto</span>}
                      </span>
                      <p className="text-sm font-semibold text-primary mt-0.5">{selected.label}</p>
                    </div>
                    {!selected.auto && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEditForm(selected)}
                          className="p-1 rounded text-muted hover:text-accent transition-colors">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => { deleteMemoryNode(selected.id); setSelected(null); }}
                          className="p-1 rounded text-muted hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  {selected.content && <p className="text-xs text-muted leading-relaxed">{selected.content}</p>}
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${selected.strength * 100}%`, backgroundColor: TYPE_COLOR[selected.type] }} />
                    </div>
                    <span className="text-[9px] text-muted">{Math.round(selected.strength * 10)}/10</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── LIST TAB ── */}
          {memoryEnabled && tab === "list" && (
            <div className="flex h-full">
              {/* Node list */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {grouped.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                    <Brain size={28} className="text-muted/40" />
                    <div>
                      <p className="text-sm text-muted font-medium">Aucun nœud en mémoire</p>
                      <p className="text-xs text-muted/60 mt-1">Ajoute un nœud manuellement, ou active le graphe dans les Paramètres pour dériver des nœuds de tes dossiers et tags</p>
                    </div>
                    <button onClick={openCreateForm} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/25 text-xs text-accent hover:bg-accent/20 transition-colors">
                      <Plus size={11} />Ajouter un nœud
                    </button>
                  </div>
                )}

                {grouped.length > 0 && (
                  <div className="flex items-center gap-2 bg-hover rounded-lg px-2.5 py-1.5 shrink-0">
                    <Search size={12} className="text-muted shrink-0" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Chercher un nœud…"
                      aria-label="Chercher un nœud de mémoire"
                      className="flex-1 bg-transparent text-xs text-primary placeholder-muted outline-none"
                    />
                    {query && (
                      <button onClick={() => setQuery("")} aria-label="Effacer" className="text-muted hover:text-primary transition-colors shrink-0">
                        <X size={11} />
                      </button>
                    )}
                  </div>
                )}

                {grouped.length > 0 && filteredGrouped.length === 0 && (
                  <p className="text-xs text-muted text-center py-6">Aucun nœud ne correspond à « {query} »</p>
                )}

                {filteredGrouped.map(({ type, nodes }) => (
                  <div key={type}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLOR[type] }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: TYPE_COLOR[type] }}>
                        {TYPE_LABEL[type]}
                      </span>
                      <span className="text-[10px] text-muted">— {TYPE_DESC[type]}</span>
                      <span className="ml-auto text-[10px] text-muted">{nodes.length}</span>
                    </div>
                    <div className="flex flex-col gap-1.5 pl-4 border-l-2" style={{ borderColor: TYPE_COLOR[type] + "30" }}>
                      {nodes.map(node => (
                        <div key={node.id}
                          className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-hover border border-transparent hover:border-border/60 transition-colors group">
                          {/* Importance dot */}
                          <div className="mt-1 shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLOR[node.type], opacity: 0.3 + node.strength * 0.7 }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-primary truncate">{node.label}</span>
                              {node.auto && (
                                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-border/50 text-muted font-medium">auto</span>
                              )}
                            </div>
                            {node.content && (
                              <p className="text-xs text-muted mt-0.5 truncate">{node.content}</p>
                            )}
                          </div>
                          {/* Actions — manual only */}
                          {!node.auto && (
                            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              {confirmDelete === node.id ? (
                                <>
                                  <button onClick={() => { deleteMemoryNode(node.id); setConfirmDelete(null); }}
                                    className="text-[10px] px-2 py-1 rounded bg-red-400/15 text-red-400 border border-red-400/25 hover:bg-red-400/25 transition-colors">
                                    Confirmer
                                  </button>
                                  <button onClick={() => setConfirmDelete(null)}
                                    className="text-[10px] px-1.5 py-1 rounded text-muted hover:text-primary transition-colors">
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => openEditForm(node)}
                                    className="p-1 rounded text-muted hover:text-accent transition-colors">
                                    <Pencil size={12} />
                                  </button>
                                  <button onClick={() => setConfirmDelete(node.id)}
                                    className="p-1 rounded text-muted hover:text-red-400 transition-colors">
                                    <Trash2 size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add / edit node form (right panel) */}
              {addOpen && (
                <NodeForm
                  variant="panel" mode={editingId ? "edit" : "create"}
                  type={newType} label={newLabel} content={newContent} strength={newStrength}
                  onType={setNewType} onLabel={setNewLabel} onContent={setNewContent} onStrength={setNewStrength}
                  onSubmit={handleSubmit} onClose={closeForm}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {memoryEnabled && (
          <div className="px-5 py-2 border-t border-border shrink-0 flex items-center gap-4">
            {tab === "graph" ? (
              <span className="text-[11px] text-muted">Scroll = zoom · Drag = déplacer · Clic = détails</span>
            ) : (
              <span className="text-[11px] text-muted">
                Les nœuds <span className="text-secondary">auto</span> sont générés depuis tes dossiers, tags et fournisseur IA · les nœuds{" "}
                <span className="text-secondary">manuels</span> les plus importants sont transmis à l'IA
              </span>
            )}
            <span className="text-[11px] text-muted ml-auto">
              {memoryNodes.length} manuel{memoryNodes.length !== 1 ? "s" : ""} ·{" "}
              {allData.nodes.length - memoryNodes.length} auto
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add / edit node form — shared by graph tab (floating) and list tab (panel) ─

function NodeForm({
  variant, mode,
  type, label, content, strength,
  onType, onLabel, onContent, onStrength,
  onSubmit, onClose,
}: {
  variant: "floating" | "panel";
  mode: "create" | "edit";
  type: MemoryNodeType; label: string; content: string; strength: number;
  onType: (t: MemoryNodeType) => void; onLabel: (v: string) => void;
  onContent: (v: string) => void; onStrength: (v: number) => void;
  onSubmit: () => void; onClose: () => void;
}) {
  const wrapperClass = variant === "floating"
    ? "absolute top-3 right-3 bg-panel border border-border rounded-xl shadow-xl p-4 w-64 z-20 flex flex-col gap-3"
    : "w-64 border-l border-border bg-panel flex flex-col p-4 gap-3 shrink-0";

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary">{mode === "edit" ? "Modifier le nœud" : "Nouveau nœud"}</p>
        <button onClick={onClose} aria-label="Fermer" className="p-0.5 rounded text-muted hover:text-primary transition-colors"><X size={13} /></button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-muted uppercase tracking-wide">Type</label>
        <div className="grid grid-cols-2 gap-1">
          {(Object.entries(TYPE_LABEL) as [MemoryNodeType, string][]).map(([t, l]) => (
            <button key={t} onClick={() => onType(t)}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${type === t ? "border-current" : "bg-hover border-border text-muted hover:text-secondary"}`}
              style={type === t ? { backgroundColor: TYPE_COLOR[t] + "18", borderColor: TYPE_COLOR[t] + "55", color: TYPE_COLOR[t] } : {}}>
              {l}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-0.5">{TYPE_DESC[type]}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-muted uppercase tracking-wide">Label</label>
        <input value={label} onChange={e => onLabel(e.target.value)} onKeyDown={e => { if (e.key === "Enter") onSubmit(); }}
          placeholder="Ex : Projet Alpha…"
          className="bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-colors" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-muted uppercase tracking-wide">Description</label>
        <textarea value={content} onChange={e => onContent(e.target.value)}
          placeholder="Informations contextuelles…" rows={3}
          className="bg-hover border border-border rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-colors resize-none" />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-[11px] text-muted uppercase tracking-wide">Importance</label>
          <span className="text-[11px] text-accent font-mono">{Math.round(strength * 10)}/10</span>
        </div>
        <input type="range" min={0.1} max={1} step={0.1} value={strength}
          onChange={e => onStrength(parseFloat(e.target.value))}
          className="w-full accent-accent" />
        <p className="text-[10px] text-muted/70 leading-relaxed">Priorité de rappel à l'IA — les nœuds les plus importants sont transmis en premier</p>
      </div>

      <button onClick={onSubmit} disabled={!label.trim()}
        className="w-full py-2 rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5">
        {mode === "edit" ? <><Check size={11} />Enregistrer</> : <><Plus size={11} />Ajouter le nœud</>}
      </button>
    </div>
  );
}
