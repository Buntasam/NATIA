import { defineConfig } from "vitest/config";

// Tests de l'interface (fonctions de src/lib, du store, des traductions) : `npm test`.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
