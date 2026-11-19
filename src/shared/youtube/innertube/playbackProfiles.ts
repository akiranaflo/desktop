import type { InnertubeProfile } from "./innertubeClient";

export const TV_PROFILE: InnertubeProfile = {
  clientName: "TVHTML5",
  clientVersion: "7.20260707.07.00",
  clientIdHeader: "7",
  origin: "https://www.youtube.com",
  userAgent:
    "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)",
  includeUserAgentInContext: true,
  requiresJsPlayer: true,
};

export const TV_ACCOUNT_PROFILE: InnertubeProfile = {
  ...TV_PROFILE,
  acceptsOAuth: true,
};

export const VISIONOS_PROFILE: InnertubeProfile = {
  clientName: "VISIONOS",
  clientVersion: "1.02",
  clientIdHeader: "101",
  origin: "https://www.youtube.com",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  includeUserAgentInContext: true,
  extraContext: {
    osName: "visionOS",
    osVersion: "26.5.23O471",
    deviceMake: "Apple",
    deviceModel: "RealityDevice17,1",
  },
};

export const ANDROID_VR_PROFILE: InnertubeProfile = {
  clientName: "ANDROID_VR",
  clientVersion: "1.65.10",
  clientIdHeader: "28",
  origin: "https://www.youtube.com",
  userAgent:
    "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
  includeUserAgentInContext: true,
  extraContext: {
    osName: "Android",
    osVersion: "12L",
    deviceMake: "Oculus",
    deviceModel: "Quest 3",
    androidSdkVersion: 32,
  },
};

export const PLAYBACK_PROFILES: readonly InnertubeProfile[] = [
  TV_PROFILE,
  VISIONOS_PROFILE,
  ANDROID_VR_PROFILE,
];

/**
 * Mobile/web builds play through the server proxy and cannot mint PO tokens,
 * so they start with the phone clients that still hand out plain stream URLs.
 */
export const ANDROID_PROFILE: InnertubeProfile = {
  clientName: "ANDROID",
  clientVersion: "20.10.38",
  clientIdHeader: "3",
  origin: "https://www.youtube.com",
  userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
  includeUserAgentInContext: true,
  extraContext: {
    androidSdkVersion: 30,
    osName: "Android",
    osVersion: "11",
  },
};

export const IOS_PROFILE: InnertubeProfile = {
  clientName: "IOS",
  clientVersion: "20.10.4",
  clientIdHeader: "5",
  origin: "https://www.youtube.com",
  userAgent:
    "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)",
  includeUserAgentInContext: true,
  extraContext: {
    deviceMake: "Apple",
    deviceModel: "iPhone16,2",
    osName: "iPhone",
    osVersion: "18.1.0.22B83",
  },
};

export const WEB_PLAYBACK_PROFILES: readonly InnertubeProfile[] = [
  ANDROID_PROFILE,
  IOS_PROFILE,
  ...PLAYBACK_PROFILES,
];
