import { Capacitor } from "@capacitor/core";
import { loadPremium, savePremium } from "./storage";

// TODO: create this as a one-time (non-consumable) in-app product in Play
// Console -> your app -> Monetize -> Products -> In-app products, and make
// the ID here match exactly.
export const PREMIUM_PRODUCT_ID = "mafia_city_premium_unlock";

// NOTE on the plugin API below: this is written against
// @capgo/capacitor-native-purchases' documented shape at the time of
// writing. Capacitor plugin APIs do shift between majors — when you
// `npm install` it, diff this against its README before relying on it,
// particularly the exact purchaseType enum/string for a one-time product.
type NativePurchaseTransaction = { productIdentifier: string };
type NativePurchasesPlugin = {
  purchaseProduct: (opts: { productIdentifier: string; productType: string }) => Promise<{
    transaction: NativePurchaseTransaction;
  }>;
  restorePurchases: () => Promise<{ transactions: NativePurchaseTransaction[] }>;
};

let _plugin: NativePurchasesPlugin | null = null;

async function getPlugin(): Promise<NativePurchasesPlugin | null> {
  if (!Capacitor.isNativePlatform()) return null;
  if (_plugin) return _plugin;
  try {
    const mod = (await import("@capgo/native-purchases")) as unknown as {
      NativePurchases: NativePurchasesPlugin;
    };
    _plugin = mod.NativePurchases;
    return _plugin;
  } catch {
    // Plugin not installed/available (e.g. still on the web preview).
    return null;
  }
}

/**
 * Source of truth for "is this device unlocked". On native, this asks Play
 * Billing directly (so it's correct even after a reinstall). On web/preview
 * — where there's no Play Billing to ask — it falls back to the local
 * dev-simulated flag so Settings' "simulate premium" toggle keeps working
 * for testing gated UI without a device.
 */
export async function checkPremiumStatus(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) {
    return loadPremium();
  }
  try {
    const { transactions } = await plugin.restorePurchases();
    const owned = transactions.some((t) => t.productIdentifier === PREMIUM_PRODUCT_ID);
    savePremium(owned); // keep local flag in sync as a fast-path cache
    return owned;
  } catch {
    return loadPremium();
  }
}

export async function purchasePremium(): Promise<{ ok: boolean; error?: string }> {
  const plugin = await getPlugin();
  if (!plugin) {
    return {
      ok: false,
      error: "Purchases only work in the installed Android app, not this preview.",
    };
  }
  try {
    await plugin.purchaseProduct({ productIdentifier: PREMIUM_PRODUCT_ID, productType: "inapp" });
    savePremium(true);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Purchase failed or was cancelled.",
    };
  }
}
