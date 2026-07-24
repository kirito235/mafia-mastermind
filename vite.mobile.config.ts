import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Deliberately separate from the main vite.config.ts. That file goes
// through @lovable.dev/vite-tanstack-config (TanStack Start + nitro,
// targeting a Cloudflare Worker deployment) -- which is the right tool for
// your web deploy on Lovable, but fights against producing a plain static
// bundle for Capacitor to embed. Since MafiaCity has zero routes/server
// functions, this plain Vite SPA build sidesteps that entirely.
//
// Run with: npm run build:mobile  (script added in package.json)
// Output goes to dist-mobile/ -- this is what capacitor.config.ts's
// webDir now points at.
export default defineConfig({
  root: path.resolve(__dirname, "mobile"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, "dist-mobile"),
    emptyOutDir: true,
  },
});
