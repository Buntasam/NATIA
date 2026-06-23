import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "@tauri-apps/api/core",
      "@tauri-apps/api/event",
      "@tauri-apps/api/window",
      "@tauri-apps/plugin-dialog",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extension-underline",
      "@tiptap/extension-highlight",
      "@tiptap/extension-typography",
      "@tiptap/extension-placeholder",
      "@tiptap/extension-task-list",
      "@tiptap/extension-task-item",
      "zustand",
      "lucide-react",
      "diff",
    ],
  },
});
