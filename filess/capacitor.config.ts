import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // TODO: replace with your real, permanent package id before your first
  // Play Console upload. You cannot change this later without publishing
  // as a brand-new app listing.
  appId: "com.yourcompany.mafiacity",
  appName: "Mafia City",
  // TODO: verify this against your actual build output folder once you
  // run `npm run build` with SPA mode enabled (see vite.config.ts) — it's
  // commonly "dist" or ".output/public" depending on the nitro preset in
  // use. If `npx cap sync` complains it can't find webDir, this is why.
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;
