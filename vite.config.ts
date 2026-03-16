/* global __dirname */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    // Placeholder replaced at container start by docker-entrypoint.sh
    base: "/BASEPATHPLACEHOLDER/",
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      global: {},
    },
  };
});
