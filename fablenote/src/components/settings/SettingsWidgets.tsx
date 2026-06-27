import React from "react";
import { Eye, EyeOff } from "lucide-react";

export function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-px ${active ? "text-primary border-accent" : "text-muted border-transparent hover:text-primary"}`}>
      {children}
    </button>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted uppercase tracking-wider mb-3">{title}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

export function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm text-secondary mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

export function Input({ id, value, onChange, placeholder, type = "text" }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-hover border border-border rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50 transition-colors" />
  );
}

export function SecInput({ label, value, onChange, show, onToggleShow }: { label: string; value: string; onChange: (v: string) => void; show: boolean; onToggleShow: () => void }) {
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={label}
        className="w-full bg-hover border border-border rounded-lg px-3 py-2 pr-9 text-sm text-primary outline-none focus:border-accent/50 transition-colors" />
      <button type="button" onClick={onToggleShow} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors" tabIndex={-1}>
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );
}
