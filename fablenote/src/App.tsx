import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "./store";
import Layout from "./components/Layout";
import Disclaimer from "./components/Disclaimer";
import LockScreen from "./components/LockScreen";

export default function App() {
  const { loadNotes, loadSettings, loadFolders, loadColors, theme, setTheme, isDark, checkSecurity, isLocked, hasPassword } = useStore();

  useEffect(() => {
    // Apply persisted theme on startup
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
