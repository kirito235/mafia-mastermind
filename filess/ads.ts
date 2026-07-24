import { Capacitor } from "@capacitor/core";

// Google's official test ad unit IDs — safe to ship while developing.
// Google can suspend an AdMob account that serves *real* ads to a
// developer's own device, so keep these until you're ready to submit.
const TEST_BANNER_ID = "ca-app-pub-3940256099942544/6300978111";
const TEST_INTERSTITIAL_ID = "ca-app-pub-3940256099942544/1033173712";

// TODO: once you've created an AdMob account and registered the app,
// replace these with your real ad unit IDs (and update the
// APPLICATION_ID in AndroidManifest.xml / strings.xml — see the
// integration notes).
const BANNER_AD_ID = TEST_BANNER_ID;
const INTERSTITIAL_AD_ID = TEST_INTERSTITIAL_ID;

let initialized = false;

// Every function here is guarded by Capacitor.isNativePlatform() *before*
// the dynamic import, so this module is a complete no-op in the browser —
// the Lovable web preview never even tries to load the native plugin.

export async function initAds() {
  if (!Capacitor.isNativePlatform() || initialized) return;
  try {
    const { AdMob } = await import("@capacitor-community/admob");
    await AdMob.initialize({ initializeForTesting: BANNER_AD_ID === TEST_BANNER_ID });
    initialized = true;
  } catch {
    // Plugin not installed yet, or init failed — ads just won't show.
  }
}

export async function showBanner() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { AdMob, BannerAdPosition, BannerAdSize } = await import("@capacitor-community/admob");
    await AdMob.showBanner({
      adId: BANNER_AD_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      isTesting: BANNER_AD_ID === TEST_BANNER_ID,
    });
  } catch {
    // Never let an ad failure block the game screen.
  }
}

export async function hideBanner() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { AdMob } = await import("@capacitor-community/admob");
    await AdMob.hideBanner();
  } catch {}
}

/** Fire-and-forget interstitial. Premium users skip it entirely. */
export async function showInterstitialOnNewGame(isPremium: boolean) {
  if (isPremium || !Capacitor.isNativePlatform()) return;
  try {
    const { AdMob } = await import("@capacitor-community/admob");
    await AdMob.prepareInterstitial({
      adId: INTERSTITIAL_AD_ID,
      isTesting: INTERSTITIAL_AD_ID === TEST_INTERSTITIAL_ID,
    });
    await AdMob.showInterstitial();
  } catch {
    // Ad failed to load (offline, no fill, etc.) — the host still gets
    // their new game, just without an ad. Never block gameplay on this.
  }
}
