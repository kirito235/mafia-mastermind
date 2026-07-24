// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // Phase 3 (Capacitor): the app ships as files on the device with no
    // server to talk to. MafiaCity has zero server functions/loaders, so
    // SPA mode (prerendered static shell + client bundle) is safe to run
    // for every build, not just the mobile one — this is TanStack Start's
    // documented path for exactly this case.
    // VERIFY: this wrapper forwards `server` the same way it should forward
    // `spa`, but confirm the build actually picks this up — if not, check
    // Lovable's vite-tanstack-config docs for how it expects SPA/static
    // output to be enabled, since this file only configures the pass-through.
    spa: { enabled: true },
  },
});
