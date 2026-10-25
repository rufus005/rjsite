import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    // Live-debug and emulator dev servers must not invalidate each other's optimized dependencies.
    cacheDir: `node_modules/.vite/${mode}`,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (
                id.includes("@firebase/firestore") ||
                id.includes("/firebase/firestore/")
              )
                return "firebase-firestore";
              if (id.includes("firebase")) return "firebase-core";
              if (id.includes("react")) return "react-vendor";
            }
          },
        },
      },
    },
  };
});
