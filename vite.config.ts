import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => {
  // Load .env files (all keys, not just VITE_*) so API_PORT / VITE_API_TARGET
  // can drive the dev proxy target.
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), "") };

  // Dynamic dev API proxy target:
  //   1) VITE_API_TARGET if set
  //   2) http://localhost:${API_PORT} if API_PORT is set
  //   3) fallback http://localhost:3001
  const apiTarget =
    env.VITE_API_TARGET ||
    (env.API_PORT ? `http://localhost:${env.API_PORT}` : "http://localhost:3001");

  // Visible during `npm run dev` so the resolved target is obvious.
  console.log(`\u001b[36mVite API proxy target:\u001b[0m ${apiTarget}`);

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: { overlay: false },
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@supabase/supabase-js")) return "supabase";
            if (id.includes("@tanstack/react-query")) return "react-query";
            if (id.includes("exceljs")) return "exceljs";
            if (
              id.includes("html2pdf.js") ||
              id.includes("html2canvas") ||
              id.includes("jspdf") ||
              id.includes("jspdf-autotable")
            ) {
              return "print";
            }
            if (id.includes("recharts")) return "charts";
            if (id.includes("@radix-ui/")) return "radix";
          },
        },
      },
    },
  };
});
