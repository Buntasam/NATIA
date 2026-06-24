import React, { useMemo, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BarChart2, FileText, Folder, GitBranch, Hash, Trash2 } from "lucide-react";
import { useStore } from "../store";

interface RustStats { trash_count: number; version_count: number; }

const MONTHS_FR = ["jan", "fév", "mar", "avr", "mai", "jun", "jul", "aoû", "sep", "oct", "nov", "déc"];

function relativeDate(iso: string): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} j`;
  if (days < 30) return `Il y a ${Math.floor(days / 7)} sem.`;
  return `Il y a ${Math.floor(days / 30)} mois`;
}

export default function StatsPanel() {
  const { notes, folders } = useStore();
  const [rust, setRust] = useState<RustStats>({ trash_count: 0, version_count: 0 });

  useEffect(() => {
    invoke<RustStats>("get_global_stats").then(setRust).catch(() => {});
  }, []);

  const s = useMemo(() => {
    const allTags = notes.flatMap(n => n.tags);
    const uniqueTags = new Set(allTags).size;
    const lastActivity = notes.reduce((acc, n) => n.updated_at > acc ? n.updated_at : acc, "");

    // Activity last 30 days
    const today = new Date();
    const activity30: { label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const count = notes.filter(n => n.created_at.slice(0, 10) === key).length;
      activity30.push({ label: `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`, count });
    }
    const createdThisMonth = activity30.reduce((s, d) => s + d.count, 0);

    // Monthly (last 12 months)
    const monthly: { label: string; key: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly.push({ label: MONTHS_FR[d.getMonth()], key, count: notes.filter(n => n.created_at.slice(0, 7) === key).length });
    }

    // By folder (top 6)
    const folderMap: Record<string, number> = {};
    for (const note of notes) {
      const k = note.folder ?? "Sans dossier";
      folderMap[k] = (folderMap[k] ?? 0) + 1;
    }
    const topFolders = Object.entries(folderMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // Tag frequency (top 22)
    const tagFreq: Record<string, number> = {};
    for (const tag of allTags) tagFreq[tag] = (tagFreq[tag] ?? 0) + 1;
    const topTags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 22);

    return { uniqueTags, lastActivity, activity30, createdThisMonth, monthly, topFolders, topTags };
  }, [notes]);

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <BarChart2 size={32} className="text-muted/40" />
        <p className="text-sm text-muted">Aucune note pour le moment</p>
        <p className="text-[11px] text-muted/60">Les statistiques apparaîtront ici une fois vos premières notes créées.</p>
      </div>
    );
  }

  const maxActivity = Math.max(...s.activity30.map(d => d.count), 1);
  const maxFolder   = Math.max(...s.topFolders.map(f => f[1]), 1);
  const maxMonthly  = Math.max(...s.monthly.map(m => m.count), 1);
  const maxTag      = s.topTags[0]?.[1] ?? 1;

  // SVG bar chart (30 days) — 300×60 units
  const BW = 300; const BH = 60;
  const bw = BW / 30 - 1;

  // SVG line chart (12 months) — 300×60 units
  const LW = 300; const LH = 60;
  const pts = s.monthly.map((m, i) => {
    const x = s.monthly.length > 1 ? (i / (s.monthly.length - 1)) * LW : LW / 2;
    const y = LH - (m.count / maxMonthly) * LH * 0.82 - 6;
    return [x, y] as [number, number];
  });
  const lineStr = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const areaStr = `0,${LH} ${lineStr} ${LW},${LH}`;

  return (
    <div className="flex flex-col gap-5">

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard icon={<FileText size={13} className="text-accent" />}       value={notes.length}         label="Notes actives" />
        <StatCard icon={<Folder size={13} className="text-blue-400" />}       value={folders.length}       label="Dossiers" />
        <StatCard icon={<Hash size={13} className="text-purple-400" />}       value={s.uniqueTags}         label="Tags uniques" />
        <StatCard icon={<GitBranch size={13} className="text-green-400" />}   value={rust.version_count}   label="Versions" />
      </div>

      {/* ── Dernière activité ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-hover border border-border">
        <span className="text-[11px] text-muted">Dernière modification</span>
        <span className="text-[11px] text-secondary font-medium">{relativeDate(s.lastActivity)}</span>
      </div>

      {/* ── Bar chart — activité 30 jours ─────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted uppercase tracking-wider">Activité — 30 derniers jours</p>
          <p className="text-[10px] text-muted">{s.createdThisMonth} créée{s.createdThisMonth !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-lg border border-border bg-hover px-3 pt-3 pb-2">
          <svg viewBox={`0 0 ${BW} ${BH}`} className="w-full" preserveAspectRatio="none">
            {s.activity30.map((d, i) => {
              const h = Math.max((d.count / maxActivity) * BH * 0.92, d.count > 0 ? 2 : 0);
              return (
                <rect key={i} x={i * (BW / 30) + 0.5} y={BH - h} width={bw} height={h} rx={1.5}
                  className="fill-accent/50 hover:fill-accent transition-colors cursor-default">
                  <title>{d.label} : {d.count} note{d.count !== 1 ? "s" : ""}</title>
                </rect>
              );
            })}
          </svg>
          <div className="flex justify-between mt-0.5">
            <span className="text-[9px] text-muted">il y a 30 j</span>
            <span className="text-[9px] text-muted">aujourd'hui</span>
          </div>
        </div>
      </div>

      {/* ── Line chart — création mensuelle ───────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] text-muted uppercase tracking-wider">Création mensuelle — 12 mois</p>
        <div className="rounded-lg border border-border bg-hover px-3 pt-3 pb-2">
          <svg viewBox={`0 0 ${LW} ${LH}`} className="w-full overflow-visible" preserveAspectRatio="none">
            {/* subtle grid */}
            {[0.25, 0.5, 0.75].map(t => (
              <line key={t} x1={0} x2={LW} y1={LH - t * LH * 0.82 - 6} y2={LH - t * LH * 0.82 - 6}
                stroke="currentColor" strokeOpacity={0.07} strokeWidth={1} className="text-primary" />
            ))}
            {/* area */}
            <polygon points={areaStr} className="fill-accent/12" />
            {/* line */}
            <polyline points={lineStr} className="fill-none stroke-accent" strokeWidth={1.5}
              strokeLinejoin="round" strokeLinecap="round" />
            {/* dots */}
            {pts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={2.5} className="fill-accent stroke-panel" strokeWidth={1.5}>
                <title>{s.monthly[i].label} {s.monthly[i].key.slice(0, 4)} : {s.monthly[i].count} note{s.monthly[i].count !== 1 ? "s" : ""}</title>
              </circle>
            ))}
          </svg>
          <div className="flex justify-between mt-0.5">
            {s.monthly.filter((_, i) => i % 3 === 0).map(m => (
              <span key={m.key} className="text-[9px] text-muted">{m.label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Répartition par dossier ────────────────────────────────────────── */}
      {s.topFolders.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-muted uppercase tracking-wider">Répartition par dossier</p>
          <div className="flex flex-col gap-1.5">
            {s.topFolders.map(([name, count]) => (
              <div key={name} className="flex items-center gap-2">
                <span className="text-[11px] text-secondary truncate" style={{ width: 120, flexShrink: 0 }}>{name}</span>
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 5, backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)", }}>
                  <div className="h-full rounded-full bg-accent/50 transition-all" style={{ width: `${(count / maxFolder) * 100}%` }} />
                </div>
                <span className="text-[10px] text-muted shrink-0 w-5 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Corbeille & versions ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-hover border border-border">
          <Trash2 size={13} className="text-red-400/60 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-primary leading-none">{rust.trash_count}</p>
            <p className="text-[10px] text-muted mt-0.5">En corbeille</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-hover border border-border">
          <GitBranch size={13} className="text-green-400/60 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-primary leading-none">{rust.version_count}</p>
            <p className="text-[10px] text-muted mt-0.5">Versions sauvegardées</p>
          </div>
        </div>
      </div>

      {/* ── Nuage de tags ─────────────────────────────────────────────────── */}
      {s.topTags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-muted uppercase tracking-wider">Tags les plus utilisés</p>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {s.topTags.map(([tag, count]) => {
              const r = count / maxTag;
              const sz  = r > 0.65 ? "text-sm px-2.5 py-1" : r > 0.35 ? "text-xs px-2 py-0.5" : "text-[10px] px-1.5 py-0.5";
              const col = r > 0.65
                ? "bg-accent/20 border-accent/40 text-accent"
                : r > 0.35
                ? "bg-accent/10 border-accent/20 text-secondary"
                : "bg-hover border-border text-muted";
              return (
                <span key={tag} title={`${count} note${count !== 1 ? "s" : ""}`}
                  className={`rounded-full border font-medium transition-colors ${sz} ${col}`}>
                  #{tag}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-3 rounded-lg bg-hover border border-border">
      <div className="w-7 h-7 rounded-lg bg-black/20 flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <p className="text-base font-semibold text-primary leading-none">{value}</p>
        <p className="text-[10px] text-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}
