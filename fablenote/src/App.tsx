import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "./store";
import Layout from "./components/Layout";
import Disclaimer from "./components/Disclaimer";
import LockScreen from "./components/LockScreen";
import CloseOverlay, { waitForCloseConfirm, callSaveNow } from "./components/CloseOverlay";

export default function App() {
  const { loadNotes, loadSettings, loadFolders, loadColors, theme, setTheme, isDark, checkSecurity, isLocked, hasPassword } = useStore();

  useEffect(() => {
    setTheme(theme);
  }, []);

  useEffect(() => {
    checkSecurity().then(() => {
      if (!useStore.getState().isLocked) {
        loadSettings();
        loadNotes();
        loadFolders();
        loadColors();
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!isLocked) {
      loadSettings();
      loadNotes();
      loadFolders();
      loadColors();
    }
  }, [isLocked]);

  useEffect(() => {
    invoke("set_window_theme", { dark: isDark }).catch(() => {});
  }, [isDark]);

  // Close handler always active regardless of lock state
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      win.onCloseRequested(async (event) => {
        event.preventDefault();

        const { setIsConfirmingClose, setIsClosingApp, setCloseOverlayDone, isLocked: locked } = useStore.getState();
        setIsConfirmingClose(true);
        const confirmed = await waitForCloseConfirm();
        setIsConfirmingClose(false);

        if (!confirmed) return;

        setIsClosingApp(true);

        if (!locked) {
          // Flush the TipTap debounce then wait for save to finish
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
      }).then((fn) => { unlisten = fn; });
    });

    return () => { unlisten?.(); };
  }, []);

  return (
    <>
      <CloseOverlay />
      {hasPassword && isLocked ? (
        <LockScreen />
      ) : (
        <>
          <Disclaimer />
          <Layout />
        </>
      )}
    </>
  );
}
