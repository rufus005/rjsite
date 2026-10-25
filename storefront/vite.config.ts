import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  if (
    command === "build" &&
    env.VITE_USE_EMULATORS !== "true" &&
    !/^[A-Za-z0-9_-]{20,}$/.test(env.VITE_APPCHECK_SITE_KEY?.trim() || "")
  )
    throw Error(
      "Production build blocked: set VITE_APPCHECK_SITE_KEY to the registered reCAPTCHA Enterprise site key, not a URL.",
    );
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
