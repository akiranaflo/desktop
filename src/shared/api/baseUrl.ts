export const DEFAULT_PRIMARY_API = "https://api.tryliner.fun";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// the mobile build talks to a Liner server on the local network over plain
// http; set VITE_ALLOW_HTTP_API=1 for it instead of forcing https everywhere
const ALLOW_HTTP = import.meta.env.VITE_ALLOW_HTTP_API === "1";

export function isSecureBaseUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === "https:") return true;
    if (protocol !== "http:") return false;
    return LOOPBACK_HOSTS.has(hostname) || ALLOW_HTTP;
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl(envUrl: string | undefined): string {
  const clean = envUrl?.trim().replace(/\/+$/, "");
  return clean && isSecureBaseUrl(clean) ? clean : DEFAULT_PRIMARY_API;
}

const baseUrl = resolveApiBaseUrl(
  import.meta.env.VITE_API_URL as string | undefined,
);

export function getApiBaseUrl(): string {
  return baseUrl;
}
