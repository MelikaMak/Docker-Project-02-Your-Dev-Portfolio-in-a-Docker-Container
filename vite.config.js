import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all network addresses, not only "localhost".
    // Inside a container, "localhost" means the container itself,
    // so without this your browser could not reach the dev server.
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      // On Windows (and some Macs), file changes in a mounted folder
      // don't reach the container. Polling checks for changes regularly instead.
      // docker compose turns this on with WATCH_POLLING=true.
      usePolling: process.env.WATCH_POLLING === "true",
    },
  },
});
