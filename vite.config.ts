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

          if (
            id.includes("react-dom") ||
            id.includes("react-router-dom") ||
            id.match(/node_modules\/react\//)
          ) {
            return "react-vendor";
          }

          if (id.includes("@tanstack/react-query")) {
            return "query-vendor";
          }

          if (id.includes("@supabase/supabase-js")) {
            return "supabase-vendor";
          }

          if (
            id.includes("@radix-ui/") ||
            id.includes("cmdk") ||
            id.includes("vaul")
          ) {
            return "ui-vendor";
          }

          if (
            id.includes("html2pdf.js") ||
            id.includes("html2canvas") ||
            id.includes("jspdf") ||
            id.includes("jspdf-autotable") ||
            id.includes("qrcode.react") ||
            id.includes("dompurify")
          ) {
            return "print-vendor";
          }

          if (id.includes("xlsx")) {
            return "xlsx-vendor";
          }

          if (id.includes("recharts")) {
            return "charts-vendor";
          }

          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform/resolvers") ||
            id.includes("zod")
          ) {
            return "forms-vendor";
          }

          return "vendor";
        },
      },
    },
  },
}));