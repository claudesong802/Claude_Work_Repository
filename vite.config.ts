import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages 는 /<저장소 이름>/ 밑에서 열린다 — 배포 작업이 BASE_PATH 로 넘긴다.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  worker: { format: "es" },
  server: { host: true },
  preview: { host: true, port: 4173, strictPort: true },
  build: { target: "safari16", sourcemap: true, chunkSizeWarningLimit: 1200 },
});
