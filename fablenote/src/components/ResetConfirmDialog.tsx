import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle } from "lucide-react";

interface ResetConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ResetConfirmDialog({ isOpen, onClose }: ResetConfirmDialogProps) {
  const [isResetting, setIsResetting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleConfirmReset = async () => {
    setIsResetting(true);
    setProgress(10);

    try {
      setProgress(30);
      await new Promise((r) => setTimeout(r, 500));

      setProgress(60);
      await invoke("reset_app");

      setProgress(100);
      await new Promise((r) => setTimeout(r, 500));

      window.location.reload();
    } catch (e) {
      console.error("Reset error:", e);
      setIsResetting(false);
      setProgress(0);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-xl shadow-2xl w-96 p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={20} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-primary">Réinitialiser l'app ?</h2>
            <p className="text-sm text-muted mt-1">
              Toutes vos notes, paramètres et mot de passe seront supprimés. Cette action est irréversible.
            </p>
          </div>
        </div>

        {isResetting && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs text-muted">
                {progress === 30 ? "Préparation…" : progress === 60 ? "Suppression en cours…" : "Finalisation…"}
              </span>
            </div>
            <div className="w-full h-2 bg-hover rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-accent-hover transition-all duration-300"
                style={{ width: `${Math.min(progress, 95)}%` }}
              />
            </div>
          </div>
        )}

        {!isResetting && (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg bg-hover hover:bg-active border border-border text-primary text-sm font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirmReset}
              className="flex-1 px-4 py-2 rounded-lg bg-red-400/20 hover:bg-red-400/30 border border-red-400/30 text-red-400 text-sm font-medium transition-colors"
            >
              Oui, supprimer
            </button>
          </div>
        )}

        {isResetting && (
          <button
            disabled
            className="w-full px-4 py-2 rounded-lg bg-accent/30 border border-accent/20 text-accent text-sm font-medium opacity-50 cursor-not-allowed"
          >
            Réinitialisation en cours…
          </button>
        )}
      </div>
    </div>
  );
}
