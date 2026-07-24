import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // TODO: replace with your real, permanent package id before your first
  // Play Console upload. You cannot change this later without publishing
  // as a brand-new app listing.
  appId: "com.yourcompany.mafiacity",
  appName: "Mafia City",
  // Points at vite.mobile.config.ts's output -- a plain static SPA build
  // that bypasses TanStack Start/nitro entirely (see that file for why).
  webDir: "dist-mobile",
  android: {
    allowMixedContent: false,
  },
};

export default config;
