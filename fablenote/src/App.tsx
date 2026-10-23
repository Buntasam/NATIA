import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { lockSafely } from "./lib/lockSafely";
import { isCloseToTray } from "./lib/windowPrefs";
import { useStore } from "./store";
import Layout from "./components/Layout";
import SetupGuide, { openSetupGuide } from "./components/SetupGuide";
import UpdatePrompt from "./components/UpdatePrompt";
import TermsGate from "./components/legal/TermsGate";
import { LEGAL_VERSION } from "./components/legal/legalContent";
import LockScreen from "./components/LockScreen";
import CloseOverlay, { waitForCloseConfirm, callSaveNow } from "./components/CloseOverlay";

export default function App() {
  const { loadNotes, loadSettings, loadFolders, loadColors, loadMemoryNodes, theme, setTheme, isDark, checkSecurity, isLocked, hasPassword } = useStore();

  useEffect(() => {
    setTheme(theme);
  }, []);

  // Conditions acceptées ? null = pas encore lu, "old" = une version précédente a été acceptée.
  const [terms, setTerms] = useState<"ok" | "missing" | "old" | null>(null);
  useEffect(() => {
    invoke<{ version: string } | null>("get_terms_acceptance")
      .then((a) => setTerms(!a ? "missing" : a.version === LEGAL_VERSION ? "ok" : "old"))
      .catch(() => setTerms("missing"));
  }, []);

  useEffect(() => {
    checkSecurity().then(() => {
      if (!useStore.getState().isLocked) {
        loadSettings();
        loadNotes();
        loadFolders();
        loadColors();
        loadMemoryNodes();
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!isLocked) {
      loadSettings();
      loadNotes();
      loadFolders();
      loadColors();
      loadMemoryNodes();
    }
  }, [isLocked]);

  useEffect(() => {
    invoke("set_window_theme", { dark: isDark }).catch(() => {});
  }, [isDark]);

  // Session Windows verrouillée ou PC sorti de veille (voir src-tauri/src/system_lock.rs).
  useEffect(() => {
    const unlisten = listen("system-lock", () => { lockSafely(); });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Fermeture : cache la fenêtre (zone de notification) ou quitte après avoir enregistré.
  // Actif que l'app soit verrouillée ou non.
  useEffect(() => {
    let quitting = false;

    const quit = async () => {
      if (quitting) return;
      quitting = true;
      const { setIsConfirmingClose, setIsClosingApp, setCloseOverlayDone, isLocked: locked } = useStore.getState();
      setIsConfirmingClose(true);
      const confirmed = await waitForCloseConfirm();
      setIsConfirmingClose(false);
      if (!confirmed) { quitting = false; return; }

      setIsClosingApp(true);
      if (!locked) {
        // Vide le délai d'enregistrement de TipTap puis attend la fin de l'enregistrement.
        callSaveNow();
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            if (!useStore.getState().isSaving) { resolve(); return; }
            const check = setInterval(() => {
              if (!useStore.getState().isSaving) { clearInterval(check); resolve(); }
            }, 50);
            setTimeout(() => { clearInterval(check); resolve(); }, 5000);
          }, 100);
        });
      }
      setCloseOverlayDone(true);
      await new Promise<void>((r) => setTimeout(r, locked ? 400 : 1200));
      invoke("exit_app");
    };

    const unlisteners: Promise<() => void>[] = [listen("tray-quit", () => { quit(); })];
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      unlisteners.push(getCurrentWindow().onCloseRequested(async (event) => {
        event.preventDefault();
        if (isCloseToTray()) {
          callSaveNow();
          invoke("hide_main_window").catch(() => {});
          return;
        }
        quit();
      }));
    });

    return () => { unlisteners.forEach((u) => u.then((fn) => fn())); };
  }, []);

  return (
    <>
      <CloseOverlay />
      {/* Une fois les conditions acceptées : rien n'est demandé au réseau avant. */}
      {terms === "ok" && <UpdatePrompt />}
      {terms === null ? null : terms !== "ok" ? (
        <TermsGate updated={terms === "old"} onAccepted={() => { setTerms("ok"); if (terms === "missing") openSetupGuide(); }} />
      ) : hasPassword && isLocked ? (
        <LockScreen />
      ) : (
        <>
          <SetupGuide />
          <Layout />
        </>
      )}
    </>
  );
}
