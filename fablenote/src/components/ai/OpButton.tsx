import React from "react";
import { Loader2 } from "lucide-react";

interface Props {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  loading: boolean;
  active: boolean;
  badge?: string;
}

export function OpButton({ icon, label, description, onClick, loading, active, badge }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors w-full ${
        active
          ? "bg-accent/10 border border-accent/30"
          : "bg-hover hover:bg-active border border-transparent"
      }`}
    >
      <span className={active ? "text-accent" : "text-secondary"}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-medium text-primary leading-none">{label}</p>
          {badge && (
            <span className="px-1 py-0.5 rounded text-[9px] font-semibold leading-none bg-amber-400/20 text-amber-600 border border-amber-400/30">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-muted truncate">{description}</p>
      </div>
      {loading && <Loader2 size={13} className="text-accent animate-spin shrink-0" />}
    </button>
  );
}
