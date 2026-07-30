import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["app-icon.svg"],
      manifest: {
        name: "英雄体系搭配",
        short_name: "英雄配装",
        description: "完全在浏览器本地运行的英雄与勇士配装、属性计算和冒险模拟工具",
        theme_color: "#4436b5",
        background_color: "#f7f5ef",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        globPatterns: ["**/*.{html,js,css,svg,png,jpg,jpeg,webp,json,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
      },
    }),
  ],
  publicDir: "public",
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true
  },
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          storage: ["dexie"],
          icons: ["lucide-react"],
          capture: ["html-to-image"],
        },
      },
    },
  }
});
