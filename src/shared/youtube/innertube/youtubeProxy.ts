/**
 * The mobile build runs in a browser, where direct calls to music.youtube.com
 * are blocked by CORS. When VITE_YOUTUBE_PROXY is set, InnerTube requests go
 * through the Liner server instead of talking to YouTube directly.
 */
const RAW = (import.meta.env.VITE_YOUTUBE_PROXY as string | undefined)?.trim();

export const YOUTUBE_PROXY = RAW ? RAW.replace(/\/+$/, "") : "";

export function youtubeUrl(origin: string, path: string): string {
  if (!YOUTUBE_PROXY) return `${origin}${path}`;
  try {
    const host = new URL(origin).hostname;
    const slot = host.startsWith("music.") ? "music" : "www";
    return `${YOUTUBE_PROXY}/${slot}${path}`;
  } catch {
    return `${origin}${path}`;
  }
}

export function visitorDataUrl(): string {
  return YOUTUBE_PROXY
    ? `${YOUTUBE_PROXY}/www/sw.js_data`
    : "https://www.youtube.com/sw.js_data";
}

/**
 * Browsers cannot read googlevideo responses directly (no CORS headers and a
 * cross-origin referer), so audio goes through the same server that proxies
 * InnerTube. Same-origin media keeps the Web Audio visualiser working.
 */
export function proxiedMediaUrl(url: string): string {
  if (!YOUTUBE_PROXY) return url;
  if (!/^https:\/\/[^/]+\.googlevideo\.com\//.test(url)) return url;
  return `${YOUTUBE_PROXY}/media?u=${encodeURIComponent(url)}`;
}
