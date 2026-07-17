import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages へデプロイする想定。リポジトリ名に応じて base を調整する。
// API は Vercel 側（/api/*）。開発時は VITE_API_BASE で切り替える。
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
  },
});
