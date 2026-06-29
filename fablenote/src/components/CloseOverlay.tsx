import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, LogOut, X } from "lucide-react";
import { useStore } from "../store";

let _resolveConfirm: ((v: boolean) => void) | null = null;
let _saveNow: (() => void) | null = null;

export function waitForCloseConfirm(): Promise<boolean> {
  return new Promise((resolve) => {
    _resolveConfirm = resolve;
  });
}

export function registerSaveNow(fn: (() => void) | null) { _saveNow = fn; }
export function callSaveNow() { _saveNow?.(); }

function resolveConfirm(v: boolean) {
  _resolveConfirm?.(v);
  _resolveConfirm = null;
}

export default function CloseOverlay() {
  const isConfirmingClose = useStore((s) => s.isConfirmingClose);
  const setIsConfirmingClose = useStore((s) => s.setIsConfirmingClose);
  const isClosingApp = useStore((s) => s.isClosingApp);
  const closeOverlayDone = useStore((s) => s.closeOverlayDone);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isConfirmingClose || isClosingApp) setVisible(true);
  }, [isConfirmingClose, isClosingApp]);

  if (!visible) return null;

  const handleConfirm = () => {
    resolveConfirm(true);
  };

  const handleCancel = () => {
    resolveConfirm(false);
    setIsConfirmingClose(false);
    setVisible(false);
  };

  // Phase sauvegarde (après confirmation)
  if (isClosingApp) {
    return (
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-background/80 backdrop-blur-md">
        <div className="flex flex-col items-center gap-5 bg-panel border border-border rounded-2xl shadow-2xl px-12 py-9">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-muted/70">NATIA</p>
          <div className="flex items-center justify-center w-14 h-14">
            {closeOverlayDone ? (
              <CheckCircle2 size={52} className="text-accent" strokeWidth={1.5} />
            ) : (
              <Loader2 size={52} className="text-accent animate-spin" strokeWidth={1.5} />
            )}
          </div>
          <p className="text-sm text-secondary">
            {closeOverlayDone ? "Sauvegardé !" : "Sauvegarde en cours…"}
          </p>
        </div>
      </div>
    );
  }

  // Phase confirmation
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-background/80 backdrop-blur-md">
      <div className="flex flex-col items-center gap-6 bg-panel border border-border rounded-2xl shadow-2xl px-10 py-8 w-72">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <LogOut size={24} className="text-red-400" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-semibold text-primary">Quitter NATIA ?</p>
          <p className="text-xs text-muted leading-relaxed">Vos notes seront sauvegardées avant la fermeture.</p>
        </div>
        <div className="flex gap-3 w-full">
          <button
            onClick={handleCancel}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border bg-hover hover:bg-active text-sm text-secondary hover:text-primary transition-colors"
          >
            <X size={14} />
            Rester
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm text-white font-medium transition-colors"
          >
            <LogOut size={14} />
            Quitter
          </button>
        </div>
      </div>
    </div>
  );
}
