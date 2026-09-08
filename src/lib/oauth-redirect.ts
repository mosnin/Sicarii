const FIRST_PARTY_NATIVE_CALLBACKS = new Set(["scalar://oauth/callback"]);

export function isAllowedPublicRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return true;
    }
    return FIRST_PARTY_NATIVE_CALLBACKS.has(url.toString());
  } catch {
    return false;
  }
}
