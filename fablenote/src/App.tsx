import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "./store";
import Layout from "./components/Layout";
import Disclaimer from "./components/Disclaimer";
import LockScreen from "./components/LockScreen";

export default function App() {
  const { loadNotes, loadSettings, loadFolders, loadColors, isDark, checkSecurity, isLocked, hasPassword } = useStore();

  useEffect(() => {
    checkSecurity().then(() => {
      // Only load data if not locked (no password) or after unlock (handled in unlock action)
      if (!useStore.getState().isLocked) {
        loadSettings();
        loadNotes();
        loadFolders();
        loadColors();
      }
    });
  }, []);

  // Load data once unlocked
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

  if (hasPassword && isLocked) {
    return <LockScreen />;
  }

  return (
    <>
      <Disclaimer />
      <Layout />
    </>
  );
}
