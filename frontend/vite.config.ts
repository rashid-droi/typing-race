import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    define: {
      __TYPING_RACE_DEV_API_TARGET__: JSON.stringify(mode === "development" ? target : ""),
    },
    plugins: [vue()],
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        "/api": { target, changeOrigin: true },
        "/health": { target, changeOrigin: true },
        "/ws": { target, ws: true, changeOrigin: true },
      },
    },
    preview: {
      port: 4173,
      strictPort: false,
      proxy: {
        "/api": { target, changeOrigin: true },
        "/health": { target, changeOrigin: true },
        "/ws": { target, ws: true, changeOrigin: true },
      },
    },
  };
});
