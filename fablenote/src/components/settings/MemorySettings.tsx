import { useState } from "react";
import { Trash2 as TrashIcon } from "lucide-react";
import { useStore } from "../../store";
import { Section } from "./SettingsWidgets";

export default function MemorySettings() {
  const { memoryEnabled, setMemoryEnabled, memoryGraphEnabled, setMemoryGraphEnabled, memoryNodes, clearMemoryNodes } = useStore();
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <>
      <Section title="Mémoire IA">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-secondary">Mémoire persistante</p>
            <p className="text-[10px] text-muted mt-0.5">Collecte le contexte de tes projets, sujets et habitudes</p>
          </div>
          <button
            role="switch"
            aria-checked={memoryEnabled}
            onClick={() => setMemoryEnabled(!memoryEnabled)}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${memoryEnabled ? "bg-accent" : "bg-border"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${memoryEnabled ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </div>

        {memoryEnabled && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-secondary">Graphe neuronal</p>
                <p className="text-[10px] text-muted mt-0.5">Visualise la mémoire sous forme de réseau de nœuds</p>
              </div>
              <button
                role="switch"
                aria-checked={memoryGraphEnabled}
                onClick={() => setMemoryGraphEnabled(!memoryGraphEnabled)}
                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${memoryGraphEnabled ? "bg-accent" : "bg-border"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${memoryGraphEnabled ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>

            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-hover border border-border">
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-secondary font-medium">Nœuds manuels</p>
                <p className="text-[10px] text-muted">{memoryNodes.length} enregistré{memoryNodes.length !== 1 ? "s" : ""}</p>
              </div>
              {memoryNodes.length > 0 && (
                <button
                  onClick={() => {
                    if (confirmClear) { clearMemoryNodes(); setConfirmClear(false); }
                    else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors shrink-0 ${
                    confirmClear
                      ? "bg-red-400/15 border border-red-400/30 text-red-400"
                      : "bg-hover border border-border text-muted hover:text-red-400 hover:border-red-400/30"
                  }`}
                >
                  <TrashIcon size={10} />
                  {confirmClear ? "Confirmer la suppression" : "Vider"}
                </button>
              )}
            </div>
          </>
        )}
      </Section>
    </>
  );
}
