import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
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

          if (id.includes("@supabase/supabase-js")) {
            return "supabase";
          }

          if (id.includes("@tanstack/react-query")) {
            return "react-query";
          }

          if (id.includes("xlsx")) {
            return "xlsx";
          }

          if (
            id.includes("html2pdf.js") ||
            id.includes("html2canvas") ||
            id.includes("jspdf") ||
            id.includes("jspdf-autotable")
          ) {
            return "print";
          }

          if (id.includes("recharts")) {
            return "charts";
          }

          if (id.includes("@radix-ui/")) {
            return "radix";
          }
        },
      },
    },
  },
}));